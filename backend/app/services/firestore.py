"""Firestore data access layer."""

import asyncio
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional
from zoneinfo import ZoneInfo

import structlog
from firebase_admin import auth as firebase_auth, firestore, storage, get_app
from google.cloud.firestore_v1 import async_transactional
from google.cloud.firestore_v1.async_client import AsyncClient
from google.cloud.firestore_v1.base_query import FieldFilter

logger = structlog.get_logger()

_BRT = ZoneInfo("America/Sao_Paulo")


def _brazil_today() -> str:
    """Return today's date string in Brazil timezone (for stats bucketing)."""
    return datetime.now(_BRT).strftime("%Y-%m-%d")


def _brazil_now() -> datetime:
    """Return current datetime in Brazil timezone (for stats bucketing)."""
    return datetime.now(_BRT)

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
        user_email: str = "",
        user_name: str = "",
    ) -> str:
        """Save a parsed resume profile."""
        profile_id = str(uuid.uuid4())
        now = datetime.now(timezone.utc).isoformat()

        # Ensure user doc exists with email/name for admin queries
        if user_email or user_name:
            await self.ensure_user_doc(uid, email=user_email, name=user_name)

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

        # Increment denormalized counter
        await self._increment_user_stat(uid, "profileCount", 1)

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

    async def list_all_profiles(self, uid: str) -> list[dict]:
        """List all profiles for a user, newest first."""
        query = (
            self.db.collection("users").document(uid).collection("profiles")
            .order_by("createdAt", direction=firestore.Query.DESCENDING)
        )
        results = []
        async for doc in query.stream():
            data = doc.to_dict()
            data["id"] = doc.id
            # Return summary fields only
            results.append({
                "id": data["id"],
                "name": data.get("structuredData", {}).get("name", ""),
                "status": data.get("status", ""),
                "fileUrl": data.get("fileUrl", ""),
                "createdAt": data.get("createdAt", ""),
            })
        return results

    async def update_profile(self, uid: str, profile_id: str, data: dict) -> None:
        """Update profile structured data."""
        doc_ref = self.db.collection("users").document(uid).collection("profiles").document(profile_id)
        await doc_ref.update({
            "structuredData": data,
            "recommendations": None,
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
            "recommendations": None,
            "updatedAt": datetime.now(timezone.utc).isoformat(),
        })

    async def delete_profile(self, uid: str, profile_id: str) -> None:
        """Delete a profile."""
        doc_ref = self.db.collection("users").document(uid).collection("profiles").document(profile_id)
        await doc_ref.delete()
        await self._increment_user_stat(uid, "profileCount", -1)

    # --- Knowledge File Operations ---

    async def get_candidate_knowledge(self, uid: str) -> Optional[dict]:
        """Get the candidate's knowledge file."""
        doc_ref = (
            self.db.collection("users").document(uid)
            .collection("knowledge").document("current")
        )
        doc = await doc_ref.get()
        if doc.exists:
            return doc.to_dict()
        return None

    async def save_candidate_knowledge(self, uid: str, knowledge: dict) -> None:
        """Save or overwrite the candidate's knowledge file."""
        now = datetime.now(timezone.utc).isoformat()
        knowledge["lastUpdated"] = now

        doc_ref = (
            self.db.collection("users").document(uid)
            .collection("knowledge").document("current")
        )
        await doc_ref.set(knowledge)

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

    # --- Recommendations Operations ---

    async def save_recommendations(
        self, uid: str, profile_id: str, recommendations: list[dict], locale: str
    ) -> None:
        """Store recommendations as a field on the profile doc."""
        doc_ref = self.db.collection("users").document(uid).collection("profiles").document(profile_id)
        await doc_ref.set({
            "recommendations": recommendations,
            "recommendationsLocale": locale,
            "recommendationsGeneratedAt": datetime.now(timezone.utc).isoformat(),
        }, merge=True)

    async def get_recommendations(self, uid: str, profile_id: str) -> Optional[dict]:
        """Read recommendations from the profile doc. Returns dict with recommendations, locale, and timestamp."""
        doc_ref = self.db.collection("users").document(uid).collection("profiles").document(profile_id)
        doc = await doc_ref.get()
        if doc.exists:
            data = doc.to_dict()
            if data.get("recommendations"):
                return {
                    "recommendations": data["recommendations"],
                    "locale": data.get("recommendationsLocale", ""),
                    "generatedAt": data.get("recommendationsGeneratedAt", ""),
                }
        return None

    # --- LinkedIn Profile Operations ---

    async def save_linkedin_profile(
        self, uid: str, raw_text: str, structured: dict, source: str
    ) -> None:
        """Save a LinkedIn profile, clearing any existing suggestions (cache invalidation)."""
        now = datetime.now(timezone.utc).isoformat()
        doc_ref = (
            self.db.collection("users").document(uid)
            .collection("linkedin").document("current")
        )
        await doc_ref.set({
            "rawText": raw_text,
            "structured": structured,
            "suggestions": None,
            "suggestionsLocale": None,
            "suggestionsGeneratedAt": None,
            "crossRef": None,
            "source": source,
            "createdAt": now,
            "updatedAt": now,
        })

    async def get_linkedin_profile(self, uid: str) -> Optional[dict]:
        """Get the current LinkedIn profile."""
        doc_ref = (
            self.db.collection("users").document(uid)
            .collection("linkedin").document("current")
        )
        doc = await doc_ref.get()
        if doc.exists:
            return doc.to_dict()
        return None

    async def save_linkedin_suggestions(
        self, uid: str, suggestions: list[dict], cross_ref: list[dict], locale: str
    ) -> None:
        """Save LinkedIn analysis suggestions to the current doc."""
        doc_ref = (
            self.db.collection("users").document(uid)
            .collection("linkedin").document("current")
        )
        await doc_ref.update({
            "suggestions": suggestions,
            "crossRef": cross_ref,
            "suggestionsLocale": locale,
            "suggestionsGeneratedAt": datetime.now(timezone.utc).isoformat(),
            "updatedAt": datetime.now(timezone.utc).isoformat(),
        })

    async def get_linkedin_suggestions(self, uid: str) -> Optional[dict]:
        """Read LinkedIn suggestions from the current doc."""
        doc_ref = (
            self.db.collection("users").document(uid)
            .collection("linkedin").document("current")
        )
        doc = await doc_ref.get()
        if doc.exists:
            data = doc.to_dict()
            if data.get("suggestions"):
                return {
                    "suggestions": data["suggestions"],
                    "crossRef": data.get("crossRef", []),
                    "locale": data.get("suggestionsLocale", ""),
                    "generatedAt": data.get("suggestionsGeneratedAt", ""),
                }
        return None

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
            "status": "analyzed",
            "createdAt": now,
        })

        await self._increment_user_stat(uid, "applicationCount", 1)

        return application_id

    async def get_user_applications(self, uid: str, limit: int = 20, start_after: str = "") -> list[dict]:
        """Get applications for a user, newest first. Cursor-based pagination."""
        query = (
            self.db.collection("users").document(uid).collection("applications")
            .order_by("createdAt", direction=firestore.Query.DESCENDING)
            .limit(limit)
        )

        if start_after:
            # Cursor-based pagination
            cursor_doc = await (
                self.db.collection("users").document(uid)
                .collection("applications").document(start_after)
            ).get()
            if cursor_doc.exists:
                query = query.start_after(cursor_doc)

        results = []
        async for doc in query.stream():
            data = doc.to_dict()
            data["id"] = doc.id
            # Count resume versions
            resumes_ref = doc.reference.collection("resumes")
            version_count = 0
            async for _ in resumes_ref.select([]).stream():
                version_count += 1
            data["versionCount"] = version_count
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

    async def delete_application(self, uid: str, application_id: str) -> None:
        """Delete an application with cascade: resumes subcollection + storage files."""
        app_ref = (
            self.db.collection("users").document(uid)
            .collection("applications").document(application_id)
        )

        # Delete resumes subcollection
        resumes_ref = app_ref.collection("resumes")
        async for doc in resumes_ref.stream():
            # Delete storage file if exists
            data = doc.to_dict()
            file_url = data.get("docxFileUrl")
            if file_url:
                try:
                    bucket = storage.bucket()
                    blob = bucket.blob(file_url)
                    blob.delete()
                except Exception:
                    pass
            await doc.reference.delete()

        # Delete application doc
        await app_ref.delete()
        await self._increment_user_stat(uid, "applicationCount", -1)

    # --- Resume Version Operations ---

    async def save_tailored_resume(
        self,
        uid: str,
        application_id: str,
        resume_content: str,
        cover_letter: str,
        ats_score: float,
        version_name: str = "",
        changelog: list[dict] | None = None,
    ) -> str:
        """Save a tailored resume version."""
        version_id = str(uuid.uuid4())
        now = datetime.now(timezone.utc).isoformat()

        # Count existing versions for auto-naming
        existing = await self.list_resume_versions(uid, application_id)
        version_number = len(existing) + 1

        name = version_name or f"Versão {version_number}"

        doc_ref = (
            self.db.collection("users").document(uid)
            .collection("applications").document(application_id)
            .collection("resumes").document(version_id)
        )
        await doc_ref.set({
            "resumeContent": resume_content,
            "coverLetterText": cover_letter,
            "atsScore": ats_score,
            "name": name,
            "type": "resume",
            "changelog": changelog or [],
            "docxFileUrl": None,
            "createdAt": now,
            "updatedAt": now,
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

    async def list_resume_versions(self, uid: str, application_id: str) -> list[dict]:
        """List all resume versions for an application, newest first."""
        query = (
            self.db.collection("users").document(uid)
            .collection("applications").document(application_id)
            .collection("resumes")
            .order_by("createdAt", direction=firestore.Query.DESCENDING)
        )
        results = []
        async for doc in query.stream():
            data = doc.to_dict()
            data["id"] = doc.id
            # Handle legacy docs without name/type/changelog
            if "name" not in data:
                data["name"] = f"Versão {len(results) + 1}"
            if "type" not in data:
                data["type"] = "resume"
            data["changelog"] = data.get("changelog", [])
            results.append(data)
        return results

    async def get_resume_version(self, uid: str, application_id: str, version_id: str) -> Optional[dict]:
        """Get a specific resume version."""
        doc_ref = (
            self.db.collection("users").document(uid)
            .collection("applications").document(application_id)
            .collection("resumes").document(version_id)
        )
        doc = await doc_ref.get()
        if doc.exists:
            data = doc.to_dict()
            data["id"] = doc.id
            if "name" not in data:
                data["name"] = "Versão"
            if "type" not in data:
                data["type"] = "resume"
            data["changelog"] = data.get("changelog", [])
            return data
        return None

    async def update_resume_content(self, uid: str, application_id: str, version_id: str, content: str) -> None:
        """Update the content of a resume version."""
        doc_ref = (
            self.db.collection("users").document(uid)
            .collection("applications").document(application_id)
            .collection("resumes").document(version_id)
        )
        await doc_ref.update({
            "resumeContent": content,
            "updatedAt": datetime.now(timezone.utc).isoformat(),
        })

    async def copy_resume_version(self, uid: str, application_id: str, version_id: str) -> str:
        """Duplicate a resume version with '(cópia)' suffix."""
        original = await self.get_resume_version(uid, application_id, version_id)
        if not original:
            raise ValueError("Version not found")

        new_id = str(uuid.uuid4())
        now = datetime.now(timezone.utc).isoformat()

        doc_ref = (
            self.db.collection("users").document(uid)
            .collection("applications").document(application_id)
            .collection("resumes").document(new_id)
        )
        await doc_ref.set({
            "resumeContent": original.get("resumeContent", ""),
            "coverLetterText": original.get("coverLetterText", ""),
            "atsScore": original.get("atsScore", 0),
            "name": f"{original.get('name', 'Versão')} (cópia)",
            "type": original.get("type", "resume"),
            "changelog": original.get("changelog", []),
            "docxFileUrl": None,
            "createdAt": now,
            "updatedAt": now,
        })

        return new_id

    async def rename_resume_version(self, uid: str, application_id: str, version_id: str, new_name: str) -> None:
        """Rename a resume version."""
        doc_ref = (
            self.db.collection("users").document(uid)
            .collection("applications").document(application_id)
            .collection("resumes").document(version_id)
        )
        await doc_ref.update({
            "name": new_name[:100],
            "updatedAt": datetime.now(timezone.utc).isoformat(),
        })

    async def delete_resume_version(self, uid: str, application_id: str, version_id: str) -> None:
        """Delete a resume version and its Cloud Storage file."""
        doc_ref = (
            self.db.collection("users").document(uid)
            .collection("applications").document(application_id)
            .collection("resumes").document(version_id)
        )
        doc = await doc_ref.get()
        if doc.exists:
            data = doc.to_dict()
            file_url = data.get("docxFileUrl")
            if file_url:
                try:
                    bucket = storage.bucket()
                    blob = bucket.blob(file_url)
                    blob.delete()
                except Exception:
                    pass
            await doc_ref.delete()

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
        today = _brazil_today()
        doc_ref = self.db.collection("users").document(uid)
        doc = await doc_ref.get()

        if doc.exists:
            data = doc.to_dict()
            usage = data.get("dailyUsage", {})
            if usage.get("date") == today:
                return usage.get("tailorCount", 0)

        return 0

    async def ensure_user_doc(self, uid: str, email: str = "", name: str = "") -> None:
        """Ensure user doc exists with email/name for admin queries."""
        doc_ref = self.db.collection("users").document(uid)
        await doc_ref.set(
            {"email": email, "name": name, "createdAt": datetime.now(timezone.utc).isoformat()},
            merge=True,
        )

    async def increment_daily_usage(self, uid: str) -> None:
        """Increment daily usage counter atomically using a transaction.

        Resets the counter when the date changes. The transaction prevents
        race conditions where two concurrent requests both read the same count.
        """
        today = _brazil_today()
        doc_ref = self.db.collection("users").document(uid)

        transaction = self.db.transaction()

        @async_transactional
        async def update_in_transaction(txn, ref):
            doc = await ref.get(transaction=txn)
            if doc.exists:
                data = doc.to_dict()
                usage = data.get("dailyUsage", {})
                if usage.get("date") == today:
                    count = usage.get("tailorCount", 0) + 1
                else:
                    count = 1
                txn.update(ref, {"dailyUsage": {"tailorCount": count, "date": today}})
            else:
                txn.set(ref, {
                    "dailyUsage": {"tailorCount": 1, "date": today},
                    "createdAt": datetime.now(timezone.utc).isoformat(),
                })

        await update_in_transaction(transaction, doc_ref)

        # Increment denormalized generation counter on user
        await self._increment_user_stat(uid, "generationCount", 1)

        # Increment platform-wide daily stats
        await self._increment_platform_stat(today, "generationCount")

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
        data = {"uid": uid, "profiles": [], "applications": [], "voiceSessions": [], "knowledge": None, "linkedin": None}

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

        # Knowledge file
        knowledge = await self.get_candidate_knowledge(uid)
        if knowledge:
            data["knowledge"] = knowledge

        # LinkedIn profile
        linkedin = await self.get_linkedin_profile(uid)
        if linkedin:
            data["linkedin"] = linkedin

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

        # Delete knowledge subcollection
        knowledge_ref = self.db.collection("users").document(uid).collection("knowledge")
        async for doc in knowledge_ref.stream():
            await doc.reference.delete()

        # Delete linkedin subcollection
        linkedin_ref = self.db.collection("users").document(uid).collection("linkedin")
        async for doc in linkedin_ref.stream():
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

    # --- Global Generation Counter ---

    async def get_global_generation_count(self) -> int:
        """Get total generations across all time (resumes + linkedin)."""
        doc_ref = self.db.collection("platformStats").document("global")
        doc = await doc_ref.get()
        if doc.exists:
            return doc.to_dict().get("totalGenerations", 0)
        return 0

    async def increment_global_generation(self, feature: str = "unknown") -> int:
        """Atomically increment the global generation counter + per-feature counter."""
        doc_ref = self.db.collection("platformStats").document("global")
        await doc_ref.set(
            {
                "totalGenerations": firestore.Increment(1),
                f"feature_{feature}": firestore.Increment(1),
            },
            merge=True,
        )
        # Read back the new count
        doc = await doc_ref.get()
        return doc.to_dict().get("totalGenerations", 0)

    async def get_feature_counts(self) -> dict:
        """Get per-feature generation counts."""
        doc_ref = self.db.collection("platformStats").document("global")
        doc = await doc_ref.get()
        if not doc.exists:
            return {}
        data = doc.to_dict()
        return {k.replace("feature_", ""): v for k, v in data.items() if k.startswith("feature_")}

    # --- AI Quality Tracking ---

    async def increment_ai_quality_issue(self, issue_type: str, count: int = 1) -> None:
        """Track AI quality issues (malformed entries, parse failures, repair failures)."""
        try:
            doc_ref = self.db.collection("platformStats").document("aiQuality")
            await doc_ref.set(
                {
                    issue_type: firestore.Increment(count),
                    "lastOccurrence": datetime.now(timezone.utc).isoformat(),
                },
                merge=True,
            )
        except Exception as e:
            logger.warning("ai_quality_tracking_error", error=str(e))

    async def get_ai_quality_stats(self) -> dict:
        """Get AI quality issue counters."""
        doc_ref = self.db.collection("platformStats").document("aiQuality")
        doc = await doc_ref.get()
        if doc.exists:
            return doc.to_dict()
        return {}

    # --- Denormalized Counter Helpers ---

    async def _increment_user_stat(self, uid: str, field: str, delta: int) -> None:
        """Atomically increment a stats field on user doc."""
        try:
            user_ref = self.db.collection("users").document(uid)
            await user_ref.set(
                {"stats": {field: firestore.Increment(delta)}},
                merge=True,
            )
        except Exception as e:
            logger.warning("stat_increment_error", uid=uid, field=field, error=str(e))

    async def _increment_platform_stat(self, date: str, field: str) -> None:
        """Atomically increment a platform-wide daily stat."""
        try:
            doc_ref = self.db.collection("platformStats").document(date)
            await doc_ref.set(
                {field: firestore.Increment(1)},
                merge=True,
            )
        except Exception as e:
            logger.warning("platform_stat_error", date=date, field=field, error=str(e))

    async def increment_platform_signup(self) -> None:
        """Increment daily signup counter."""
        today = _brazil_today()
        await self._increment_platform_stat(today, "signupCount")

    # --- Generation Activity Log ---

    async def log_generation(self, uid: str, user_email: str, company: str) -> None:
        """Write to top-level generationLog for admin dashboard."""
        await self.log_activity(uid, user_email, "generation", company=company)

    async def log_activity(
        self, uid: str, user_email: str, activity_type: str, *, company: str = ""
    ) -> None:
        """Write to generationLog for admin dashboard activity feed.

        activity_type: generation | upload | job_analysis | interview
        """
        try:
            doc_id = str(uuid.uuid4())
            await self.db.collection("generationLog").document(doc_id).set({
                "uid": uid,
                "userEmail": user_email,
                "company": company,
                "type": activity_type,
                "createdAt": datetime.now(timezone.utc).isoformat(),
            })
        except Exception as e:
            logger.warning("activity_log_error", type=activity_type, error=str(e))

    # --- Admin Query Methods ---

    async def get_all_users(self, limit: int = 50, cursor: str = "") -> list[dict]:
        """Paginated user list reading denormalized stats."""
        query = (
            self.db.collection("users")
            .order_by("createdAt", direction=firestore.Query.DESCENDING)
            .limit(limit)
        )

        if cursor:
            cursor_doc = await self.db.collection("users").document(cursor).get()
            if cursor_doc.exists:
                query = query.start_after(cursor_doc)

        results = []
        async for doc in query.stream():
            data = doc.to_dict()
            stats = data.get("stats", {})
            results.append({
                "uid": doc.id,
                "email": data.get("email", ""),
                "name": data.get("name", ""),
                "createdAt": data.get("createdAt", ""),
                "profileCount": stats.get("profileCount", 0),
                "applicationCount": stats.get("applicationCount", 0),
                "generationCount": stats.get("generationCount", 0),
            })
        return results

    async def get_user_detail(self, uid: str) -> Optional[dict]:
        """User doc + profiles + applications (for admin drill-down)."""
        user_ref = self.db.collection("users").document(uid)
        user_doc = await user_ref.get()
        if not user_doc.exists:
            return None

        data = user_doc.to_dict()
        data["uid"] = uid

        # Profiles summary
        profiles = []
        async for doc in user_ref.collection("profiles").order_by("createdAt", direction=firestore.Query.DESCENDING).stream():
            p = doc.to_dict()
            profiles.append({
                "id": doc.id,
                "name": p.get("structuredData", {}).get("name", ""),
                "status": p.get("status", ""),
                "createdAt": p.get("createdAt", ""),
            })
        data["profiles"] = profiles

        # Applications summary
        applications = []
        async for doc in user_ref.collection("applications").order_by("createdAt", direction=firestore.Query.DESCENDING).stream():
            a = doc.to_dict()
            analysis = a.get("jobAnalysis", {})
            applications.append({
                "id": doc.id,
                "title": analysis.get("title", ""),
                "company": analysis.get("company", ""),
                "status": a.get("status", ""),
                "createdAt": a.get("createdAt", ""),
            })
        data["applications"] = applications

        return data

    async def get_platform_stats(self) -> dict:
        """Current platform stats for admin dashboard.

        Uses batch get for monthly stats to minimize Firestore reads.
        """
        today = _brazil_today()
        month_prefix = today[:7]  # YYYY-MM

        # Batch read all days of this month in one call
        month_refs = [
            self.db.collection("platformStats").document(f"{month_prefix}-{day:02d}")
            for day in range(1, 32)
        ]
        today_data = {}
        month_generations = 0
        month_signups = 0
        async for doc in self.db.get_all(month_refs):
            if doc.exists:
                d = doc.to_dict()
                month_generations += d.get("generationCount", 0)
                month_signups += d.get("signupCount", 0)
                if doc.id == today:
                    today_data = d

        # Count total users and sum generation stats from user docs
        total_users = 0
        total_generations = 0
        async for doc in self.db.collection("users").stream():
            total_users += 1
            stats = doc.to_dict().get("stats", {})
            total_generations += stats.get("generationCount", 0)

        # If platformStats is empty (not yet backfilled), use user-level totals
        if month_generations == 0 and total_generations > 0:
            month_generations = total_generations

        # All-time totals from global counter
        all_time_generations = await self.get_global_generation_count()
        # Use user-level sum as fallback if global counter not populated
        if all_time_generations == 0 and total_generations > 0:
            all_time_generations = total_generations

        return {
            "totalUsers": total_users,
            "generationsToday": today_data.get("generationCount", 0),
            "generationsMonth": month_generations,
            "generationsAllTime": all_time_generations,
            "signupsMonth": month_signups,
        }

    async def get_daily_generation_stats(self, days: int = 30) -> list[dict]:
        """Daily generation counts for the last N days. Uses batch get."""
        today = _brazil_now()
        dates = [
            (today - timedelta(days=i)).strftime("%Y-%m-%d")
            for i in range(days - 1, -1, -1)
        ]
        refs = [self.db.collection("platformStats").document(d) for d in dates]

        # Build a map for lookup
        doc_map = {}
        async for doc in self.db.get_all(refs):
            if doc.exists:
                doc_map[doc.id] = doc.to_dict().get("generationCount", 0)

        return [{"date": d, "count": doc_map.get(d, 0)} for d in dates]

    async def get_recent_generations(self, limit: int = 20) -> list[dict]:
        """Recent generation log entries."""
        query = (
            self.db.collection("generationLog")
            .order_by("createdAt", direction=firestore.Query.DESCENDING)
            .limit(limit)
        )
        results = []
        async for doc in query.stream():
            data = doc.to_dict()
            data["id"] = doc.id
            results.append(data)
        return results

    async def disable_user(self, uid: str) -> None:
        """Disable a Firebase user and revoke their tokens."""
        await asyncio.to_thread(firebase_auth.update_user, uid, disabled=True)
        await asyncio.to_thread(firebase_auth.revoke_refresh_tokens, uid)

    async def enable_user(self, uid: str) -> None:
        """Re-enable a Firebase user."""
        await asyncio.to_thread(firebase_auth.update_user, uid, disabled=False)

    async def search_users_by_email(self, email_prefix: str, limit: int = 20) -> list[dict]:
        """Search users by email prefix using Firestore range query."""
        end = email_prefix + "\uf8ff"
        query = (
            self.db.collection("users")
            .where(filter=FieldFilter("email", ">=", email_prefix))
            .where(filter=FieldFilter("email", "<", end))
            .limit(limit)
        )
        results = []
        async for doc in query.stream():
            data = doc.to_dict()
            stats = data.get("stats", {})
            results.append({
                "uid": doc.id,
                "email": data.get("email", ""),
                "name": data.get("name", ""),
                "createdAt": data.get("createdAt", ""),
                "profileCount": stats.get("profileCount", 0),
                "applicationCount": stats.get("applicationCount", 0),
                "generationCount": stats.get("generationCount", 0),
            })
        return results

    async def backfill_user_stats(self) -> int:
        """One-time backfill: count subcollections, write user stats, and populate platformStats."""
        count = 0
        total_generations = 0
        total_signups = 0

        async for user_doc in self.db.collection("users").stream():
            uid = user_doc.id
            profile_count = 0
            async for _ in self.db.collection("users").document(uid).collection("profiles").select([]).stream():
                profile_count += 1

            app_count = 0
            gen_count = 0
            async for app_doc in self.db.collection("users").document(uid).collection("applications").select([]).stream():
                app_count += 1
                async for _ in app_doc.reference.collection("resumes").select([]).stream():
                    gen_count += 1

            update_data: dict = {
                "stats": {
                    "profileCount": profile_count,
                    "applicationCount": app_count,
                    "generationCount": gen_count,
                }
            }

            # Backfill email/name from Firebase Auth if missing
            existing = user_doc.to_dict()
            if not existing.get("email"):
                try:
                    fb_user = await asyncio.to_thread(firebase_auth.get_user, uid)
                    update_data["email"] = fb_user.email or ""
                    update_data["name"] = fb_user.display_name or ""
                except Exception:
                    pass

            await self.db.collection("users").document(uid).set(update_data, merge=True)
            count += 1
            total_generations += gen_count
            total_signups += 1

        # Backfill platformStats for today with accumulated totals
        today = _brazil_today()
        await self.db.collection("platformStats").document(today).set({
            "generationCount": total_generations,
            "signupCount": total_signups,
        }, merge=True)

        return count

    # --- Job Preferences & Matching ---

    async def get_job_preferences(self, uid: str) -> dict | None:
        """Get user's job matching preferences."""
        doc_ref = (
            self.db.collection("users").document(uid)
            .collection("jobPreferences").document("current")
        )
        doc = await doc_ref.get()
        if doc.exists:
            return doc.to_dict()
        return None

    async def save_job_preferences(self, uid: str, prefs: dict) -> None:
        """Save or update user's job matching preferences."""
        doc_ref = (
            self.db.collection("users").document(uid)
            .collection("jobPreferences").document("current")
        )
        prefs["last_updated"] = datetime.now(timezone.utc).isoformat()
        await doc_ref.set(prefs, merge=True)
        logger.info("job_preferences_saved", uid=uid)

    async def delete_job_preferences(self, uid: str) -> None:
        """Delete user's job preferences and all matched jobs (LGPD withdrawal)."""
        # Delete preferences
        pref_ref = (
            self.db.collection("users").document(uid)
            .collection("jobPreferences").document("current")
        )
        await pref_ref.delete()

        # Delete all matched jobs
        matched_col = (
            self.db.collection("users").document(uid)
            .collection("matchedJobs")
        )
        async for doc in matched_col.stream():
            await doc.reference.delete()

        logger.info("job_preferences_deleted", uid=uid)

    async def get_matched_jobs(self, uid: str, date: str) -> dict | None:
        """Get matched jobs for a specific date."""
        doc_ref = (
            self.db.collection("users").document(uid)
            .collection("matchedJobs").document(date)
        )
        doc = await doc_ref.get()
        if doc.exists:
            return doc.to_dict()
        return None

    async def save_matched_jobs(
        self, uid: str, date: str, matches: list, total: int
    ) -> None:
        """Save matched jobs for a specific date."""
        doc_ref = (
            self.db.collection("users").document(uid)
            .collection("matchedJobs").document(date)
        )
        await doc_ref.set({
            "matches": matches,
            "total_matches": total,
            "generated_at": datetime.now(timezone.utc).isoformat(),
        }, merge=True)
        logger.info("matched_jobs_saved", uid=uid, date=date, total=total)

    async def get_job(self, job_id: str) -> dict | None:
        """Get a single job from the global jobs collection."""
        doc_ref = self.db.collection("jobs").document(job_id)
        doc = await doc_ref.get()
        if doc.exists:
            data = doc.to_dict()
            data["id"] = doc.id
            return data
        return None

    async def get_active_jobs(self, limit: int = 500) -> list[dict]:
        """Get all jobs, filtering expired ones in-memory.

        We don't filter by expires_at in the query because older jobs
        may have string-typed expires_at (pre-fix) that Firestore can't
        compare against datetime. Filtering in-memory is safe for pools
        up to a few thousand jobs.
        """
        now = datetime.now(timezone.utc)
        query = self.db.collection("jobs").limit(limit)
        results = []
        async for doc in query.stream():
            data = doc.to_dict()
            data["id"] = doc.id

            # Filter expired jobs in-memory (handles both string and datetime expires_at)
            expires = data.get("expires_at")
            if expires:
                try:
                    if isinstance(expires, str):
                        expires_dt = datetime.fromisoformat(expires.replace("Z", "+00:00"))
                    else:
                        expires_dt = expires if expires.tzinfo else expires.replace(tzinfo=timezone.utc)
                    if expires_dt < now:
                        continue
                except (ValueError, TypeError, AttributeError):
                    pass  # Keep jobs with unparseable expires_at

            results.append(data)
        return results

    async def query_jobs_by_tags(
        self,
        tags: list[str],
        work_modes: list[str] | None = None,
        limit: int = 100,
    ) -> list[dict]:
        """Query jobs by category tags using Firestore native filtering.

        Uses array_contains_any for efficient tag matching.
        Work mode filter applied in-memory (can't combine with array query).
        """
        if not tags:
            return []

        # Firestore array_contains_any supports up to 30 values
        query = (
            self.db.collection("jobs")
            .where(filter=FieldFilter("categories", "array_contains_any", tags[:30]))
            .limit(limit)
        )

        results = []
        async for doc in query.stream():
            data = doc.to_dict()
            data["id"] = doc.id

            # Work mode filter in-memory
            if work_modes:
                if data.get("work_mode", "onsite") not in work_modes:
                    continue

            results.append(data)
        return results

    async def get_all_users_with_preferences(self) -> list[dict]:
        """Get all users who have job preferences set, with their knowledge files."""
        results = []
        async for user_doc in self.db.collection("users").order_by("__name__").stream():
            uid = user_doc.id
            user_data = user_doc.to_dict() or {}

            # Check if jobPreferences/current exists
            pref_ref = (
                self.db.collection("users").document(uid)
                .collection("jobPreferences").document("current")
            )
            pref_doc = await pref_ref.get()
            if not pref_doc.exists:
                continue

            # Fetch knowledge file
            knowledge_ref = (
                self.db.collection("users").document(uid)
                .collection("knowledge").document("current")
            )
            knowledge_doc = await knowledge_ref.get()
            knowledge = knowledge_doc.to_dict() if knowledge_doc.exists else None

            results.append({
                "uid": uid,
                "email": user_data.get("email", ""),
                "name": user_data.get("name", ""),
                "preferences": pref_doc.to_dict(),
                "knowledge": knowledge,
            })

        logger.info("users_with_preferences_fetched", count=len(results))
        return results

    async def get_users_for_announcement(self) -> list[dict]:
        """Get onboarded users who haven't set up job preferences.

        Targets users with a knowledge file (completed onboarding) but
        no jobPreferences document. Excludes users who opted out.
        """
        results = []
        async for user_doc in self.db.collection("users").order_by("__name__").stream():
            uid = user_doc.id
            user_data = user_doc.to_dict() or {}

            # Check if jobPreferences/current exists — skip if they already have prefs
            pref_ref = (
                self.db.collection("users").document(uid)
                .collection("jobPreferences").document("current")
            )
            pref_doc = await pref_ref.get()
            if pref_doc.exists:
                # User has preferences — check if they opted out
                prefs = pref_doc.to_dict() or {}
                if prefs.get("email_frequency") == "off":
                    continue  # Opted out, skip
                continue  # Has preferences, not a target

            # Check if knowledge file exists — must have completed onboarding
            knowledge_ref = (
                self.db.collection("users").document(uid)
                .collection("knowledge").document("current")
            )
            knowledge_doc = await knowledge_ref.get()
            if not knowledge_doc.exists:
                continue  # Not onboarded, skip

            results.append({
                "uid": uid,
                "email": user_data.get("email", ""),
                "name": user_data.get("name", ""),
            })

        logger.info("announcement_targets_fetched", count=len(results))
        return results

    async def get_campaign(self, campaign_id: str) -> dict | None:
        """Get a campaign tracking document."""
        doc = await self.db.collection("campaigns").document(campaign_id).get()
        return doc.to_dict() if doc.exists else None

    async def create_campaign(self, campaign_id: str, data: dict) -> None:
        """Create a campaign tracking document."""
        await self.db.collection("campaigns").document(campaign_id).set(data)

    async def update_campaign(self, campaign_id: str, data: dict) -> None:
        """Update a campaign tracking document."""
        await self.db.collection("campaigns").document(campaign_id).update(data)

    async def mark_email_sent(self, campaign_id: str, uid: str) -> None:
        """Mark that an email was sent to a user for a campaign."""
        ref = (
            self.db.collection("campaigns").document(campaign_id)
            .collection("sent").document(uid)
        )
        await ref.set({"sent_at": datetime.now(timezone.utc).isoformat()})

    async def was_email_sent(self, campaign_id: str, uid: str) -> bool:
        """Check if an email was already sent to a user for a campaign."""
        ref = (
            self.db.collection("campaigns").document(campaign_id)
            .collection("sent").document(uid)
        )
        doc = await ref.get()
        return doc.exists

    async def cleanup_expired_jobs(self) -> int:
        """Delete all expired jobs. Returns count deleted."""
        now = datetime.now(timezone.utc)
        query = self.db.collection("jobs").where(
            filter=FieldFilter("expires_at", "<", now)
        )
        count = 0
        async for doc in query.stream():
            await doc.reference.delete()
            count += 1
        logger.info("expired_jobs_cleaned", count=count)
        return count
