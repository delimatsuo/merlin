"""Find users whose jobPreferences were recently updated."""
import asyncio, os, subprocess
import httpx

PROJECT = os.getenv("GOOGLE_CLOUD_PROJECT", "merlin-489714")
REST_BASE = f"https://firestore.googleapis.com/v1/projects/{PROJECT}/databases/(default)/documents"

def tok():
    return subprocess.check_output(["gcloud", "auth", "application-default", "print-access-token"], text=True).strip()

async def main():
    headers = {"Authorization": f"Bearer {tok()}"}
    # Collection group query across all users' jobPreferences subcollections
    body = {
        "structuredQuery": {
            "from": [{"collectionId": "jobPreferences", "allDescendants": True}],
            "limit": 500,
        }
    }
    async with httpx.AsyncClient(timeout=60, headers=headers) as client:
        resp = await client.post(f"{REST_BASE}:runQuery", json=body)
        if resp.status_code != 200:
            print(f"ERR {resp.status_code}: {resp.text[:400]}")
            return
        docs = [i for i in resp.json() if "document" in i]
        print(f"Total jobPreferences docs: {len(docs)}\n")

        rows = []
        for item in docs:
            name = item["document"]["name"]  # projects/.../users/{uid}/jobPreferences/current
            parts = name.split("/")
            uid = parts[-3] if len(parts) > 3 else "?"
            fields = item["document"].get("fields", {}) or {}
            def g(k, kind="stringValue"):
                v = fields.get(k, {}) or {}
                if "arrayValue" in v:
                    return [x.get("stringValue", "?") for x in v["arrayValue"].get("values", [])]
                return v.get(kind) or ""
            rows.append({
                "uid": uid,
                "last_updated": g("last_updated"),
                "titles": g("desired_titles"),
                "work_mode": g("work_mode"),
            })
        rows.sort(key=lambda r: r["last_updated"] or "", reverse=True)

        print(f"{'Last updated':<35}  {'UID':<30}  Titles")
        print("-" * 110)
        for r in rows[:20]:
            lu = r["last_updated"][:25] or "—"
            print(f"{lu:<35}  {r['uid']:<30}  {r['titles']}")

        # Also: find the user by email for each uid of the top 5
        print("\n=== Top 5 users' emails ===")
        for r in rows[:5]:
            resp = await client.get(f"{REST_BASE}/users/{r['uid']}")
            if resp.status_code != 200:
                continue
            fields = resp.json().get("fields", {}) or {}
            email = (fields.get("email", {}) or {}).get("stringValue", "—")
            print(f"  {r['uid']:<30}  {email}")

asyncio.run(main())
