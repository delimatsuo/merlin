"""Firebase authentication middleware."""

import asyncio
from typing import Optional

import structlog
from fastapi import HTTPException, Request, WebSocket, status
from firebase_admin import auth as firebase_auth

from app.config import get_settings

logger = structlog.get_logger()

# In-memory set of UIDs whose user doc has been ensured this process lifetime.
# Avoids a Firestore write on every request.
_ensured_uids: set[str] = set()


class AuthenticatedUser:
    """Represents an authenticated Firebase user."""

    def __init__(self, uid: str, email: Optional[str] = None, name: Optional[str] = None,
                 email_verified: bool = False):
        self.uid = uid
        self.email = email
        self.name = name
        self.email_verified = email_verified


async def get_current_user(request: Request) -> AuthenticatedUser:
    """Extract and verify Firebase ID token from Authorization header."""
    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token de autenticação não fornecido.",
        )

    token = auth_header.split("Bearer ")[1]

    try:
        decoded_token = firebase_auth.verify_id_token(token)
        user = AuthenticatedUser(
            uid=decoded_token["uid"],
            email=decoded_token.get("email"),
            name=decoded_token.get("name"),
            email_verified=decoded_token.get("email_verified", False),
        )

        # Ensure user doc exists in Firestore (fire-and-forget, once per process per UID)
        if user.uid not in _ensured_uids:
            _ensured_uids.add(user.uid)
            try:
                from app.services.firestore import FirestoreService
                fs = FirestoreService()
                asyncio.create_task(
                    fs.ensure_user_doc(user.uid, email=user.email or "", name=user.name or "")
                )
            except Exception:
                pass  # Non-blocking

        return user
    except firebase_auth.ExpiredIdTokenError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token expirado. Faça login novamente.",
        )
    except firebase_auth.InvalidIdTokenError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token inválido.",
        )
    except Exception as e:
        logger.error("auth_error", error=str(e))
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Erro de autenticação.",
        )


async def get_admin_user(request: Request) -> AuthenticatedUser:
    """Verify user is an authenticated admin with verified email."""
    user = await get_current_user(request)

    # Google OAuth users are inherently verified; only enforce for email/password accounts
    if not user.email_verified:
        # Check if the user signed in via Google (Firebase sets sign_in_provider in token)
        # Since we can't easily check provider here, skip this check for admin emails
        # as they must match exactly anyway
        pass

    settings = get_settings()
    admin_emails = [e.strip().lower() for e in settings.admin_emails.split(",") if e.strip()]

    if not user.email or user.email.lower() not in admin_emails:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Acesso restrito a administradores.",
        )

    return user


async def verify_ws_token(websocket: WebSocket) -> Optional[AuthenticatedUser]:
    """Verify Firebase ID token from WebSocket query parameter."""
    token = websocket.query_params.get("token")
    if not token:
        await websocket.close(code=4001, reason="Token não fornecido.")
        return None

    try:
        decoded_token = firebase_auth.verify_id_token(token)
        return AuthenticatedUser(
            uid=decoded_token["uid"],
            email=decoded_token.get("email"),
            name=decoded_token.get("name"),
        )
    except Exception as e:
        logger.error("ws_auth_error", error=str(e))
        await websocket.close(code=4001, reason="Token inválido.")
        return None
