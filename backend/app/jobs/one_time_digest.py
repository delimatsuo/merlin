"""Send one-time job digest to inferred-preference users.

Handles users whose preferences were auto-created from application history.
Safety checks:
- Only sends to users with _inferred=True and email_frequency="one_time"
- Skips if user upgraded to real preferences (daily/weekly) — they get the regular digest
- Marks as sent so it never sends twice
"""

from datetime import datetime
from zoneinfo import ZoneInfo

import structlog

from app.jobs.matcher import match_user_jobs
from app.services.email import send_job_digest
from app.services.firestore import FirestoreService

_BRT = ZoneInfo("America/Sao_Paulo")
logger = structlog.get_logger()


async def send_one_time_digests(all_jobs: list[dict] | None = None) -> dict:
    """Match and send one-time digest to inferred users.

    Args:
        all_jobs: Pre-loaded job list from the batch pipeline (reuse, don't re-query)
    """
    fs = FirestoreService()
    today = datetime.now(_BRT).strftime("%Y-%m-%d")

    sent = 0
    skipped_active = 0
    skipped_already_sent = 0
    skipped_no_matches = 0
    total = 0

    async for user_doc in fs.db.collection("users").stream():
        uid = user_doc.id
        user_data = user_doc.to_dict() or {}

        # Get preferences
        pref_ref = (
            fs.db.collection("users").document(uid)
            .collection("jobPreferences").document("current")
        )
        pref_doc = await pref_ref.get()
        if not pref_doc.exists:
            continue

        prefs = pref_doc.to_dict()

        # Only process inferred one-time users
        if not prefs.get("_inferred"):
            continue
        if prefs.get("email_frequency") != "one_time":
            # User upgraded to daily/weekly — they're now active, skip
            skipped_active += 1
            continue

        total += 1

        # Check if already sent
        if prefs.get("_one_time_sent"):
            skipped_already_sent += 1
            continue

        # Match jobs for this user
        knowledge = {}
        knowledge_ref = (
            fs.db.collection("users").document(uid)
            .collection("knowledge").document("current")
        )
        knowledge_doc = await knowledge_ref.get()
        if knowledge_doc.exists:
            knowledge = knowledge_doc.to_dict() or {}

        ai_counter = {"count": 0}
        matches = await match_user_jobs(
            uid=uid,
            knowledge=knowledge,
            preferences=prefs,
            ai_call_counter=ai_counter,
            all_jobs=all_jobs,
        )

        if not matches:
            skipped_no_matches += 1
            logger.info("one_time_no_matches", uid_hash=uid[:8])
            # Still mark as sent so we don't retry
            await pref_ref.update({"_one_time_sent": today})
            continue

        # Send the digest
        email = user_data.get("email", "")
        name = user_data.get("name", "")
        if email:
            success = await send_job_digest(
                email=email,
                name=name,
                uid=uid,
                matches=matches,
                date=today,
                frequency="one_time",
            )
            if success:
                sent += 1
                # Mark as sent — idempotency gate
                await pref_ref.update({"_one_time_sent": today})
                # Also save matched jobs so they show on the dashboard
                await fs.save_matched_jobs(uid, today, matches, len(matches))
                logger.info("one_time_sent", uid_hash=uid[:8], matches=len(matches))
            else:
                logger.warning("one_time_send_failed", uid_hash=uid[:8])
        else:
            skipped_no_matches += 1

    stats = {
        "one_time_total": total,
        "one_time_sent": sent,
        "one_time_skipped_active": skipped_active,
        "one_time_skipped_already_sent": skipped_already_sent,
        "one_time_skipped_no_matches": skipped_no_matches,
    }
    logger.info("one_time_complete", **stats)
    return stats
