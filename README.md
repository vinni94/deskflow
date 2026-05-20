# 🪑 DeskFlow — Office Seat Booking System

A full-stack office hot-desking application with a real PostgreSQL backend, JWT authentication, and a polished dark-mode frontend.

---

## Architecture

```
deskflow/
├── backend/              # Node.js + Express API
│   ├── db/
│   │   ├── pool.js       # PostgreSQL connection pool (pg)
│   │   ├── schema.sql    # DDL + seat seeds (run once)
│   │   └── seed.js       # Demo user seeder with bcrypt hashing
│   ├── middleware/
│   │   └── auth.js       # JWT verify + requireAdmin guard
│   ├── routes/
│   │   ├── auth.js       # /api/auth — login, register, me, change-password
│   │   ├── seats.js      # /api/seats — seat listing with bookings/absences
│   │   ├── bookings.js   # /api/bookings — create, cancel, list mine
│   │   ├── absences.js   # /api/absences — mark/remove AM/PM absence
│   │   └── admin.js      # /api/admin — stats, user management
│   ├── server.js         # Express app entry point
│   ├── package.json
│   └── .env.example      # ← copy to .env and fill in
└── frontend/
    ├── index.html        # Single-page app shell + all CSS
    ├── js/
    │   ├── api.js        # Fetch wrapper with JWT injection
    │   └── app.js        # All UI logic — views, calendar, modals
    └── (served as static files by Express in production)
```

---

## Local Development Setup

### Prerequisites
- Node.js ≥ 18
- PostgreSQL ≥ 14
- `psql` CLI

### 1. Create the database

```bash
psql -U postgres -c "CREATE DATABASE deskflow;"
```

### 2. Install backend dependencies

```bash
cd backend
npm install
```

### 3. Configure environment

```bash
cp .env.example .env
# Edit .env:
#   DATABASE_URL=postgresql://postgres:yourpassword@localhost:5432/deskflow
#   JWT_SECRET=<generate with: node -e "console.log(require('crypto').randomBytes(64).toString('hex'))">
```

### 4. Run database migrations and seed

```bash
# Create tables + seed flexi/standard seats
npm run db:init          # runs schema.sql

# Create demo users (hashed passwords)
npm run seed
```

### 5. Start the server

```bash
npm run dev              # nodemon — auto-restarts on changes
# API live at http://localhost:3001
```

### 6. Open the frontend

For development, open `frontend/index.html` with a local server:

```bash
# From project root:
npx serve frontend -p 5500
# or:
python3 -m http.server 5500 --directory frontend
```

Then browse to `http://localhost:5500`.

In production, Express serves the frontend automatically (see `server.js`).

---

## Demo Credentials

| Name            | Email                    | Password  | Role  | Desk |
|-----------------|--------------------------|-----------|-------|------|
| Vinayak Sharma  | vinayak@kuleuven.be      | test123   | user  | S1   |
| Sofia Chen      | sofia@kuleuven.be        | test123   | user  | S2   |
| Marc Dubois     | marc@kuleuven.be         | test123   | user  | S3   |
| Priya Nair      | priya@kuleuven.be        | test123   | user  | S4   |
| Lars Eriksson   | lars@kuleuven.be         | test123   | admin | —    |

---

## API Reference

All protected endpoints require `Authorization: Bearer <token>`.

### Auth
| Method | Path                        | Auth | Description               |
|--------|-----------------------------|------|---------------------------|
| POST   | /api/auth/register          | —    | Create account             |
| POST   | /api/auth/login             | —    | Login, returns JWT         |
| GET    | /api/auth/me                | ✓    | Get current user profile   |
| POST   | /api/auth/change-password   | ✓    | Change own password        |

### Seats
| Method | Path                        | Auth  | Description                              |
|--------|-----------------------------|-------|------------------------------------------|
| GET    | /api/seats?date=YYYY-MM-DD  | ✓     | All seats with booking/absence for date  |
| PATCH  | /api/seats/:id/owner        | admin | Assign standard seat to user             |

### Bookings
| Method | Path                        | Auth  | Description                |
|--------|-----------------------------|-------|----------------------------|
| POST   | /api/bookings               | ✓     | Create booking             |
| DELETE | /api/bookings/:id           | ✓     | Cancel booking             |
| GET    | /api/bookings/mine          | ✓     | Current user's bookings    |
| GET    | /api/bookings?date=...      | admin | All bookings for a date    |

### Absences
| Method | Path                           | Auth  | Description                      |
|--------|--------------------------------|-------|----------------------------------|
| GET    | /api/absences?weekStart=...    | ✓     | Own absences for the week        |
| POST   | /api/absences                  | ✓     | Mark AM or PM absent             |
| DELETE | /api/absences                  | ✓     | Remove an absence                |
| GET    | /api/absences/all?date=...     | admin | All users' absences for date     |

### Admin
| Method | Path                        | Auth  | Description                |
|--------|-----------------------------|-------|----------------------------|
| GET    | /api/admin/users            | admin | List all users with seats  |
| GET    | /api/admin/stats?date=...   | admin | Dashboard statistics       |
| PATCH  | /api/admin/users/:id/role   | admin | Change user role           |
| DELETE | /api/admin/users/:id        | admin | Remove user                |

---

## Deployment

### Railway (recommended — free tier)

1. Push to GitHub
2. Create a new Railway project → "Deploy from GitHub repo"
3. Add a PostgreSQL plugin → Railway auto-sets `DATABASE_URL`
4. Set environment variables:
   ```
   JWT_SECRET=<your-secret>
   NODE_ENV=production
   FRONTEND_ORIGIN=https://your-app.up.railway.app
   ```
5. Set start command: `node backend/server.js`
6. Done — Railway serves both API and frontend from one dyno

### Render

1. New Web Service → connect repo
2. Build command: `cd backend && npm install`
3. Start command: `node backend/server.js`
4. Add environment variables (same as above)
5. Create a PostgreSQL database → copy the internal URL to `DATABASE_URL`
6. After first deploy: run `node backend/db/seed.js` via the Render shell

### Heroku

```bash
heroku create your-app-name
heroku addons:create heroku-postgresql:mini
heroku config:set JWT_SECRET=$(node -e "console.log(require('crypto').randomBytes(64).toString('hex'))")
heroku config:set NODE_ENV=production
git push heroku main
heroku run "cd backend && node db/schema.sql"
heroku run "cd backend && node db/seed.js"
```

---

## Security Notes

- Passwords are hashed with **bcrypt** (cost factor 12) — never stored in plaintext
- JWTs are verified server-side on every protected request; deleted users are rejected
- Auth endpoints have a simple in-memory rate-limiter (20 req/min/IP)
- SQL uses **parameterised queries** throughout — no string interpolation, no SQL injection
- Booking creation uses `SELECT ... FOR UPDATE` to prevent race conditions
- `X-Content-Type-Options`, `X-Frame-Options`, `X-XSS-Protection` headers set on all responses
- CORS whitelist configured via `FRONTEND_ORIGIN` env var

---

## Bug Fixes (vs. previous version)

1. **Calendar month navigation** — prev/next buttons now update `calPopYear`/`calPopMonth` state and re-render only the popover, without touching `selectedDate` until a day is actually clicked.

2. **Cancel booking modal** — fixed by replacing the serialised-arrow-function pattern (`fn.toString()`) with a named `_modalActions` registry. Closures now execute correctly in modal button handlers.

3. **Authentication** — moved from localStorage plaintext to bcrypt + PostgreSQL + JWT. Passwords never leave the server unhashed.
