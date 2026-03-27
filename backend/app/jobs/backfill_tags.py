"""One-time migration: backfill category tags on existing jobs."""

import structlog

from app.jobs.matcher import _TITLE_TO_TAGS, _keyword_in, _normalize

logger = structlog.get_logger()


def _title_to_tags(title: str, seniority: str = "") -> list[str]:
    """Convert a job title to category tags using keyword mapping."""
    tags = set()
    normalized = _normalize(title)

    for keyword, keyword_tags in _TITLE_TO_TAGS.items():
        if _keyword_in(keyword, normalized):
            tags.update(keyword_tags)

    # Also check seniority field
    if seniority:
        seniority_lower = seniority.lower()
        if seniority_lower in _TITLE_TO_TAGS:
            tags.update(_TITLE_TO_TAGS[seniority_lower])

    # Default: if no tags found, assign "other"
    if not tags:
        tags.add("other")

    return list(tags)


async def backfill_job_tags() -> dict:
    """Backfill category tags on all jobs missing them."""
    from app.services.firestore import FirestoreService

    fs = FirestoreService()
    updated = 0
    skipped = 0
    already_tagged = 0

    async for doc in fs.db.collection("jobs").stream():
        data = doc.to_dict()

        # Skip if already has categories
        if data.get("categories"):
            already_tagged += 1
            continue

        title = data.get("title", "")
        seniority = data.get("seniority", "")

        if not title:
            skipped += 1
            continue

        tags = _title_to_tags(title, seniority)

        try:
            await doc.reference.update({"categories": tags})
            updated += 1
        except Exception as e:
            logger.warning("backfill_update_error", doc_id=doc.id, error=str(e))
            skipped += 1

    stats = {
        "updated": updated,
        "skipped": skipped,
        "already_tagged": already_tagged,
        "total": updated + skipped + already_tagged,
    }
    logger.info("backfill_complete", **stats)
    return stats
