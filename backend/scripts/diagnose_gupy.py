"""Diagnose why Gupy jobs aren't appearing in the feed.

Uses Firestore REST API with ADC access token. Ensure ADC is fresh:
    gcloud auth application-default login

Run from backend/:
    source venv/bin/activate
    python -m scripts.diagnose_gupy
"""

import asyncio
import os
import subprocess
import sys

import httpx

PROJECT = os.getenv("GOOGLE_CLOUD_PROJECT", "merlin-489714")
REST_BASE = f"https://firestore.googleapis.com/v1/projects/{PROJECT}/databases/(default)/documents"


def get_adc_token() -> str:
    out = subprocess.check_output(
        ["gcloud", "auth", "application-default", "print-access-token"],
        text=True,
    )
    return out.strip()


async def count_source_via_rest(client: httpx.AsyncClient, source: str) -> int:
    """Count jobs by source — single-field filter avoids composite index need."""
    body = {
        "structuredQuery": {
            "from": [{"collectionId": "jobs"}],
            "where": {
                "fieldFilter": {
                    "field": {"fieldPath": "source"},
                    "op": "EQUAL",
                    "value": {"stringValue": source},
                }
            },
            "limit": 5000,
        }
    }
    resp = await client.post(f"{REST_BASE}:runQuery", json=body)
    if resp.status_code != 200:
        return -1
    return sum(1 for item in resp.json() if "document" in item)


async def latest_jobs_overall(client: httpx.AsyncClient, n: int = 30) -> list[dict]:
    """Pull most recent N jobs across all sources via extracted_at order."""
    body = {
        "structuredQuery": {
            "from": [{"collectionId": "jobs"}],
            "orderBy": [
                {"field": {"fieldPath": "extracted_at"}, "direction": "DESCENDING"}
            ],
            "limit": n,
        }
    }
    resp = await client.post(f"{REST_BASE}:runQuery", json=body)
    if resp.status_code != 200:
        print(f"  (latest-overall query failed: {resp.status_code})")
        return []
    out = []
    for item in resp.json():
        if "document" not in item:
            continue
        fields = item["document"].get("fields", {})
        def g(k: str) -> str:
            v = fields.get(k, {}) or {}
            return v.get("stringValue") or v.get("timestampValue") or ""
        out.append({
            "source": g("source") or "?",
            "extracted_at": (g("extracted_at") or "")[:19],
            "company": (g("company") or "")[:25],
            "title": (g("title") or "")[:60],
        })
    return out


async def count_by_source(token: str) -> None:
    print("\n=== 1. Firestore `jobs` by source ===")
    headers = {"Authorization": f"Bearer {token}"}
    async with httpx.AsyncClient(timeout=60, headers=headers) as client:
        print(f"{'Source':<14} {'Count':>8}")
        print("-" * 24)
        for s in ["gupy", "adzuna", "brazil_jobs", "infojobs", "vagascom", "linkedin", "apinfo"]:
            count = await count_source_via_rest(client, s)
            marker = "✗" if count == 0 else " "
            print(f"{marker} {s:<12} {count:>8}")

        print("\n   Latest 30 jobs overall (any source):")
        latest = await latest_jobs_overall(client, 30)
        if not latest:
            print("   (no documents returned)")
        else:
            for r in latest:
                print(f"   [{r['source']:<10}] {r['extracted_at']}  {r['company']:<25} {r['title']}")


async def check_batch_runs(token: str) -> None:
    print("\n=== 2. Recent batchRuns (daily scraper logs) ===")
    headers = {"Authorization": f"Bearer {token}"}
    # No order_by — just list all; we'll sort client-side by document ID (which is YYYY-MM-DD).
    body = {
        "structuredQuery": {
            "from": [{"collectionId": "batchRuns"}],
            "limit": 30,
        }
    }
    async with httpx.AsyncClient(timeout=30, headers=headers) as client:
        resp = await client.post(f"{REST_BASE}:runQuery", json=body)
    if resp.status_code != 200:
        print(f"✗ Failed to read batchRuns: {resp.status_code}: {resp.text[:200]}")
        return
    items = [i for i in resp.json() if "document" in i]
    if not items:
        print("(no batchRuns documents — daily scraper has never run, or collection is named differently)")
        return
    rows = []
    for item in items:
        name = item["document"]["name"].split("/")[-1]
        fields = item["document"].get("fields", {}) or {}
        def iv(k: str, kind: str = "integerValue") -> str:
            v = fields.get(k, {}) or {}
            return v.get(kind) or v.get("stringValue") or ""
        rows.append({
            "date": name,
            "status": iv("status", "stringValue"),
            "jobs_new": iv("jobs_new") or "0",
            "jobs_total": iv("jobs_total") or "0",
            "sources_ok": iv("sources_ok") or "?",
            "sources_failed": iv("sources_failed") or "?",
        })
    rows.sort(key=lambda r: r["date"], reverse=True)
    print(f"{'Date':<12}  {'Status':<12}  {'New':>6}  {'Total':>6}  {'Src OK/Fail'}")
    for r in rows[:7]:
        print(f"{r['date']:<12}  {r['status'] or '?':<12}  {r['jobs_new']:>6}  {r['jobs_total']:>6}  {r['sources_ok']}/{r['sources_failed']}")


def check_apify_config() -> str | None:
    print("\n=== 3. Apify API key ===")
    key = os.getenv("APIFY_API_KEY")
    if not key:
        try:
            from app.config import get_settings
            key = get_settings().apify_api_key
        except Exception as e:
            print(f"Could not load settings: {e}")

    if not key:
        print("✗ APIFY_API_KEY not set locally (OK — prod uses Cloud Run secret).")
        return None

    print(f"✓ APIFY_API_KEY present: {key[:6]}…{key[-4:]}")
    return key


async def check_apify_runs(api_key: str) -> None:
    print("\n=== 4. Recent Apify runs for zen-studio/gupy-jobs-scraper ===")
    actor_id = "zen-studio~gupy-jobs-scraper"
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.get(
            f"https://api.apify.com/v2/acts/{actor_id}/runs",
            params={"token": api_key, "limit": 10, "desc": "true"},
        )
    if resp.status_code != 200:
        print(f"✗ Apify API returned {resp.status_code}: {resp.text[:200]}")
        return
    runs = resp.json().get("data", {}).get("items", [])
    if not runs:
        print("✗ No recent runs of the Gupy actor.")
        return
    print(f"{'Started':<21} {'Status':<12} {'Dur':<8} {'Items':>6}")
    print("-" * 55)
    for r in runs:
        started = (r.get("startedAt") or "")[:19].replace("T", " ")
        status = r.get("status", "?")
        stats = r.get("stats") or {}
        dur = stats.get("runTimeSecs")
        duration = f"{dur}s" if dur is not None else "—"
        count = stats.get("datasetItemCount", "?")
        print(f"{started:<21} {status:<12} {duration:<8} {count:>6}")


async def sample_categories(token: str, source: str, n: int = 20) -> None:
    headers = {"Authorization": f"Bearer {token}"}
    body = {
        "structuredQuery": {
            "from": [{"collectionId": "jobs"}],
            "where": {
                "fieldFilter": {
                    "field": {"fieldPath": "source"},
                    "op": "EQUAL",
                    "value": {"stringValue": source},
                }
            },
            "limit": n,
        }
    }
    async with httpx.AsyncClient(timeout=30, headers=headers) as client:
        resp = await client.post(f"{REST_BASE}:runQuery", json=body)
    if resp.status_code != 200:
        print(f"  (failed: {resp.status_code})")
        return
    from collections import Counter
    cat_counter: Counter = Counter()
    has_categories = 0
    total = 0
    for item in resp.json():
        if "document" not in item:
            continue
        total += 1
        fields = item["document"].get("fields", {})
        cats_field = fields.get("categories", {})
        arr = cats_field.get("arrayValue", {}).get("values", [])
        if arr:
            has_categories += 1
            for v in arr:
                cat_counter[v.get("stringValue", "?")] += 1

    print(f"\n  {source}: {total} sampled, {has_categories} have categories array populated")
    if cat_counter:
        print(f"  Top categories: {cat_counter.most_common(15)}")
    else:
        print(f"  ⚠ No categories on sampled {source} jobs.")


async def main() -> None:
    print("=" * 60)
    print("  Merlin — Gupy pipeline diagnosis")
    print("=" * 60)

    try:
        token = get_adc_token()
    except subprocess.CalledProcessError as e:
        print(f"\n✗ Failed to get ADC token: {e}")
        print("  Run: gcloud auth application-default login")
        sys.exit(1)

    try:
        await count_by_source(token)
        await check_batch_runs(token)
        print("\n=== 3. Sampled categories per source (matcher filters on these) ===")
        await sample_categories(token, "gupy", n=50)
        await sample_categories(token, "adzuna", n=50)
    except Exception as e:
        print(f"\n✗ Firestore query failed: {e}")

    key = check_apify_config()
    if key:
        await check_apify_runs(key)


if __name__ == "__main__":
    asyncio.run(main())
