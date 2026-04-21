"""Read user preferences and sample their job feed matches."""
import asyncio, os, subprocess, sys
import httpx

PROJECT = os.getenv("GOOGLE_CLOUD_PROJECT", "merlin-489714")
REST_BASE = f"https://firestore.googleapis.com/v1/projects/{PROJECT}/databases/(default)/documents"

def tok():
    return subprocess.check_output(["gcloud", "auth", "application-default", "print-access-token"], text=True).strip()

async def main():
    email = sys.argv[1] if len(sys.argv) > 1 else "deli@ellaexecutivesearch.com"
    headers = {"Authorization": f"Bearer {tok()}"}

    async with httpx.AsyncClient(timeout=30, headers=headers) as client:
        # Find user by email — list all users, filter client-side
        body = {
            "structuredQuery": {
                "from": [{"collectionId": "users"}],
                "where": {"fieldFilter": {
                    "field": {"fieldPath": "email"},
                    "op": "EQUAL",
                    "value": {"stringValue": email},
                }},
                "limit": 1,
            }
        }
        resp = await client.post(f"{REST_BASE}:runQuery", json=body)
        items = [i for i in resp.json() if "document" in i]
        if not items:
            print(f"No user with email {email}")
            return
        uid = items[0]["document"]["name"].split("/")[-1]
        print(f"User: {email}  uid: {uid}")

        # Try both common paths for preferences
        paths = [
            f"{REST_BASE}/users/{uid}/jobPreferences/current",
            f"{REST_BASE}/users/{uid}/preferences/current",
            f"{REST_BASE}/users/{uid}/jobPreferences/jobs",
        ]
        data = None
        found_path = None
        for p in paths:
            resp = await client.get(p)
            if resp.status_code == 200:
                data = resp.json()
                found_path = p
                break
        if not data:
            print("No preferences doc at any known path. Listing subcollections:")
            # List subcollections under user
            resp = await client.get(f"{REST_BASE}/users/{uid}")
            print(resp.text[:500])
            return
        print(f"Found preferences at: {found_path}")
        print("\n=== RAW preferences doc ===")
        import json
        print(json.dumps(data.get("fields", {}), indent=2, ensure_ascii=False)[:2000])
        fields = data.get("fields", {}) or {}
        def g(k, kind="stringValue"):
            v = fields.get(k, {}) or {}
            if "arrayValue" in v:
                return [x.get("stringValue", "?") for x in v["arrayValue"].get("values", [])]
            return v.get(kind) or v.get("integerValue") or v.get("booleanValue")

        print("\n=== jobPreferences ===")
        for k in ["desired_titles", "work_mode", "seniority", "locations", "last_updated"]:
            print(f"  {k}: {g(k)}")

        # matchedJobs for today
        from datetime import datetime
        from zoneinfo import ZoneInfo
        today = datetime.now(ZoneInfo("America/Sao_Paulo")).strftime("%Y-%m-%d")
        resp = await client.get(f"{REST_BASE}/users/{uid}/matchedJobs/{today}")
        if resp.status_code != 200:
            print(f"\nNo matchedJobs for {today}")
            return
        data = resp.json().get("fields", {}) or {}
        matches = data.get("matches", {}).get("arrayValue", {}).get("values", [])
        print(f"\n=== matchedJobs/{today} ===  ({len(matches)} matches)")
        by_source = {}
        for m in matches:
            f = m.get("mapValue", {}).get("fields", {})
            src = (f.get("source", {}) or {}).get("stringValue", "?")
            by_source[src] = by_source.get(src, 0) + 1
        for s, c in sorted(by_source.items(), key=lambda x: -x[1]):
            print(f"  {s}: {c}")

asyncio.run(main())
