
import sqlite3
from pathlib import Path

DATABASE = Path(__file__).parent / "aeroverify.db"


def migrate():
    connection = sqlite3.connect(DATABASE)

    try:
        connection.execute("PRAGMA foreign_keys = ON")

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

        columns = {
            row[1]
            for row in connection.execute(
                "PRAGMA table_info(passengers)"
            ).fetchall()
        }

        if "owner_user_id" not in columns:
            connection.execute("""
                ALTER TABLE passengers
                ADD COLUMN owner_user_id INTEGER
                REFERENCES users(id)
            """)

        connection.commit()
        print("Authentication database migration completed.")
        print("Existing passenger records have been preserved.")

    except Exception:
        connection.rollback()
        raise

    finally:
        connection.close()


if __name__ == "__main__":
    migrate()
