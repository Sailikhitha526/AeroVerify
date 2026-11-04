
import os
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Annotated

import jwt
from dotenv import load_dotenv
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from pwdlib import PasswordHash

load_dotenv(Path(__file__).parent / ".env")

SECRET_KEY = os.getenv("AEROVERIFY_SECRET_KEY")
TOKEN_EXPIRE_MINUTES = int(os.getenv("TOKEN_EXPIRE_MINUTES", "60"))

if not SECRET_KEY:
    raise RuntimeError(
        "AEROVERIFY_SECRET_KEY is missing from backend/.env"
    )

ALGORITHM = "HS256"

password_hash = PasswordHash.recommended()
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")


def hash_password(password: str) -> str:
    return password_hash.hash(password)


def verify_password(password: str, hashed_password: str) -> bool:
    return password_hash.verify(password, hashed_password)


def create_access_token(user_id: int, role: str) -> str:
    expires_at = datetime.now(timezone.utc) + timedelta(
        minutes=TOKEN_EXPIRE_MINUTES
    )

    payload = {
        "sub": str(user_id),
        "role": role,
        "exp": expires_at,
    }

    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def decode_access_token(token: str) -> dict:
    try:
        payload = jwt.decode(
            token,
            SECRET_KEY,
            algorithms=[ALGORITHM],
        )

        if not payload.get("sub") or payload.get("role") not in {
            "passenger",
            "admin",
        }:
            raise jwt.InvalidTokenError("Invalid token claims")

        return payload

    except jwt.InvalidTokenError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired access token",
            headers={"WWW-Authenticate": "Bearer"},
        )


def get_current_user_id(
    token: Annotated[str, Depends(oauth2_scheme)],
) -> int:
    payload = decode_access_token(token)

    try:
        return int(payload["sub"])
    except (ValueError, TypeError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid access token",
            headers={"WWW-Authenticate": "Bearer"},
        )


def require_role(required_role: str):
    def role_checker(
        token: Annotated[str, Depends(oauth2_scheme)],
    ) -> dict:
        payload = decode_access_token(token)

        if payload["role"] != required_role:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have permission to perform this action",
            )

        return payload

    return role_checker
