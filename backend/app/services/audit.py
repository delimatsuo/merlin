"""Structured audit logging for LGPD compliance."""

import uuid
from datetime import datetime, timezone

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


async def log_admin_action(
    admin_uid: str, action: str, target_uid: str = "", details: str = ""
):
    """Write immutable admin audit log to Firestore."""
    from app.services.firestore import FirestoreService

    logger.info(
        "admin_action",
        log_type="admin_audit",
        admin_uid=admin_uid,
        action=action,
        target_uid=target_uid,
        details=details,
    )

    try:
        fs = FirestoreService()
        doc_id = str(uuid.uuid4())
        await fs.db.collection("adminAuditLog").document(doc_id).set({
            "adminUid": admin_uid,
            "action": action,
            "targetUid": target_uid,
            "details": details,
            "createdAt": datetime.now(timezone.utc).isoformat(),
        })
    except Exception as e:
        logger.error("admin_audit_write_error", error=str(e))
