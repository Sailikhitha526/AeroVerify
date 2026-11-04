
import os
import re
import sqlite3
import uuid

from contextlib import contextmanager
from pathlib import Path
from typing import Literal

from fastapi import (
    Depends,
    FastAPI,
    HTTPException,
    UploadFile,
    File,
)
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from auth import (
    create_access_token,
    get_current_user_id,
    hash_password,
    verify_password,
)


# --------------------------------------------------
# CONFIGURATION
# --------------------------------------------------

BASE_DIR = Path(__file__).resolve().parent

# Defaults preserve your existing local database.
DATABASE = Path(
    os.getenv("DATABASE_PATH", str(BASE_DIR / "aeroverify.db"))
).expanduser()

UPLOAD_DIR = Path(
    os.getenv("UPLOAD_DIR", str(BASE_DIR / "uploads"))
).expanduser()

DATABASE.parent.mkdir(parents=True, exist_ok=True)
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

MAX_FILE_SIZE = 5 * 1024 * 1024

ALLOWED_EXTENSIONS = {
    ".pdf": "application/pdf",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
}

# Comma-separated frontend URLs.
CORS_ORIGINS = [
    origin.strip().rstrip("/")
    for origin in os.getenv(
        "CORS_ORIGINS",
        "http://localhost:5173"
    ).split(",")
    if origin.strip()
]


# --------------------------------------------------
# FASTAPI APPLICATION
# --------------------------------------------------

app = FastAPI(
    title="AeroVerify API",
    description="Passenger pre-verification platform",
    version="4.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)


# --------------------------------------------------
# DATABASE CONNECTION
# --------------------------------------------------

@contextmanager
def get_db():

    connection = sqlite3.connect(
        DATABASE,
        timeout=30
    )

    connection.row_factory = sqlite3.Row

    # Enforce foreign-key relationships.
    connection.execute("PRAGMA foreign_keys = ON")

    try:
        yield connection
        connection.commit()

    except Exception:
        connection.rollback()
        raise

    finally:
        connection.close()


# --------------------------------------------------
# DATABASE INITIALIZATION
# --------------------------------------------------

def initialize_database():

    with get_db() as connection:

        connection.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                full_name TEXT NOT NULL,
                email TEXT NOT NULL UNIQUE COLLATE NOCASE,
                password_hash TEXT NOT NULL,
                role TEXT NOT NULL DEFAULT 'passenger'
                    CHECK (role IN ('passenger', 'admin')),
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
        """)

        connection.execute("""
            CREATE TABLE IF NOT EXISTS passengers (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                full_name TEXT NOT NULL,
                email TEXT NOT NULL,
                flight_number TEXT NOT NULL,
                origin TEXT NOT NULL,
                destination TEXT NOT NULL,
                verification_status TEXT NOT NULL DEFAULT 'Not started'
            )
        """)

        columns = {
            row["name"]
            for row in connection.execute(
                "PRAGMA table_info(passengers)"
            ).fetchall()
        }

        if "documents_submitted" not in columns:
            connection.execute("""
                ALTER TABLE passengers
                ADD COLUMN documents_submitted
                INTEGER NOT NULL DEFAULT 0
            """)

        if "review_note" not in columns:
            connection.execute("""
                ALTER TABLE passengers
                ADD COLUMN review_note
                TEXT NOT NULL DEFAULT ''
            """)

        if "owner_user_id" not in columns:
            connection.execute("""
                ALTER TABLE passengers
                ADD COLUMN owner_user_id INTEGER
                REFERENCES users(id)
            """)

        connection.execute("""
            CREATE TABLE IF NOT EXISTS passenger_documents (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                passenger_id INTEGER NOT NULL,
                original_filename TEXT NOT NULL,
                stored_filename TEXT NOT NULL UNIQUE,
                content_type TEXT NOT NULL,
                file_size INTEGER NOT NULL,
                uploaded_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (passenger_id)
                    REFERENCES passengers(id)
                    ON DELETE CASCADE
            )
        """)


initialize_database()


# --------------------------------------------------
# REQUEST MODELS
# --------------------------------------------------

class RegisterRequest(BaseModel):
    full_name: str = Field(min_length=2, max_length=100)
    email: str = Field(min_length=5, max_length=254)
    password: str = Field(min_length=12, max_length=128)


class LoginRequest(BaseModel):
    email: str = Field(min_length=5, max_length=254)
    password: str = Field(min_length=1, max_length=128)


class PassengerCreate(BaseModel):
    full_name: str = Field(min_length=2, max_length=100)
    email: str = Field(min_length=5, max_length=254)
    flight_number: str = Field(min_length=2, max_length=20)
    origin: str = Field(min_length=3, max_length=100)
    destination: str = Field(min_length=3, max_length=100)


class AdminReview(BaseModel):
    decision: Literal["Under review", "Approved", "Rejected"]
    note: str = Field(default="", max_length=500)


# --------------------------------------------------
# AUTHENTICATION HELPERS
# --------------------------------------------------

def public_user(user):

    return {
        "id": user["id"],
        "full_name": user["full_name"],
        "email": user["email"],
        "role": user["role"],
    }


def get_current_user(
    user_id: int = Depends(get_current_user_id),
):

    with get_db() as connection:

        user = connection.execute(
            """
            SELECT id, full_name, email, role
            FROM users
            WHERE id = ?
            """,
            (user_id,),
        ).fetchone()

    if user is None:
        raise HTTPException(
            status_code=401,
            detail="Account not found. Please log in again.",
        )

    return dict(user)


def require_role(required_role: str):

    def check_role(user=Depends(get_current_user)):

        if user["role"] != required_role:
            raise HTTPException(
                status_code=403,
                detail="You do not have permission to perform this action.",
            )

        return user

    return check_role


# --------------------------------------------------
# PASSENGER HELPERS
# --------------------------------------------------

def find_passenger(connection, passenger_id: int):

    passenger = connection.execute(
        "SELECT * FROM passengers WHERE id = ?",
        (passenger_id,),
    ).fetchone()

    if passenger is None:
        raise HTTPException(
            status_code=404,
            detail="Passenger not found",
        )

    return passenger


def check_passenger_access(passenger, user):

    if (
        user["role"] != "admin"
        and passenger["owner_user_id"] != user["id"]
    ):
        raise HTTPException(
            status_code=404,
            detail="Passenger not found",
        )


def get_document(connection, document_id: int):

    document = connection.execute(
        """
        SELECT *
        FROM passenger_documents
        WHERE id = ?
        """,
        (document_id,),
    ).fetchone()

    if document is None:
        raise HTTPException(
            status_code=404,
            detail="Document not found",
        )

    return document


def public_document(document):

    return {
        "id": document["id"],
        "passenger_id": document["passenger_id"],
        "original_filename": document["original_filename"],
        "content_type": document["content_type"],
        "file_size": document["file_size"],
        "uploaded_at": document["uploaded_at"],
    }


# --------------------------------------------------
# FILE VALIDATION
# --------------------------------------------------

def validate_file_signature(content: bytes, extension: str):

    if extension == ".pdf":
        return content.startswith(b"%PDF-")

    if extension == ".png":
        return content.startswith(
            b"\x89PNG\r\n\x1a\n"
        )

    if extension in (".jpg", ".jpeg"):
        return (
            content.startswith(b"\xff\xd8\xff")
            and content.endswith(b"\xff\xd9")
        )

    return False


# --------------------------------------------------
# BASIC ROUTES
# --------------------------------------------------

@app.get("/")
def home():

    return {
        "message": "Welcome to AeroVerify API!",
        "version": "4.0.0",
    }


@app.get("/health")
def health_check():

    return {"status": "healthy"}


# --------------------------------------------------
# REGISTRATION
# --------------------------------------------------

@app.post("/api/auth/register", status_code=201)
def register(data: RegisterRequest):

    email = data.email.strip().lower()

    if not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", email):
        raise HTTPException(
            status_code=422,
            detail="Enter a valid email address.",
        )

    with get_db() as connection:

        try:

            cursor = connection.execute(
                """
                INSERT INTO users (
                    full_name,
                    email,
                    password_hash,
                    role
                )
                VALUES (?, ?, ?, 'passenger')
                """,
                (
                    data.full_name.strip(),
                    email,
                    hash_password(data.password),
                ),
            )

        except sqlite3.IntegrityError:
            raise HTTPException(
                status_code=409,
                detail="An account with this email already exists.",
            )

        user = connection.execute(
            """
            SELECT id, full_name, email, role
            FROM users
            WHERE id = ?
            """,
            (cursor.lastrowid,),
        ).fetchone()

    return public_user(user)


# --------------------------------------------------
# LOGIN
# --------------------------------------------------

@app.post("/api/auth/login")
def login(data: LoginRequest):

    email = data.email.strip().lower()

    with get_db() as connection:

        user = connection.execute(
            "SELECT * FROM users WHERE email = ?",
            (email,),
        ).fetchone()

    if user is None or not verify_password(
        data.password,
        user["password_hash"],
    ):
        raise HTTPException(
            status_code=401,
            detail="Invalid email or password.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token = create_access_token(
        user["id"],
        user["role"],
    )

    return {
        "access_token": token,
        "token_type": "bearer",
        "user": public_user(user),
    }


@app.get("/api/auth/me")
def me(user=Depends(get_current_user)):

    return user


# --------------------------------------------------
# DASHBOARD
# --------------------------------------------------

@app.get("/api/dashboard")
def dashboard(user=Depends(get_current_user)):

    with get_db() as connection:

        if user["role"] == "admin":

            counts = connection.execute("""
                SELECT
                    COUNT(*) AS total,

                    SUM(
                        CASE
                            WHEN verification_status = 'Approved'
                            THEN 1 ELSE 0
                        END
                    ) AS approved,

                    SUM(
                        CASE
                            WHEN verification_status = 'Rejected'
                            THEN 1 ELSE 0
                        END
                    ) AS rejected,

                    SUM(
                        CASE
                            WHEN verification_status IN (
                                'Documents submitted',
                                'Under review'
                            )
                            THEN 1 ELSE 0
                        END
                    ) AS pending

                FROM passengers
            """).fetchone()

        else:

            counts = connection.execute("""
                SELECT
                    COUNT(*) AS total,

                    SUM(
                        CASE
                            WHEN verification_status = 'Approved'
                            THEN 1 ELSE 0
                        END
                    ) AS approved,

                    SUM(
                        CASE
                            WHEN verification_status = 'Rejected'
                            THEN 1 ELSE 0
                        END
                    ) AS rejected,

                    SUM(
                        CASE
                            WHEN verification_status IN (
                                'Documents submitted',
                                'Under review'
                            )
                            THEN 1 ELSE 0
                        END
                    ) AS pending

                FROM passengers
                WHERE owner_user_id = ?
            """, (user["id"],)).fetchone()

    return {
        "project": "AeroVerify",
        "verification_status": "In progress",
        "completed_steps": 2,
        "total_steps": 4,
        "total_passengers": counts["total"] or 0,
        "approved": counts["approved"] or 0,
        "rejected": counts["rejected"] or 0,
        "pending_review": counts["pending"] or 0,
    }


# --------------------------------------------------
# CREATE PASSENGER
# --------------------------------------------------

@app.post("/api/passengers", status_code=201)
def create_passenger(
    passenger: PassengerCreate,
    user=Depends(require_role("passenger")),
):

    if passenger.email.strip().lower() != user["email"].lower():
        raise HTTPException(
            status_code=400,
            detail="Use the email address associated with your account.",
        )

    with get_db() as connection:

        cursor = connection.execute(
            """
            INSERT INTO passengers (
                full_name,
                email,
                flight_number,
                origin,
                destination,
                owner_user_id
            )
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (
                passenger.full_name.strip(),
                user["email"],
                passenger.flight_number.strip().upper(),
                passenger.origin.strip().upper(),
                passenger.destination.strip().upper(),
                user["id"],
            ),
        )

        return dict(
            find_passenger(connection, cursor.lastrowid)
        )


# --------------------------------------------------
# GET PASSENGERS
# --------------------------------------------------

@app.get("/api/passengers")
def get_passengers(user=Depends(get_current_user)):

    with get_db() as connection:

        if user["role"] == "admin":

            rows = connection.execute(
                """
                SELECT *
                FROM passengers
                ORDER BY id DESC
                """
            ).fetchall()

        else:

            rows = connection.execute(
                """
                SELECT *
                FROM passengers
                WHERE owner_user_id = ?
                ORDER BY id DESC
                """,
                (user["id"],),
            ).fetchall()

    return [dict(row) for row in rows]


@app.get("/api/passengers/{passenger_id}")
def get_passenger(
    passenger_id: int,
    user=Depends(get_current_user),
):

    with get_db() as connection:

        passenger = find_passenger(
            connection,
            passenger_id,
        )

        check_passenger_access(passenger, user)

        return dict(passenger)


# --------------------------------------------------
# UPLOAD PASSENGER DOCUMENT
# --------------------------------------------------

@app.post("/api/passengers/{passenger_id}/documents")
async def submit_documents(
    passenger_id: int,
    file: UploadFile = File(...),
    user=Depends(require_role("passenger")),
):

    with get_db() as connection:

        passenger = find_passenger(
            connection,
            passenger_id,
        )

        check_passenger_access(passenger, user)

        if passenger["verification_status"] in (
            "Approved",
            "Rejected",
        ):
            raise HTTPException(
                status_code=409,
                detail="This verification has already been decided.",
            )

    # Normalize filename separators and prevent path traversal.
    original_filename = (
        (file.filename or "document")
        .replace("\\", "/")
        .split("/")[-1]
    )

    extension = Path(original_filename).suffix.lower()

    if extension not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail="Only PDF, JPG, JPEG and PNG files are allowed.",
        )

    content = await file.read(MAX_FILE_SIZE + 1)

    if not content:
        raise HTTPException(
            status_code=400,
            detail="The uploaded file is empty.",
        )

    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=413,
            detail="File size must not exceed 5 MB.",
        )

    if not validate_file_signature(content, extension):
        raise HTTPException(
            status_code=400,
            detail="File content does not match its extension.",
        )

    stored_filename = f"{uuid.uuid4().hex}{extension}"

    file_path = UPLOAD_DIR / stored_filename

    content_type = ALLOWED_EXTENSIONS[extension]

    try:

        file_path.write_bytes(content)

        with get_db() as connection:

            passenger = find_passenger(
                connection,
                passenger_id,
            )

            check_passenger_access(passenger, user)

            if passenger["verification_status"] in (
                "Approved",
                "Rejected",
            ):
                raise HTTPException(
                    status_code=409,
                    detail="This verification has already been decided.",
                )

            cursor = connection.execute(
                """
                INSERT INTO passenger_documents (
                    passenger_id,
                    original_filename,
                    stored_filename,
                    content_type,
                    file_size
                )
                VALUES (?, ?, ?, ?, ?)
                """,
                (
                    passenger_id,
                    original_filename,
                    stored_filename,
                    content_type,
                    len(content),
                ),
            )

            connection.execute(
                """
                UPDATE passengers
                SET documents_submitted = 1,
                    verification_status = 'Documents submitted',
                    review_note = ''
                WHERE id = ?
                """,
                (passenger_id,),
            )

            document = get_document(
                connection,
                cursor.lastrowid,
            )

            return {
                "message": "Document uploaded successfully.",
                "document": public_document(document),
            }

    except Exception:

        if file_path.exists():
            file_path.unlink()

        raise

    finally:
        await file.close()


# --------------------------------------------------
# LIST PASSENGER DOCUMENTS
# --------------------------------------------------

@app.get("/api/passengers/{passenger_id}/documents")
def list_documents(
    passenger_id: int,
    user=Depends(get_current_user),
):

    with get_db() as connection:

        passenger = find_passenger(
            connection,
            passenger_id,
        )

        check_passenger_access(passenger, user)

        documents = connection.execute(
            """
            SELECT *
            FROM passenger_documents
            WHERE passenger_id = ?
            ORDER BY id DESC
            """,
            (passenger_id,),
        ).fetchall()

    return [
        public_document(document)
        for document in documents
    ]


# --------------------------------------------------
# VIEW / DOWNLOAD DOCUMENT
# --------------------------------------------------

@app.get("/api/documents/{document_id}/view")
def view_document(
    document_id: int,
    user=Depends(get_current_user),
):

    with get_db() as connection:

        document = get_document(
            connection,
            document_id,
        )

        passenger = find_passenger(
            connection,
            document["passenger_id"],
        )

        check_passenger_access(passenger, user)

        stored_filename = document["stored_filename"]
        original_filename = document["original_filename"]
        content_type = document["content_type"]

    file_path = UPLOAD_DIR / stored_filename

    if not file_path.is_file():
        raise HTTPException(
            status_code=404,
            detail="Stored document file not found.",
        )

    return FileResponse(
        path=file_path,
        media_type=content_type,
        filename=original_filename,
        content_disposition_type="inline",
        headers={"X-Content-Type-Options": "nosniff"},
    )


# --------------------------------------------------
# ADMIN REVIEW
# --------------------------------------------------

@app.post("/api/admin/passengers/{passenger_id}/review")
def review_passenger(
    passenger_id: int,
    review: AdminReview,
    user=Depends(require_role("admin")),
):

    with get_db() as connection:

        passenger = find_passenger(
            connection,
            passenger_id,
        )

        if not passenger["documents_submitted"]:
            raise HTTPException(
                status_code=400,
                detail="Documents must be submitted before review.",
            )

        if passenger["verification_status"] in (
            "Approved",
            "Rejected",
        ):
            raise HTTPException(
                status_code=409,
                detail="This verification has already been decided.",
            )

        connection.execute(
            """
            UPDATE passengers
            SET verification_status = ?,
                review_note = ?
            WHERE id = ?
            """,
            (
                review.decision,
                review.note.strip(),
                passenger_id,
            ),
        )

        return dict(
            find_passenger(connection, passenger_id)
        )
