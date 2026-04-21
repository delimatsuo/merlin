"""Inspect today's matchedJobs for a user — sources, posted_date spread."""
import asyncio, os, subprocess, sys
from collections import Counter
import httpx

PROJECT = os.getenv("GOOGLE_CLOUD_PROJECT", "merlin-489714")
REST_BASE = f"https://firestore.googleapis.com/v1/projects/{PROJECT}/databases/(default)/documents"

def tok():
    return subprocess.check_output(["gcloud", "auth", "application-default", "print-access-token"], text=True).strip()

async def main():
    email = sys.argv[1] if len(sys.argv) > 1 else "deli@ellaexecutivesearch.com"
    headers = {"Authorization": f"Bearer {tok()}"}

    async with httpx.AsyncClient(timeout=30, headers=headers) as client:
        # Find uid
        body = {"structuredQuery": {"from": [{"collectionId": "users"}],
            "where": {"fieldFilter": {"field": {"fieldPath": "email"},
                "op": "EQUAL", "value": {"stringValue": email}}}, "limit": 1}}
        r = await client.post(f"{REST_BASE}:runQuery", json=body)
        items = [i for i in r.json() if "document" in i]
        if not items:
            print(f"No user: {email}")
            return
        uid = items[0]["document"]["name"].split("/")[-1]

        from datetime import datetime
        from zoneinfo import ZoneInfo
        today = datetime.now(ZoneInfo("America/Sao_Paulo")).strftime("%Y-%m-%d")

        r = await client.get(f"{REST_BASE}/users/{uid}/matchedJobs/{today}")
        if r.status_code != 200:
            print(f"No matchedJobs/{today}")
            return

        matches = r.json().get("fields", {}).get("matches", {}).get("arrayValue", {}).get("values", [])
        print(f"Total matches: {len(matches)}\n")

        rows = []
        for m in matches:
            f = m.get("mapValue", {}).get("fields", {})
            def g(k):
                v = f.get(k, {}) or {}
                return v.get("stringValue") or ""
            rows.append({
                "source": g("source"),
                "company": g("company"),
                "title": g("title")[:70],
                "work_mode": g("work_mode"),
                "posted_date": g("posted_date")[:10],
                "ats_score": (f.get("ats_score", {}) or {}).get("integerValue", "0"),
            })

        # By source
        print("By source:", dict(Counter(r["source"] for r in rows)))
        # By work_mode
        print("By work_mode:", dict(Counter(r["work_mode"] or "(empty)" for r in rows)))
        # Posted_date histogram
        print("By posted_date (head 10):")
        for d, c in Counter(r["posted_date"] or "(empty)" for r in rows).most_common(10):
            print(f"  {d}: {c}")

        # Today+yesterday only
        from datetime import timedelta
        now = datetime.now(ZoneInfo("America/Sao_Paulo"))
        cutoff_24h = (now - timedelta(days=1)).strftime("%Y-%m-%d")
        recent = [r for r in rows if r["posted_date"] >= cutoff_24h]
        print(f"\nMatches with posted_date >= {cutoff_24h} (24h filter): {len(recent)}")

        print("\nFirst 10 matches:")
        for r in rows[:10]:
            print(f"  [{r['source']:<7}] [{r['work_mode']:<8}] [{r['posted_date'] or '—':<10}] score={r['ats_score']:<3} {r['company']:<25} {r['title']}")

asyncio.run(main())
