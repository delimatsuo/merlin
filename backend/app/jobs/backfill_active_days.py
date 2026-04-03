"""One-time backfill: compute activeDays + lastActivityAt from generationLog."""

from collections import defaultdict
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

import structlog

from app.services.firestore import FirestoreService

_BRT = ZoneInfo("America/Sao_Paulo")
logger = structlog.get_logger()


async def backfill_active_days() -> dict:
    """Scan generationLog, compute distinct active days per user, write to user docs."""
    fs = FirestoreService()

    # Phase 1: Scan all generation logs
    user_dates: dict[str, set[str]] = defaultdict(set)
    user_last_activity: dict[str, str] = {}
    total_logs = 0

    async for doc in fs.db.collection("generationLog").stream():
        data = doc.to_dict()
        uid = data.get("uid", "")
        created_at = data.get("createdAt", "")
        if not uid or not created_at:
            continue

        total_logs += 1

        # Convert to BRT date
        try:
            dt = datetime.fromisoformat(created_at.replace("Z", "+00:00"))
            brt_date = dt.astimezone(_BRT).strftime("%Y-%m-%d")
        except (ValueError, TypeError):
            continue

        user_dates[uid].add(brt_date)

        # Track latest activity
        if uid not in user_last_activity or created_at > user_last_activity[uid]:
            user_last_activity[uid] = created_at

    logger.info("backfill_scan_done", logs=total_logs, users=len(user_dates))

    # Phase 2: Write to user docs
    updated = 0
    for uid, dates in user_dates.items():
        active_days = len(dates)
        last_activity = user_last_activity.get(uid, "")
        try:
            await fs.db.collection("users").document(uid).update({
                "activeDays": active_days,
                "lastActivityAt": last_activity,
            })
            updated += 1
        except Exception as e:
            logger.warning("backfill_user_error", uid=uid[:8], error=str(e))

    logger.info("backfill_complete", updated=updated)
    return {"logs_scanned": total_logs, "users_updated": updated}
