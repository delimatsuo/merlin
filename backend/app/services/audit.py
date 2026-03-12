"""Structured audit logging for LGPD compliance."""

import structlog

logger = structlog.get_logger()


def log_data_access(uid: str, action: str, resource: str, resource_id: str = ""):
    """Emit structured audit event for LGPD-relevant data operations."""
    logger.info(
        "audit_data_access",
        log_type="audit",
        uid=uid,
        action=action,
        resource=resource,
        resource_id=resource_id,
    )
