"""Infer job preferences from application history for users without preferences.

Scans users who have applications with jobAnalysis but no jobPreferences.
Creates preferences with desired_titles from their application history.
Sets email_frequency to "daily" so they get the morning digest.
"""

import structlog

from app.services.firestore import FirestoreService

logger = structlog.get_logger()


async def infer_and_create_preferences(dry_run: bool = True) -> dict:
    """Infer job preferences from applications for users without preferences.

    If dry_run=True, only reports what would be done.
    If dry_run=False, creates jobPreferences/current for each user.
    """
    fs = FirestoreService()

    inferred = []
    already_has_prefs = 0
    no_titles = 0
    total = 0

    async for doc in fs.db.collection("users").stream():
        total += 1
        uid = doc.id
        data = doc.to_dict()
        email = data.get("email", "")
        name = data.get("name", "")

        # Skip users who already have preferences
        prefs_ref = (
            fs.db.collection("users").document(uid)
            .collection("jobPreferences").document("current")
        )
        prefs_doc = await prefs_ref.get()
        if prefs_doc.exists and prefs_doc.to_dict().get("desired_titles"):
            already_has_prefs += 1
            continue

        # Scan applications for job titles
        titles = set()
        async for app_doc in (
            fs.db.collection("users").document(uid)
            .collection("applications").stream()
        ):
            app_data = app_doc.to_dict()
            analysis = app_data.get("jobAnalysis", {})
            title = analysis.get("title", "")
            if title and len(title) > 2:
                titles.add(title)

        if not titles:
            no_titles += 1
            continue

        title_list = list(titles)[:5]  # Max 5 titles

        if not dry_run:
            # Create preferences
            from datetime import datetime, timezone
            await prefs_ref.set({
                "desired_titles": title_list,
                "locations": [],
                "work_mode": ["remote", "hybrid", "onsite"],
                "seniority": [],
                "email_frequency": "daily",
                "email_digest": True,
                "min_score": 0,
                "last_updated": datetime.now(timezone.utc).isoformat(),
                "_inferred": True,  # Flag so we know this was auto-created
            })

        inferred.append({
            "uid": uid[:8],
            "email": email,
            "titles": title_list,
        })
        logger.info(
            "infer_prefs",
            uid_hash=uid[:8],
            email=email,
            titles=title_list,
            dry_run=dry_run,
        )

    logger.info(
        "infer_complete",
        total=total,
        already_has_prefs=already_has_prefs,
        inferred=len(inferred),
        no_titles=no_titles,
        dry_run=dry_run,
    )

    return {
        "total_users": total,
        "already_has_prefs": already_has_prefs,
        "inferred": len(inferred),
        "no_titles": no_titles,
        "dry_run": dry_run,
    }
