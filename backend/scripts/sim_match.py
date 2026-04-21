"""Simulate what the matcher returns for a given user right now."""
import asyncio, os, subprocess, sys, json
from collections import Counter
import httpx

PROJECT = os.getenv("GOOGLE_CLOUD_PROJECT", "merlin-489714")
REST_BASE = f"https://firestore.googleapis.com/v1/projects/{PROJECT}/databases/(default)/documents"

def tok():
    return subprocess.check_output(["gcloud", "auth", "application-default", "print-access-token"], text=True).strip()

async def query_by_tag(client, tag: str, limit: int = 2000):
    body = {
        "structuredQuery": {
            "from": [{"collectionId": "jobs"}],
            "where": {"fieldFilter": {
                "field": {"fieldPath": "categories"},
                "op": "ARRAY_CONTAINS",
                "value": {"stringValue": tag},
            }},
            "limit": limit,
        }
    }
    resp = await client.post(f"{REST_BASE}:runQuery", json=body)
    if resp.status_code != 200:
        print(f"query failed: {resp.status_code} {resp.text[:300]}")
        return []
    out = []
    for item in resp.json():
        if "document" not in item:
            continue
        fields = item["document"].get("fields", {})
        def g(k, kind="stringValue"):
            v = fields.get(k, {}) or {}
            if "arrayValue" in v:
                return [x.get("stringValue", "?") for x in v["arrayValue"].get("values", [])]
            return v.get(kind) or ""
        out.append({
            "id": item["document"]["name"].split("/")[-1],
            "title": (g("title") or "")[:80],
            "company": g("company"),
            "source": g("source"),
            "work_mode": g("work_mode"),
            "categories": g("categories"),
            "posted_date": g("posted_date"),
            "extracted_at": (g("extracted_at") or "")[:10],
        })
    return out

async def main():
    # Current prefs (from UI the user showed)
    desired_titles = ["analista de recursos humanos"]
    work_modes = ["remote", "hybrid", "onsite"]
    seniority = ["mid", "senior"]

    # Mapped tag (from matcher's _TITLE_TO_DEPT — "rh" / "recursos humanos" / "analista de rh" → ["hr"])
    user_tags = ["hr"]
    print(f"Prefs: titles={desired_titles}  work_modes={work_modes}  seniority={seniority}")
    print(f"Derived user tags for array_contains_any: {user_tags}\n")

    headers = {"Authorization": f"Bearer {tok()}"}
    async with httpx.AsyncClient(timeout=60, headers=headers) as client:
        jobs = await query_by_tag(client, "hr", limit=2000)

    print(f"=== Total jobs with 'hr' category: {len(jobs)} ===\n")
    if not jobs:
        print("⚠ Zero jobs matched. Either no jobs have the 'hr' category yet, or the query failed.")
        return

    # Breakdown by source
    by_source = Counter(j["source"] or "?" for j in jobs)
    print("By source:")
    for s, c in by_source.most_common():
        print(f"  {s:<14} {c}")

    # Breakdown by work_mode
    print("\nBy work_mode:")
    by_mode = Counter(j["work_mode"] or "(empty)" for j in jobs)
    for m, c in by_mode.most_common():
        print(f"  {m:<14} {c}")

    # Apply filters like match_fast does
    acceptable_levels = {"mid", "senior", "entry", "lead"}  # Mid→{entry,mid,senior}, Senior→{mid,senior,lead}
    passed_work = [j for j in jobs if (j["work_mode"] or "onsite") in work_modes]
    print(f"\nAfter work_mode filter ({work_modes}): {len(passed_work)}")

    passed_level = []
    for j in passed_work:
        cats = set(j["categories"] or [])
        job_levels = cats & {"intern", "entry", "mid", "senior", "lead", "manager", "director", "executive"}
        if not job_levels:
            passed_level.append(j)  # benefit of doubt
        elif job_levels & acceptable_levels:
            passed_level.append(j)
    print(f"After seniority filter ({seniority}, accepts={acceptable_levels}): {len(passed_level)}")

    # Feed uses 14-day posted_date cutoff (or 24h if page uses ?days=1)
    from datetime import datetime, timedelta, timezone
    now = datetime.now(timezone.utc)
    cutoff_14 = (now - timedelta(days=14)).strftime("%Y-%m-%d")
    cutoff_24h = (now - timedelta(days=1)).strftime("%Y-%m-%d")
    passed_14d = [j for j in passed_level if not j["posted_date"] or j["posted_date"] >= cutoff_14]
    passed_24h = [j for j in passed_level if not j["posted_date"] or j["posted_date"] >= cutoff_24h]
    print(f"After 14-day cutoff ({cutoff_14}): {len(passed_14d)}")
    print(f"After 24h cutoff ({cutoff_24h}): {len(passed_24h)}")

    # Breakdown of survivors by source
    print("\nFinal matches by source (after all filters, 24h window):")
    final_by_source = Counter(j["source"] or "?" for j in passed_24h)
    for s, c in final_by_source.most_common():
        print(f"  {s:<14} {c}")

    print("\nSample 20 jobs that would reach the feed (14-day window):")
    for j in passed_14d[:20]:
        print(f"  [{j['source']:<10}] [{j['work_mode']:<8}] [{j['posted_date'] or '—':<10}] {j['company']:<25} {j['title']}")

asyncio.run(main())
