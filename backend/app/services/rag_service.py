"""Document chunk storage and similarity search (RAG core).

Chunks always keep a JSON embedding for portability. When the pgvector
extension is available (PGVECTOR_ENABLED) the same embedding is mirrored to
document_chunks.embedding_vec and search runs natively in Postgres; otherwise
cosine similarity is computed in Python.
"""

import json

from sqlalchemy import text as sql_text
from sqlalchemy.orm import Session

from app import models
from app.core.config import settings
from app.core.logger import get_logger
from app.db import database
from app.services import document_parser
from app.services.embedding_service import cosine_similarity, embed_text
from app.state import assert_transition

logger = get_logger(__name__)


def _vector_literal(embedding: list[float]) -> str:
    return "[" + ",".join(f"{value:.8f}" for value in embedding) + "]"


def process_document(db: Session, document: models.Document) -> int:
    """Parse, chunk and embed a document. Returns the stored chunk count."""
    assert_transition("document", document.status, "PROCESSING")
    document.status = "PROCESSING"
    db.flush()

    try:
        raw_text = document_parser.extract_text(
            document.storage_path, document.original_filename
        )
        chunks = document_parser.chunk_text(raw_text)
        if not chunks:
            raise document_parser.DocumentParseError("Document has no extractable text")

        db.query(models.DocumentChunk).filter(
            models.DocumentChunk.document_id == document.id
        ).delete()
        db.flush()

        rows = []
        for index, chunk in enumerate(chunks, start=1):
            row = models.DocumentChunk(
                document_id=document.id,
                chunk_index=index,
                text=chunk,
                embedding=json.dumps(embed_text(chunk)),
            )
            rows.append(row)
        db.add_all(rows)
        db.flush()

        if database.PGVECTOR_ENABLED:
            for row in rows:
                db.execute(
                    sql_text(
                        "UPDATE document_chunks "
                        "SET embedding_vec = CAST(:vec AS vector) WHERE id = :id"
                    ),
                    {"vec": _vector_literal(json.loads(row.embedding)), "id": row.id},
                )

        assert_transition("document", document.status, "PROCESSED")
        document.status = "PROCESSED"
        db.commit()
        logger.info(
            "[RAG] [PROCESS] document processed document_id=%s chunks=%s pgvector=%s",
            document.id,
            len(rows),
            database.PGVECTOR_ENABLED,
        )
        return len(rows)
    except Exception:
        db.rollback()
        document = db.get(models.Document, document.id)
        if document is not None:
            document.status = "FAILED"
            db.commit()
        raise


def _search_document_chunks(
    db: Session, workspace_id: int, query_embedding: list[float], top_k: int
) -> list[dict]:
    if database.PGVECTOR_ENABLED:
        rows = db.execute(
            sql_text(
                "SELECT dc.id, dc.document_id, dc.chunk_index, dc.text, "
                "1 - (dc.embedding_vec <=> CAST(:vec AS vector)) AS score "
                "FROM document_chunks dc "
                "JOIN documents d ON d.id = dc.document_id "
                "WHERE d.workspace_id = :workspace_id AND dc.embedding_vec IS NOT NULL "
                "ORDER BY dc.embedding_vec <=> CAST(:vec AS vector) "
                "LIMIT :top_k"
            ),
            {
                "vec": _vector_literal(query_embedding),
                "workspace_id": workspace_id,
                "top_k": top_k,
            },
        ).all()
        return [
            {
                "type": "document_chunk",
                "id": row.id,
                "document_id": row.document_id,
                "chunk_index": row.chunk_index,
                "text": row.text,
                "score": round(float(row.score), 6),
            }
            for row in rows
        ]

    chunks = (
        db.query(models.DocumentChunk)
        .join(models.Document, models.Document.id == models.DocumentChunk.document_id)
        .filter(models.Document.workspace_id == workspace_id)
        .all()
    )
    scored = [
        {
            "type": "document_chunk",
            "id": chunk.id,
            "document_id": chunk.document_id,
            "chunk_index": chunk.chunk_index,
            "text": chunk.text,
            "score": round(cosine_similarity(query_embedding, json.loads(chunk.embedding)), 6),
        }
        for chunk in chunks
    ]
    scored.sort(key=lambda item: item["score"], reverse=True)
    return scored[:top_k]


def _search_utterances(
    db: Session, workspace_id: int, query_embedding: list[float], top_k: int
) -> list[dict]:
    utterances = (
        db.query(models.Utterance)
        .join(models.Utterance.stt_result)
        .join(models.SttResult.meeting)
        .filter(models.Meeting.workspace_id == workspace_id)
        .order_by(models.Utterance.id.desc())
        .limit(2000)
        .all()
    )
    scored = [
        {
            "type": "utterance",
            "id": utterance.id,
            "stt_result_id": utterance.stt_result_id,
            "speaker_label": utterance.speaker_label,
            "text": utterance.text,
            "score": round(cosine_similarity(query_embedding, embed_text(utterance.text)), 6),
        }
        for utterance in utterances
    ]
    scored.sort(key=lambda item: item["score"], reverse=True)
    return scored[:top_k]


def _search_topics(
    db: Session, workspace_id: int, query_embedding: list[float], top_k: int
) -> list[dict]:
    topics = (
        db.query(models.Topic)
        .join(models.Topic.meeting)
        .filter(models.Meeting.workspace_id == workspace_id)
        .all()
    )
    scored = [
        {
            "type": "topic",
            "id": topic.id,
            "meeting_id": topic.meeting_id,
            "status": topic.status,
            "proposed_by": topic.proposed_by,
            "text": topic.label,
            "score": round(cosine_similarity(query_embedding, json.loads(topic.embedding)), 6),
        }
        for topic in topics
    ]
    scored.sort(key=lambda item: item["score"], reverse=True)
    return scored[:top_k]


def search(
    db: Session,
    workspace_id: int,
    query: str,
    top_k: int | None = None,
    target: str = "documents",
) -> list[dict]:
    top_k = top_k or settings.RAG_SEARCH_TOP_K
    query_embedding = embed_text(query)
    results: list[dict] = []
    if target in ("documents", "all"):
        results.extend(_search_document_chunks(db, workspace_id, query_embedding, top_k))
    if target in ("utterances", "all"):
        results.extend(_search_utterances(db, workspace_id, query_embedding, top_k))
    if target in ("topics", "all"):
        results.extend(_search_topics(db, workspace_id, query_embedding, top_k))
    results.sort(key=lambda item: item["score"], reverse=True)
    return results[:top_k] if target != "all" else results[: top_k * 3]
