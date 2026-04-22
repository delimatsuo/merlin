"""One-off diagnostic: list every Firebase Auth user matching an email and
inspect their Firestore knowledge + queue entries.

Run: python scripts/debug_user_uids.py deli@ellaexecutivesearch.com
"""
import asyncio
import sys

import firebase_admin
from firebase_admin import auth, credentials, firestore_async


async def main(email: str) -> None:
    # Use ADC — requires `gcloud auth application-default login` on a
    # principal with roles/firebase.admin or roles/datastore.viewer on
    # merlin-489714.
    firebase_admin.initialize_app(
        credentials.ApplicationDefault(),
        {"projectId": "merlin-489714"},
    )

    # 1. Find every Firebase Auth user matching the email.
    try:
        direct = auth.get_user_by_email(email)
        print(f"get_user_by_email({email}) → uid={direct.uid} providers={[p.provider_id for p in direct.provider_data]}")
    except auth.UserNotFoundError:
        print(f"get_user_by_email({email}) → NOT FOUND")
        direct = None

    # Scan all users for any additional rows with the same email (duplicates
    # possible when "Multiple accounts per email" is enabled).
    matching_uids = []
    page = auth.list_users()
    while page:
        for u in page.users:
            provider_emails = [p.email for p in u.provider_data if p.email]
            if u.email and u.email.lower() == email.lower():
                matching_uids.append((u.uid, "primary", [p.provider_id for p in u.provider_data]))
            elif any(pe and pe.lower() == email.lower() for pe in provider_emails):
                matching_uids.append((u.uid, "via-provider", [p.provider_id for p in u.provider_data]))
        page = page.get_next_page()

    print(f"\nAll Firebase Auth users matching '{email}': {len(matching_uids)}")
    for uid, kind, providers in matching_uids:
        print(f"  uid={uid} match={kind} providers={providers}")

    # 2. For each UID, check knowledge doc + queue entries in Firestore.
    db = firestore_async.client()
    for uid, _kind, _providers in matching_uids:
        print(f"\n=== Firestore state for uid={uid} ===")

        knowledge_ref = db.collection("users").document(uid).collection("knowledge").document("current")
        knowledge_doc = await knowledge_ref.get()
        if knowledge_doc.exists:
            k = knowledge_doc.to_dict()
            print(f"  knowledge/current: EXISTS — skills={len(k.get('skills', []))} experience={len(k.get('experience', []))} lastUpdated={k.get('lastUpdated')}")
        else:
            print("  knowledge/current: NOT FOUND")

        queue_ref = db.collection("users").document(uid).collection("applicationQueue")
        count = 0
        active = 0
        statuses: dict[str, int] = {}
        async for entry in queue_ref.stream():
            count += 1
            st = (entry.to_dict() or {}).get("status", "unknown")
            statuses[st] = statuses.get(st, 0) + 1
            if st in {"pending", "running", "needs_attention"}:
                active += 1
        print(f"  applicationQueue: total={count} active={active} by_status={statuses}")

        profiles_ref = db.collection("users").document(uid).collection("profiles")
        pcount = 0
        async for _ in profiles_ref.stream():
            pcount += 1
        print(f"  profiles: {pcount}")


if __name__ == "__main__":
    email_arg = sys.argv[1] if len(sys.argv) > 1 else "deli@ellaexecutivesearch.com"
    asyncio.run(main(email_arg))
