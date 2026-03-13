"""Firebase authentication middleware."""

from typing import Optional

import structlog
from fastapi import HTTPException, Request, WebSocket, status
from firebase_admin import auth as firebase_auth

from app.config import get_settings

logger = structlog.get_logger()


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
        return AuthenticatedUser(
            uid=decoded_token["uid"],
            email=decoded_token.get("email"),
            name=decoded_token.get("name"),
            email_verified=decoded_token.get("email_verified", False),
        )
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

    if not user.email_verified:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Email não verificado.",
        )

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
