from sqlalchemy import create_engine
from sqlalchemy import text
from sqlalchemy.orm import sessionmaker, declarative_base
from dotenv import load_dotenv
import os

from app.core.config import settings

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")

if not DATABASE_URL:
    raise RuntimeError("DATABASE_URL is not set. Add it to your .env file.")

engine = create_engine(DATABASE_URL, pool_pre_ping=True)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

# Set during init_db. When True, document_chunks has a native pgvector column
# (embedding_vec) and similarity search runs inside Postgres; otherwise search
# falls back to Python-side cosine over the JSON embedding column.
PGVECTOR_ENABLED = False


def _try_enable_pgvector(connection) -> bool:
    from sqlalchemy.exc import DBAPIError

    from app.core.config import settings as app_settings

    dimension = app_settings.vector_dimension

    try:
        connection.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))

        # 임베딩 provider를 바꾸면 차원이 달라진다.
        # 기존 컬럼 차원이 다르면 인덱스/컬럼을 다시 만들어야 검색이 동작한다.
        current = connection.execute(
            text(
                "SELECT atttypmod FROM pg_attribute "
                "WHERE attrelid = 'document_chunks'::regclass AND attname = 'embedding_vec'"
            )
        ).scalar()

        if current is not None and current != dimension:
            connection.execute(
                text("DROP INDEX IF EXISTS ix_document_chunks_embedding_vec")
            )
            connection.execute(
                text("ALTER TABLE document_chunks DROP COLUMN IF EXISTS embedding_vec")
            )
            # 차원이 바뀌었으므로 기존 임베딩은 더 이상 비교할 수 없다.
            # 문서를 다시 처리(POST /documents/{id}/process)해야 검색에 잡힌다.
            connection.execute(text("DELETE FROM document_chunks"))

        connection.execute(
            text(
                "ALTER TABLE document_chunks "
                f"ADD COLUMN IF NOT EXISTS embedding_vec vector({dimension})"
            )
        )
        connection.execute(
            text(
                "CREATE INDEX IF NOT EXISTS ix_document_chunks_embedding_vec "
                "ON document_chunks USING hnsw (embedding_vec vector_cosine_ops)"
            )
        )
        return True
    except DBAPIError:
        return False


def init_db():
    global PGVECTOR_ENABLED

    import app.models  # noqa: F401
    from app.core.logger import get_logger

    Base.metadata.create_all(bind=engine)

    logger = get_logger(__name__)
    with engine.connect() as connection:
        with connection.begin():
            PGVECTOR_ENABLED = _try_enable_pgvector(connection)
    if PGVECTOR_ENABLED:
        logger.info("[DB] pgvector enabled: document_chunks.embedding_vec ready")
    else:
        logger.warning(
            "[DB] pgvector extension unavailable, similarity search falls back to "
            "Python cosine. Use the pgvector/pgvector:pg16 image to enable it."
        )

    with engine.begin() as connection:
        connection.execute(
            text(
                "INSERT INTO workspaces (name) "
                "SELECT 'Default Workspace' "
                "WHERE NOT EXISTS (SELECT 1 FROM workspaces)"
            )
        )
        connection.execute(
            text(
                "ALTER TABLE workspaces "
                "ADD COLUMN IF NOT EXISTS owner_user_id INTEGER REFERENCES auth(id)"
            )
        )
        connection.execute(
            text("CREATE INDEX IF NOT EXISTS ix_workspaces_owner_user_id ON workspaces(owner_user_id)")
        )
        connection.execute(
            text(
                "INSERT INTO workspace_members (workspace_id, user_id, role) "
                "SELECT id, owner_user_id, 'OWNER' "
                "FROM workspaces "
                "WHERE owner_user_id IS NOT NULL "
                "ON CONFLICT (workspace_id, user_id) DO NOTHING"
            )
        )
        connection.execute(
            text("UPDATE workspace_members SET role = upper(role)")
        )
        connection.execute(
            text(
                "UPDATE workspace_members SET role = 'MEMBER' "
                "WHERE role NOT IN ('VIEWER', 'MEMBER', 'ADMIN', 'OWNER')"
            )
        )
        connection.execute(
            text(
                "UPDATE workspace_members AS wm "
                "SET role = 'OWNER' "
                "FROM workspaces AS w "
                "WHERE wm.workspace_id = w.id "
                "AND w.owner_user_id IS NOT NULL "
                "AND wm.user_id = w.owner_user_id "
                "AND wm.role <> 'OWNER'"
            )
        )
        connection.execute(
            text(
                "UPDATE workspace_members AS wm "
                "SET role = 'MEMBER' "
                "FROM workspaces AS w "
                "WHERE wm.workspace_id = w.id "
                "AND w.owner_user_id IS NOT NULL "
                "AND wm.user_id <> w.owner_user_id "
                "AND wm.role = 'OWNER'"
            )
        )
        connection.execute(
            text(
                "ALTER TABLE workspace_invitations "
                "ADD COLUMN IF NOT EXISTS token VARCHAR(255)"
            )
        )
        connection.execute(
            text(
                "UPDATE workspace_invitations "
                "SET token = md5(random()::text || clock_timestamp()::text || id::text) "
                "WHERE token IS NULL"
            )
        )
        connection.execute(
            text("ALTER TABLE workspace_invitations ALTER COLUMN token SET NOT NULL")
        )
        connection.execute(
            text(
                "CREATE UNIQUE INDEX IF NOT EXISTS ix_workspace_invitations_token "
                "ON workspace_invitations(token)"
            )
        )
        connection.execute(
            text(
                "ALTER TABLE workspace_invitations "
                "ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP WITH TIME ZONE"
            )
        )
        connection.execute(
            text(
                "UPDATE workspace_invitations "
                "SET expires_at = created_at + INTERVAL '24 hours' "
                "WHERE expires_at IS NULL"
            )
        )
        connection.execute(
            text("ALTER TABLE workspace_invitations ALTER COLUMN expires_at SET NOT NULL")
        )
        connection.execute(
            text("UPDATE workspace_invitations SET role = upper(role)")
        )
        connection.execute(
            text(
                "UPDATE workspace_invitations "
                "SET role = 'MEMBER' "
                "WHERE role NOT IN ('MEMBER', 'ADMIN')"
            )
        )
        connection.execute(
            text("UPDATE workspace_invitations SET status = upper(status)")
        )
        connection.execute(
            text(
                "UPDATE workspace_invitations SET status = 'EXPIRED' "
                "WHERE status NOT IN ('PENDING', 'ACCEPTED', 'REJECTED', 'EXPIRED', 'CANCELLED')"
            )
        )
        connection.execute(
            text(
                "CREATE TABLE IF NOT EXISTS audit_logs ("
                "id SERIAL PRIMARY KEY, "
                "actor VARCHAR(255) NOT NULL, "
                "action VARCHAR(100) NOT NULL, "
                "resource_type VARCHAR(100) NOT NULL, "
                "resource_id VARCHAR(255) NOT NULL, "
                "workspace_id INTEGER NULL, "
                "created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()"
                ")"
            )
        )
        connection.execute(text("CREATE INDEX IF NOT EXISTS ix_audit_logs_actor ON audit_logs(actor)"))
        connection.execute(text("CREATE INDEX IF NOT EXISTS ix_audit_logs_action ON audit_logs(action)"))
        connection.execute(text("CREATE INDEX IF NOT EXISTS ix_audit_logs_resource_type ON audit_logs(resource_type)"))
        connection.execute(text("CREATE INDEX IF NOT EXISTS ix_audit_logs_workspace_id ON audit_logs(workspace_id)"))
        connection.execute(
            text(
                "ALTER TABLE utterances "
                "ADD COLUMN IF NOT EXISTS source_chunk_id VARCHAR(100)"
            )
        )
        connection.execute(
            text(
                "CREATE UNIQUE INDEX IF NOT EXISTS uq_utterance_stt_chunk "
                "ON utterances(stt_result_id, source_chunk_id) "
                "WHERE source_chunk_id IS NOT NULL"
            )
        )
        connection.execute(
            text(
                "CREATE UNIQUE INDEX IF NOT EXISTS uq_utterance_stt_sequence "
                "ON utterances(stt_result_id, sequence)"
            )
        )
        connection.execute(
            text(
                "ALTER TABLE meetings "
                "ADD COLUMN IF NOT EXISTS workspace_id INTEGER REFERENCES workspaces(id)"
            )
        )
        connection.execute(
            text(
                "UPDATE meetings "
                "SET workspace_id = (SELECT id FROM workspaces ORDER BY id ASC LIMIT 1) "
                "WHERE workspace_id IS NULL"
            )
        )
        connection.execute(
            text("ALTER TABLE meetings ALTER COLUMN workspace_id SET NOT NULL")
        )
        connection.execute(
            text(
                "ALTER TABLE meetings "
                "ADD COLUMN IF NOT EXISTS status VARCHAR(50) NOT NULL DEFAULT 'READY'"
            )
        )
        connection.execute(
            text("ALTER TABLE meetings ALTER COLUMN status SET DEFAULT 'READY'")
        )
        connection.execute(
            text(
                "ALTER TABLE meetings "
                "ADD COLUMN IF NOT EXISTS started_at TIMESTAMP WITH TIME ZONE"
            )
        )
        connection.execute(
            text(
                "ALTER TABLE meetings "
                "ADD COLUMN IF NOT EXISTS ended_at TIMESTAMP WITH TIME ZONE"
            )
        )
        connection.execute(
            text(
                "ALTER TABLE meetings "
                "ADD COLUMN IF NOT EXISTS audio_storage_path TEXT"
            )
        )
        connection.execute(
            text(
                "ALTER TABLE meetings "
                "ADD COLUMN IF NOT EXISTS audio_original_filename VARCHAR(255)"
            )
        )
        connection.execute(
            text(
                "UPDATE meetings SET status = upper(status)"
            )
        )
        connection.execute(
            text(
                "UPDATE meetings "
                "SET status = 'READY' "
                "WHERE status NOT IN ('READY', 'ACTIVE', 'ENDED')"
            )
        )
        connection.execute(
            text("DELETE FROM issues WHERE meeting_id IS NULL")
        )
        connection.execute(
            text("ALTER TABLE issues ALTER COLUMN meeting_id SET NOT NULL")
        )
        connection.execute(text("UPDATE issues SET status = upper(status)"))
        connection.execute(
            text(
                "UPDATE issues SET status = 'OPEN' "
                "WHERE status NOT IN ('OPEN', 'IN_PROGRESS', 'CLOSED')"
            )
        )
        connection.execute(text("UPDATE issues SET priority = upper(priority)"))
        connection.execute(
            text(
                "UPDATE issues SET priority = 'MEDIUM' "
                "WHERE priority NOT IN ('LOW', 'MEDIUM', 'HIGH')"
            )
        )
        connection.execute(
            text(
                "ALTER TABLE alerts "
                "ADD COLUMN IF NOT EXISTS meeting_id INTEGER REFERENCES meetings(id)"
            )
        )
        connection.execute(
            text(
                "UPDATE alerts "
                "SET meeting_id = issues.meeting_id "
                "FROM issues "
                "WHERE alerts.issue_id = issues.id "
                "AND alerts.meeting_id IS NULL"
            )
        )
        connection.execute(
            text("DELETE FROM alerts WHERE meeting_id IS NULL")
        )
        connection.execute(
            text("ALTER TABLE alerts ALTER COLUMN meeting_id SET NOT NULL")
        )
        connection.execute(
            text(
                "ALTER TABLE alerts "
                "ADD COLUMN IF NOT EXISTS status VARCHAR(50) NOT NULL DEFAULT 'PENDING'"
            )
        )
        connection.execute(
            text("ALTER TABLE alerts ALTER COLUMN status SET DEFAULT 'PENDING'")
        )
        connection.execute(
            text(
                "UPDATE alerts "
                "SET status = upper(status) "
                "WHERE status IN ('pending', 'acknowledged', 'resolved', 'dismissed')"
            )
        )
        connection.execute(
            text(
                "UPDATE alerts SET status = 'PENDING' "
                "WHERE status NOT IN ('PENDING', 'ACKNOWLEDGED', 'RESOLVED', 'DISMISSED')"
            )
        )
        connection.execute(
            text(
                "ALTER TABLE alerts "
                "ADD COLUMN IF NOT EXISTS level VARCHAR(50) NOT NULL DEFAULT 'info'"
            )
        )
        connection.execute(text("UPDATE alerts SET level = lower(level)"))
        connection.execute(
            text("UPDATE alerts SET level = 'info' WHERE level NOT IN ('info', 'warning', 'error')")
        )
        connection.execute(
            text("ALTER TABLE stt_results ALTER COLUMN status SET DEFAULT 'PENDING'")
        )
        connection.execute(
            text(
                "UPDATE stt_results "
                "SET status = upper(status) "
                "WHERE status IN ('pending', 'processing', 'completed', 'failed')"
            )
        )
        connection.execute(
            text(
                "UPDATE stt_results SET status = 'PENDING' "
                "WHERE status NOT IN ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED')"
            )
        )
        connection.execute(
            text("ALTER TABLE stt_results DROP COLUMN IF EXISTS document_id")
        )
        connection.execute(
            text("ALTER TABLE documents ALTER COLUMN status SET DEFAULT 'UPLOADED'")
        )
        connection.execute(
            text(
                "ALTER TABLE documents "
                "ADD COLUMN IF NOT EXISTS workspace_id INTEGER REFERENCES workspaces(id)"
            )
        )
        connection.execute(
            text(
                "UPDATE documents AS d "
                "SET workspace_id = m.workspace_id "
                "FROM meetings AS m "
                "WHERE d.meeting_id = m.id "
                "AND d.workspace_id IS NULL"
            )
        )
        connection.execute(
            text(
                "UPDATE documents "
                "SET workspace_id = (SELECT id FROM workspaces ORDER BY id ASC LIMIT 1) "
                "WHERE workspace_id IS NULL"
            )
        )
        connection.execute(
            text("ALTER TABLE documents ALTER COLUMN workspace_id SET NOT NULL")
        )
        connection.execute(
            text("ALTER TABLE documents ALTER COLUMN meeting_id DROP NOT NULL")
        )
        connection.execute(
            text("CREATE INDEX IF NOT EXISTS ix_documents_workspace_id ON documents(workspace_id)")
        )
        connection.execute(
            text("CREATE INDEX IF NOT EXISTS ix_documents_meeting_id ON documents(meeting_id)")
        )
        connection.execute(
            text(
                "UPDATE documents "
                "SET status = upper(status) "
                "WHERE status IN ('uploaded', 'processing', 'processed', 'failed')"
            )
        )
        connection.execute(
            text(
                "UPDATE documents SET status = 'UPLOADED' "
                "WHERE status NOT IN ('UPLOADED', 'PROCESSING', 'PROCESSED', 'FAILED')"
            )
        )
        connection.execute(
            text("ALTER TABLE utterances DROP COLUMN IF EXISTS meeting_id")
        )
        connection.execute(
            text("DELETE FROM utterances WHERE stt_result_id IS NULL")
        )
        connection.execute(
            text("ALTER TABLE utterances ALTER COLUMN stt_result_id SET NOT NULL")
        )
        cascade_foreign_keys = (
            ("utterances", "stt_result_id", "stt_results"),
            ("analysis_results", "meeting_id", "meetings"),
            ("analysis_results", "stt_result_id", "stt_results"),
            ("analysis_results", "utterance_id", "utterances"),
        )
        for table_name, column_name, referenced_table in cascade_foreign_keys:
            connection.execute(
                text(
                    "DO $$ DECLARE fk_name text; BEGIN "
                    "SELECT c.conname INTO fk_name "
                    "FROM pg_constraint c "
                    "JOIN pg_class t ON c.conrelid = t.oid "
                    "JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(c.conkey) "
                    f"WHERE t.relname = '{table_name}' AND c.contype = 'f' "
                    f"AND a.attname = '{column_name}' AND c.confdeltype <> 'c' "
                    "LIMIT 1; "
                    "IF fk_name IS NOT NULL THEN "
                    f"EXECUTE format('ALTER TABLE {table_name} DROP CONSTRAINT %I', fk_name); "
                    f"ALTER TABLE {table_name} ADD CONSTRAINT fk_{table_name}_{column_name}_cascade "
                    f"FOREIGN KEY ({column_name}) REFERENCES {referenced_table}(id) ON DELETE CASCADE; "
                    "END IF; END $$;"
                )
            )
        connection.execute(
            text(
                "WITH ranked AS ("
                "SELECT id, row_number() OVER ("
                "PARTITION BY workspace_id, invited_user_id ORDER BY id DESC"
                ") AS duplicate_rank "
                "FROM workspace_invitations WHERE status = 'PENDING'"
                ") "
                "UPDATE workspace_invitations AS wi SET status = 'CANCELLED' "
                "FROM ranked WHERE wi.id = ranked.id AND ranked.duplicate_rank > 1"
            )
        )
        connection.execute(
            text(
                "CREATE UNIQUE INDEX IF NOT EXISTS uq_workspace_invitations_pending_workspace_user "
                "ON workspace_invitations(workspace_id, invited_user_id) WHERE status = 'PENDING'"
            )
        )

        check_constraints = (
            (
                "workspace_members",
                "ck_workspace_members_role",
                "role IN ('VIEWER', 'MEMBER', 'ADMIN', 'OWNER')",
            ),
            (
                "workspace_invitations",
                "ck_workspace_invitations_role",
                "role IN ('MEMBER', 'ADMIN')",
            ),
            (
                "workspace_invitations",
                "ck_workspace_invitations_status",
                "status IN ('PENDING', 'ACCEPTED', 'REJECTED', 'EXPIRED', 'CANCELLED')",
            ),
            ("meetings", "ck_meetings_status", "status IN ('READY', 'ACTIVE', 'ENDED')"),
            ("issues", "ck_issues_status", "status IN ('OPEN', 'IN_PROGRESS', 'CLOSED')"),
            ("issues", "ck_issues_priority", "priority IN ('LOW', 'MEDIUM', 'HIGH')"),
            (
                "alerts",
                "ck_alerts_status",
                "status IN ('PENDING', 'ACKNOWLEDGED', 'RESOLVED', 'DISMISSED')",
            ),
            ("alerts", "ck_alerts_level", "level IN ('info', 'warning', 'error')"),
            (
                "stt_results",
                "ck_stt_results_status",
                "status IN ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED')",
            ),
            (
                "documents",
                "ck_documents_status",
                "status IN ('UPLOADED', 'PROCESSING', 'PROCESSED', 'FAILED')",
            ),
            ("documents", "ck_documents_file_size", "file_size >= 0"),
        )
        for table_name, constraint_name, condition in check_constraints:
            connection.execute(
                text(
                    "DO $$ BEGIN "
                    f"IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = '{constraint_name}') THEN "
                    f"ALTER TABLE {table_name} ADD CONSTRAINT {constraint_name} CHECK ({condition}); "
                    "END IF; END $$;"
                )
            )

        connection.execute(
            text(
                "UPDATE issues SET assignee_id = NULL "
                "WHERE assignee_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM auth WHERE auth.id = issues.assignee_id)"
            )
        )
        connection.execute(
            text(
                "UPDATE audit_logs SET workspace_id = NULL "
                "WHERE workspace_id IS NOT NULL "
                "AND NOT EXISTS (SELECT 1 FROM workspaces WHERE workspaces.id = audit_logs.workspace_id)"
            )
        )
        foreign_keys = (
            (
                "issues",
                "fk_issues_assignee_id_auth",
                "FOREIGN KEY (assignee_id) REFERENCES auth(id) ON DELETE SET NULL",
            ),
            (
                "audit_logs",
                "fk_audit_logs_workspace_id_workspaces",
                "FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE SET NULL",
            ),
        )
        for table_name, constraint_name, definition in foreign_keys:
            connection.execute(
                text(
                    "DO $$ BEGIN "
                    f"IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = '{constraint_name}') THEN "
                    f"ALTER TABLE {table_name} ADD CONSTRAINT {constraint_name} {definition}; "
                    "END IF; END $$;"
                )
            )
        if settings.ENABLE_WORKSPACE_RLS:
            connection.execute(text("ALTER TABLE meetings ENABLE ROW LEVEL SECURITY"))
            connection.execute(text("DROP POLICY IF EXISTS workspace_isolation_policy ON meetings"))
            connection.execute(
                text(
                    "CREATE POLICY workspace_isolation_policy ON meetings "
                    "FOR ALL "
                    "USING (workspace_id = NULLIF(current_setting('app.current_workspace_id', true), '')::integer) "
                    "WITH CHECK (workspace_id = NULLIF(current_setting('app.current_workspace_id', true), '')::integer)"
                )
            )


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
