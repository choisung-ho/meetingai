import logging
import re
from collections.abc import Mapping


LOG_FORMAT = "%(asctime)s | %(levelname)s | %(name)s | %(message)s"
DATE_FORMAT = "%Y-%m-%d %H:%M:%S"
SENSITIVE_LOG_KEYS = {
    "text", "raw_text", "summary", "summary_text", "action_items",
    "rediscussion_report", "result", "password", "password_confirm",
    "access_token", "refresh_token", "speaker_embedding", "audio",
    "audio_data", "transcript", "input", "body", "file", "storage_path",
    "signed_url", "signature",
}


class SensitiveDataFilter(logging.Filter):
    """Apply payload redaction to structured logging arguments by default."""

    def filter(self, record: logging.LogRecord) -> bool:
        if isinstance(record.args, Mapping):
            record.args = sanitize_log_payload(record.args)
        elif isinstance(record.args, tuple):
            record.args = tuple(
                sanitize_log_payload(value) if isinstance(value, (Mapping, list)) else value
                for value in record.args
            )
        return True


def get_logger(name: str) -> logging.Logger:
    logger = logging.getLogger(name)
    logger.setLevel(logging.INFO)

    if not logger.handlers:
        handler = logging.StreamHandler()
        handler.setFormatter(logging.Formatter(LOG_FORMAT, DATE_FORMAT))
        handler.addFilter(SensitiveDataFilter())
        logger.addHandler(handler)

    logger.propagate = False
    return logger


def mask_email(value: str | None) -> str | None:
    if value is None:
        return None
    if "@" not in value:
        return value

    local, domain = value.split("@", 1)
    if len(local) <= 2:
        masked_local = local[0] + "*"
    else:
        masked_local = local[:2] + "***"
    return f"{masked_local}@{domain}"


def mask_sensitive_text(value: str | None) -> str | None:
    if value is None:
        return None
    return re.sub(
        r"([A-Za-z0-9._%+-]{2})[A-Za-z0-9._%+-]*(@[A-Za-z0-9.-]+\.[A-Za-z]{2,})",
        r"\1***\2",
        value,
    )


def sanitize_log_payload(payload):
    """Redact transcript, AI, credential, and audio content before logging."""
    if isinstance(payload, Mapping):
        sanitized = {}
        for key, value in payload.items():
            key_text = str(key).lower()
            if key_text in SENSITIVE_LOG_KEYS:
                sanitized[key] = f"[REDACTED length={len(str(value))}]"
            else:
                sanitized[key] = sanitize_log_payload(value)
        return sanitized
    if isinstance(payload, list):
        return [sanitize_log_payload(value) for value in payload]
    return payload
