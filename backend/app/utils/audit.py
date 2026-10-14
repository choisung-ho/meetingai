from fastapi import BackgroundTasks

from app.core.logger import get_logger
from app.db.database import SessionLocal
from app.models.audit_log import AuditLog


logger = get_logger(__name__)


def _write_audit_log_to_db(
    actor: str | int,
    action: str,
    resource_type: str,
    resource_id: str | int,
    workspace_id: int | None = None,
):
    db = SessionLocal()
    try:
        log_entry = AuditLog(
            actor=str(actor),
            action=action.upper(),
            resource_type=resource_type.upper(),
            resource_id=str(resource_id),
            workspace_id=workspace_id,
        )
        db.add(log_entry)
        db.commit()
        logger.info(
            "[AUDIT] [CREATE] actor=%s action=%s resource_type=%s resource_id=%s workspace_id=%s",
            log_entry.actor,
            log_entry.action,
            log_entry.resource_type,
            log_entry.resource_id,
            log_entry.workspace_id,
        )
    except Exception as exc:
        db.rollback()
        logger.error("[AUDIT] [ERROR] failed to write audit log reason=%s", exc)
    finally:
        db.close()


def record_audit_log_safely(
    *,
    actor: str | int,
    action: str,
    resource_type: str,
    resource_id: str | int,
    workspace_id: int | None = None,
):
    _write_audit_log_to_db(
        actor=actor,
        action=action,
        resource_type=resource_type,
        resource_id=resource_id,
        workspace_id=workspace_id,
    )


def log_audit_action(
    background_tasks: BackgroundTasks,
    *,
    actor: str | int,
    action: str,
    resource_type: str,
    resource_id: str | int,
    workspace_id: int | None = None,
):
    background_tasks.add_task(
        _write_audit_log_to_db,
        actor=actor,
        action=action,
        resource_type=resource_type,
        resource_id=resource_id,
        workspace_id=workspace_id,
    )
