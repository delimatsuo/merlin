"""Firebase authentication middleware."""

from typing import Optional

import structlog
from fastapi import HTTPException, Request, WebSocket, status
from firebase_admin import auth as firebase_auth

logger = structlog.get_logger()


class AuthenticatedUser:
    """Represents an authenticated Firebase user."""

    def __init__(self, uid: str, email: Optional[str] = None, name: Optional[str] = None):
        self.uid = uid
        self.email = email
        self.name = name


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
