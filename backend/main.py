
import sqlite3
from contextlib import contextmanager
from typing import Literal

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field


app = FastAPI(
    title="AeroVerify API",
    description="Passenger pre-verification platform",
    version="2.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

DATABASE = "aeroverify.db"


@contextmanager
def get_db():
    connection = sqlite3.connect(DATABASE)
    connection.row_factory = sqlite3.Row

    try:
        yield connection
        connection.commit()
    except Exception:
        connection.rollback()
        raise
    finally:
        connection.close()


def initialize_database():
    with get_db() as connection:
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

        # Add new fields without deleting existing passenger records.
        columns = {
            row["name"]
            for row in connection.execute(
                "PRAGMA table_info(passengers)"
            ).fetchall()
        }

        if "documents_submitted" not in columns:
            connection.execute("""
                ALTER TABLE passengers
                ADD COLUMN documents_submitted INTEGER NOT NULL DEFAULT 0
            """)

        if "review_note" not in columns:
            connection.execute("""
                ALTER TABLE passengers
                ADD COLUMN review_note TEXT NOT NULL DEFAULT ''
            """)


initialize_database()


class PassengerCreate(BaseModel):
    full_name: str = Field(min_length=2, max_length=100)
    email: str = Field(min_length=5, max_length=254)
    flight_number: str = Field(min_length=2, max_length=20)
    origin: str = Field(min_length=3, max_length=100)
    destination: str = Field(min_length=3, max_length=100)


class AdminReview(BaseModel):
    decision: Literal["Under review", "Approved", "Rejected"]
    note: str = Field(default="", max_length=500)


def find_passenger(connection, passenger_id: int):
    row = connection.execute(
        "SELECT * FROM passengers WHERE id = ?",
        (passenger_id,),
    ).fetchone()

    if row is None:
        raise HTTPException(
            status_code=404,
            detail="Passenger not found",
        )

    return row


@app.get("/")
def home():
    return {
        "message": "Welcome to AeroVerify API!",
        "status": "running",
        "version": "2.0.0",
    }


@app.get("/health")
def health_check():
    return {"status": "healthy"}


@app.get("/api/dashboard")
def dashboard():
    with get_db() as connection:
        counts = connection.execute("""
            SELECT
                COUNT(*) AS total,
                SUM(CASE WHEN verification_status = 'Approved'
                    THEN 1 ELSE 0 END) AS approved,
                SUM(CASE WHEN verification_status = 'Rejected'
                    THEN 1 ELSE 0 END) AS rejected,
                SUM(CASE WHEN verification_status IN
                    ('Documents submitted', 'Under review')
                    THEN 1 ELSE 0 END) AS pending
            FROM passengers
        """).fetchone()

    return {
        "project": "AeroVerify",
        "verification_status": "In progress",
        "completed_steps": 1,
        "total_steps": 4,
        "total_passengers": counts["total"] or 0,
        "approved": counts["approved"] or 0,
        "rejected": counts["rejected"] or 0,
        "pending_review": counts["pending"] or 0,
    }


@app.post("/api/passengers", status_code=201)
def create_passenger(passenger: PassengerCreate):
    with get_db() as connection:
        cursor = connection.execute(
            """
            INSERT INTO passengers (
                full_name,
                email,
                flight_number,
                origin,
                destination
            )
            VALUES (?, ?, ?, ?, ?)
            """,
            (
                passenger.full_name.strip(),
                passenger.email.strip(),
                passenger.flight_number.strip().upper(),
                passenger.origin.strip().upper(),
                passenger.destination.strip().upper(),
            ),
        )

        return dict(find_passenger(connection, cursor.lastrowid))


@app.get("/api/passengers")
def get_passengers():
    with get_db() as connection:
        rows = connection.execute(
            "SELECT * FROM passengers ORDER BY id DESC"
        ).fetchall()

    return [dict(row) for row in rows]


@app.get("/api/passengers/{passenger_id}")
def get_passenger(passenger_id: int):
    with get_db() as connection:
        return dict(find_passenger(connection, passenger_id))


@app.post("/api/passengers/{passenger_id}/documents")
def submit_documents(passenger_id: int):
    """Record that the passenger has submitted their documents.
    This endpoint does not upload or verify actual document files.
    """
    with get_db() as connection:
        passenger = find_passenger(connection, passenger_id)

        if passenger["verification_status"] in ("Approved", "Rejected"):
            raise HTTPException(
                status_code=409,
                detail="This verification has already been decided.",
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

        return dict(find_passenger(connection, passenger_id))


@app.post("/api/admin/passengers/{passenger_id}/review")
def review_passenger(passenger_id: int, review: AdminReview):
    """Demo review endpoint. Add authentication before production use."""
    with get_db() as connection:
        passenger = find_passenger(connection, passenger_id)

        if not passenger["documents_submitted"]:
            raise HTTPException(
                status_code=400,
                detail="Documents must be submitted before review.",
            )

        if passenger["verification_status"] in ("Approved", "Rejected"):
            raise HTTPException(
                status_code=409,
                detail="This passenger's verification has already been decided.",
            )

        connection.execute(
            """
            UPDATE passengers
            SET verification_status = ?,
                review_note = ?
            WHERE id = ?
            """,
            (review.decision, review.note.strip(), passenger_id),
        )

        return dict(find_passenger(connection, passenger_id))
