
# AeroVerify ✈️

**Passenger Pre-Verification and Check-in Management System**

AeroVerify is a web-based passenger verification platform designed to simplify the pre-check-in process through secure authentication, document submission, and administrator-led verification.

## Overview

AeroVerify provides separate interfaces for passengers and administrators. Passengers can create their profiles, upload required travel documents, and track verification progress. Administrators can review submitted documents and approve or reject passenger verification requests.

## Features

### Passenger

- Secure registration and login
- Passenger profile creation
- Travel document upload (PDF, JPG, JPEG, PNG)
- Verification status tracking
- Review feedback from administrators

### Administrator

- Dedicated administrator dashboard
- View passenger records
- Access uploaded documents
- Review and verify passenger submissions
- Approve or reject verification requests
- Add review notes

### Security

- JWT-based authentication
- Password hashing
- Role-based access control
- Protected API endpoints
- Environment-based secret configuration

## Technology Stack

| Layer          | Technologies              |
| -------------- | ------------------------- |
| Frontend       | React.js, CSS, JavaScript |
| Backend        | Python, FastAPI           |
| Database       | SQLite                    |
| Authentication | JWT, Password Hashing     |
| API            | REST API                  |
| Tools          | Git, GitHub, VS Code      |

## Application Workflow

1. Passenger registers or logs in.
2. Passenger creates a verification record.
3. Passenger uploads the required documents.
4. Administrator reviews the submitted documents.
5. Administrator approves, rejects, or requests further review.
6. Passenger tracks the verification progress through the dashboard.

## Project Structure

```text
AeroVerify/
├── backend/
│   ├── auth.py
│   ├── create_admin.py
│   ├── main_auth.py
│   └── migrate_auth.py
│
├── frontend-new/
│   ├── public/
│   ├── src/
│   │   ├── assets/
│   │   ├── App.jsx
│   │   ├── App.css
│   │   ├── index.css
│   │   └── main.jsx
│   ├── package.json
│   └── vite.config.js
│
└── .gitignore
```

## Getting Started

### Prerequisites

- Python 3.11 or compatible version
- Node.js and npm
- Git

### 1. Clone the repository

```bash
git clone https://github.com/Sailikhitha526/AeroVerify.git
cd AeroVerify
```

### 2. Backend setup

```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

Configure the required environment variables in `backend/.env`, including:

```env
AEROVERIFY_SECRET_KEY=your-secret-key
```

Create the administrator account using the project's admin setup script:

```bash
python create_admin.py
```

Start the backend:

```bash
uvicorn main_auth:app --reload --port 8001
```

### 3. Frontend setup

Open another terminal:

```bash
cd AeroVerify/frontend-new
npm install
npm run dev
```

Open the local development URL displayed by Vite, usually:

`http://localhost:5173`

## Future Enhancements

- Online deployment
- Enhanced document preview
- Email notifications
- Improved verification analytics
- Additional passenger management features

## Author

**Dhupati Sai Likhitha**

- GitHub: [Sailikhitha526](https://github.com/Sailikhitha526)
- Project: [AeroVerify](https://github.com/Sailikhitha526/AeroVerify)

---

*Built as a full-stack software development project.*
