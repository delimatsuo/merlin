"""Firestore data access layer."""

import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

import structlog
from firebase_admin import firestore, storage, get_app
from google.cloud.firestore_v1.async_client import AsyncClient

logger = structlog.get_logger()

# Module-level async client singleton
_async_db: Optional[AsyncClient] = None


def _get_async_db() -> AsyncClient:
    global _async_db
    if _async_db is None:
        app = get_app()
        credentials = app.credential.get_credential()
        project = app.project_id
        _async_db = AsyncClient(project=project, credentials=credentials)
    return _async_db


class FirestoreService:
    """Handles all Firestore and Cloud Storage operations."""

    @property
    def db(self) -> AsyncClient:
        return _get_async_db()

    # --- Profile Operations ---

    async def save_profile(
        self,
        uid: str,
        raw_text: str,
        structured_data: dict,
        file_url: str = "",
    ) -> str:
        """Save a parsed resume profile."""
        profile_id = str(uuid.uuid4())
        now = datetime.now(timezone.utc).isoformat()

        doc_ref = self.db.collection("users").document(uid).collection("profiles").document(profile_id)
        await doc_ref.set({
            "rawResumeText": raw_text,
            "structuredData": structured_data,
            "enrichedProfile": None,
            "voiceAnswers": None,
            "fileUrl": file_url,
            "status": "parsed",
            "createdAt": now,
            "updatedAt": now,
        })

        return profile_id

    async def get_profile(self, uid: str, profile_id: str) -> Optional[dict]:
        """Get a specific profile."""
        doc_ref = self.db.collection("users").document(uid).collection("profiles").document(profile_id)
        doc = await doc_ref.get()
        if doc.exists:
            data = doc.to_dict()
            data["id"] = doc.id
            return data
        return None

    async def get_latest_profile(self, uid: str) -> Optional[dict]:
        """Get the most recent profile for a user."""
        query = (
            self.db.collection("users").document(uid).collection("profiles")
            .order_by("createdAt", direction=firestore.Query.DESCENDING)
            .limit(1)
        )
        docs = []
        async for doc in query.stream():
            data = doc.to_dict()
            data["id"] = doc.id
            docs.append(data)

        return docs[0] if docs else None

    async def update_profile(self, uid: str, profile_id: str, data: dict) -> None:
        """Update profile structured data."""
        doc_ref = self.db.collection("users").document(uid).collection("profiles").document(profile_id)
        await doc_ref.update({
            "structuredData": data,
            "updatedAt": datetime.now(timezone.utc).isoformat(),
        })

    async def update_enriched_profile(
        self, uid: str, profile_id: str, voice_data: dict
    ) -> None:
        """Update profile with enriched voice interview data."""
        doc_ref = self.db.collection("users").document(uid).collection("profiles").document(profile_id)
        await doc_ref.update({
            "enrichedProfile": voice_data,
            "voiceAnswers": voice_data,
            "status": "enriched",
            "updatedAt": datetime.now(timezone.utc).isoformat(),
        })

    async def delete_profile(self, uid: str, profile_id: str) -> None:
        """Delete a profile."""
        doc_ref = self.db.collection("users").document(uid).collection("profiles").document(profile_id)
        await doc_ref.delete()

    # --- Company Cache Operations ---

    async def get_company_cache(self, cache_key: str) -> Optional[dict]:
        """Get cached company research."""
        doc_ref = self.db.collection("companyCache").document(cache_key)
        doc = await doc_ref.get()
        if doc.exists:
            return doc.to_dict()
        return None

    async def save_company_cache(self, cache_key: str, research_data: dict) -> None:
        """Save company research to cache with 30-day TTL."""
        now = datetime.now(timezone.utc)
        expires = now + timedelta(days=30)
        doc_ref = self.db.collection("companyCache").document(cache_key)
        await doc_ref.set({
            "researchData": research_data,
            "searchedAt": now.isoformat(),
            "expiresAt": expires.isoformat(),
        })

    async def update_profile_enrichment(self, uid: str, profile_id: str, enriched_data: dict) -> None:
        """Update profile with company research enrichment."""
        doc_ref = self.db.collection("users").document(uid).collection("profiles").document(profile_id)
        await doc_ref.update({
            "enrichedProfile": enriched_data,
            "status": "enriched",
            "updatedAt": datetime.now(timezone.utc).isoformat(),
        })

    # --- Application Operations ---

    async def save_application(
        self,
        uid: str,
        profile_id: str,
        job_description: str,
        analysis: dict,
        skills_matrix: list,
        ats_score: Optional[float],
        ats_keywords: list,
    ) -> str:
        """Save a job application analysis."""
        application_id = str(uuid.uuid4())
        now = datetime.now(timezone.utc).isoformat()

        doc_ref = (
            self.db.collection("users").document(uid)
            .collection("applications").document(application_id)
        )
        await doc_ref.set({
            "profileId": profile_id,
            "jobDescriptionText": job_description,
            "jobAnalysis": analysis,
            "skillsMatrix": skills_matrix,
            "atsScore": ats_score,
            "atsKeywords": ats_keywords,
            "createdAt": now,
        })

        return application_id

    async def get_user_applications(self, uid: str) -> list[dict]:
        """Get all applications for a user, newest first."""
        query = (
            self.db.collection("users").document(uid).collection("applications")
            .order_by("createdAt", direction=firestore.Query.DESCENDING)
            .limit(10)
        )
        results = []
        async for doc in query.stream():
            data = doc.to_dict()
            data["id"] = doc.id
            results.append(data)
        return results

    async def get_application(self, uid: str, application_id: str) -> Optional[dict]:
        """Get a specific application."""
        doc_ref = (
            self.db.collection("users").document(uid)
            .collection("applications").document(application_id)
        )
        doc = await doc_ref.get()
        if doc.exists:
            data = doc.to_dict()
            data["id"] = doc.id
            return data
        return None

    # --- Resume Version Operations ---

    async def save_tailored_resume(
        self,
        uid: str,
        application_id: str,
        resume_content: str,
        cover_letter: str,
        ats_score: float,
    ) -> str:
        """Save a tailored resume version."""
        version_id = str(uuid.uuid4())
        now = datetime.now(timezone.utc).isoformat()

        doc_ref = (
            self.db.collection("users").document(uid)
            .collection("applications").document(application_id)
            .collection("resumes").document(version_id)
        )
        await doc_ref.set({
            "resumeContent": resume_content,
            "coverLetterText": cover_letter,
            "atsScore": ats_score,
            "docxFileUrl": None,
            "createdAt": now,
        })

        return version_id

    async def get_latest_resume(self, uid: str, application_id: str) -> Optional[dict]:
        """Get the latest resume version for an application."""
        query = (
            self.db.collection("users").document(uid)
            .collection("applications").document(application_id)
            .collection("resumes")
            .order_by("createdAt", direction=firestore.Query.DESCENDING)
            .limit(1)
        )
        docs = []
        async for doc in query.stream():
            data = doc.to_dict()
            data["id"] = doc.id
            docs.append(data)

        return docs[0] if docs else None

    # --- Voice Session Operations ---

    async def create_voice_session(
        self, uid: str, profile_id: str, questions: list[str]
    ) -> str:
        """Create a new voice session."""
        session_id = str(uuid.uuid4())
        now = datetime.now(timezone.utc).isoformat()

        doc_ref = self.db.collection("voiceSessions").document(session_id)
        await doc_ref.set({
            "userId": uid,
            "profileId": profile_id,
            "questions": questions,
            "answers": [],
            "status": "pending",
            "createdAt": now,
        })

        return session_id

    async def get_voice_session(self, session_id: str) -> Optional[dict]:
        """Get a voice session."""
        doc_ref = self.db.collection("voiceSessions").document(session_id)
        doc = await doc_ref.get()
        if doc.exists:
            return doc.to_dict()
        return None

    async def save_voice_answer(
        self, session_id: str, question_index: int, answer: str
    ) -> None:
        """Save a voice answer checkpoint."""
        doc_ref = self.db.collection("voiceSessions").document(session_id)
        doc = await doc_ref.get()
        if doc.exists:
            data = doc.to_dict()
            answers = data.get("answers", [])
            # Extend answers list if needed
            while len(answers) <= question_index:
                answers.append("")
            answers[question_index] = answer
            await doc_ref.update({
                "answers": answers,
                "status": "in_progress",
            })

    async def update_voice_session_status(
        self, session_id: str, status: str
    ) -> None:
        """Update voice session status."""
        doc_ref = self.db.collection("voiceSessions").document(session_id)
        await doc_ref.update({"status": status})

    # --- Usage Tracking ---

    async def get_daily_usage(self, uid: str) -> int:
        """Get today's usage count for a user."""
        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        doc_ref = self.db.collection("users").document(uid)
        doc = await doc_ref.get()

        if doc.exists:
            data = doc.to_dict()
            usage = data.get("dailyUsage", {})
            if usage.get("date") == today:
                return usage.get("tailorCount", 0)

        return 0

    async def increment_daily_usage(self, uid: str) -> None:
        """Increment daily usage counter."""
        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        doc_ref = self.db.collection("users").document(uid)
        doc = await doc_ref.get()

        if doc.exists:
            data = doc.to_dict()
            usage = data.get("dailyUsage", {})
            if usage.get("date") == today:
                count = usage.get("tailorCount", 0) + 1
            else:
                count = 1
            await doc_ref.update({
                "dailyUsage": {"tailorCount": count, "date": today}
            })
        else:
            await doc_ref.set({
                "dailyUsage": {"tailorCount": 1, "date": today},
                "createdAt": datetime.now(timezone.utc).isoformat(),
            })

    # --- File Operations ---

    async def upload_resume_file(
        self, uid: str, filename: str, content: bytes
    ) -> str:
        """Upload original resume to Cloud Storage."""
        timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
        blob_path = f"uploads/{uid}/{timestamp}_{filename}"

        bucket = storage.bucket()
        blob = bucket.blob(blob_path)
        blob.upload_from_string(content, content_type="application/octet-stream")

        return blob_path

    async def upload_and_sign(
        self,
        uid: str,
        filename: str,
        content: bytes,
        content_type: str,
    ) -> tuple[str, str]:
        """Upload file and return a signed URL."""
        from datetime import timedelta

        timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
        blob_path = f"exports/{uid}/{timestamp}_{filename}"

        bucket = storage.bucket()
        blob = bucket.blob(blob_path)
        blob.upload_from_string(content, content_type=content_type)

        expiry = timedelta(minutes=15)
        signed_url = blob.generate_signed_url(expiration=expiry, method="GET")
        expires_at = (datetime.now(timezone.utc) + expiry).isoformat()

        return signed_url, expires_at

    # --- LGPD Operations ---

    async def export_user_data(self, uid: str) -> dict:
        """Export all user data (LGPD right to access)."""
        data = {"uid": uid, "profiles": [], "applications": [], "voiceSessions": []}

        # Profiles
        profiles_ref = self.db.collection("users").document(uid).collection("profiles")
        async for doc in profiles_ref.stream():
            profile = doc.to_dict()
            profile["id"] = doc.id
            data["profiles"].append(profile)

        # Applications
        apps_ref = self.db.collection("users").document(uid).collection("applications")
        async for doc in apps_ref.stream():
            app = doc.to_dict()
            app["id"] = doc.id
            data["applications"].append(app)

        # Voice sessions
        sessions_ref = self.db.collection("voiceSessions").where("userId", "==", uid)
        async for doc in sessions_ref.stream():
            session = doc.to_dict()
            session["id"] = doc.id
            data["voiceSessions"].append(session)

        return data

    async def delete_all_user_data(self, uid: str) -> None:
        """Delete all user data (LGPD right to deletion)."""
        # Delete profiles
        profiles_ref = self.db.collection("users").document(uid).collection("profiles")
        async for doc in profiles_ref.stream():
            # Delete PII subcollection
            pii_ref = doc.reference.collection("pii")
            async for pii_doc in pii_ref.stream():
                await pii_doc.reference.delete()
            await doc.reference.delete()

        # Delete applications and their resumes
        apps_ref = self.db.collection("users").document(uid).collection("applications")
        async for doc in apps_ref.stream():
            resumes_ref = doc.reference.collection("resumes")
            async for resume_doc in resumes_ref.stream():
                await resume_doc.reference.delete()
            await doc.reference.delete()

        # Delete voice sessions
        sessions_ref = self.db.collection("voiceSessions").where("userId", "==", uid)
        async for doc in sessions_ref.stream():
            await doc.reference.delete()

        # Delete user document
        await self.db.collection("users").document(uid).delete()

        # Delete Cloud Storage files
        try:
            bucket = storage.bucket()
            blobs = bucket.list_blobs(prefix=f"uploads/{uid}/")
            for blob in blobs:
                blob.delete()
            blobs = bucket.list_blobs(prefix=f"exports/{uid}/")
            for blob in blobs:
                blob.delete()
        except Exception as e:
            logger.error("storage_cleanup_error", uid=uid, error=str(e))
