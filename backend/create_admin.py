
import getpass
import re
import sqlite3
from pathlib import Path

from auth import hash_password

DATABASE = Path(__file__).parent / "aeroverify.db"


def main():
    full_name = input("Admin full name: ").strip()
    email = input("Admin email: ").strip().lower()
    password = getpass.getpass("Admin password (min 12 characters): ")

    if not full_name:
        print("Name cannot be empty.")
        return

    if not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", email):
        print("Enter a valid email address.")
        return

    if len(password) < 12:
        print("Password must contain at least 12 characters.")
        return

    connection = sqlite3.connect(DATABASE)

    try:
        connection.execute(
            """
            INSERT INTO users (full_name, email, password_hash, role)
            VALUES (?, ?, ?, 'admin')
            """,
            (full_name, email, hash_password(password)),
        )
        connection.commit()
        print("Admin account created successfully.")

    except sqlite3.IntegrityError:
        print("An account with that email already exists.")

    finally:
        connection.close()


if __name__ == "__main__":
    main()
