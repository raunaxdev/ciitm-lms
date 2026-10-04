# CIITM Library Management System

## Local setup

Requirements: Node.js 20.9 or newer and a local PostgreSQL server.

1. Create a local PostgreSQL database named `ciitm_lms`, or update `DATABASE_URL` in `.env` for your local database.
2. Install dependencies with `npm install`.
3. Generate the Prisma client and sync the schema with `npm run db:push`.
4. Start the development server with `npm run dev`, then open `/admin`.

`.env` is intentionally git-ignored. Replace its `JWT_SECRET` with a unique random value of at least 32 characters before deployment. No cloud database is configured or required.

## First administrator

Registration creates a regular `USER` account and does not accept a requested role. Register an account through the authentication API, then promote it locally using PostgreSQL:

```sql
UPDATE "Profile" SET role = 'ADMIN' WHERE email = 'admin@ciitm.edu';
```

The `/api/books` catalog GET is public; creating books requires an active administrator session. The admin panel uses the same HttpOnly session cookie issued by `/api/auth`.

## Demo seeding

Populate local demo data with:

```bash
npm run db:seed
```

This creates a default admin account (`admin@ciitm.edu` / `Admin@12345`), sample student accounts, and a starter set of books for CIITM library demos.

## API

- `POST /api/auth` with `action: "register"` or `action: "login"` creates an account or starts a session. `action: "logout"` clears the session.
- `GET /api/auth` returns the current active profile.
- `GET /api/books` returns catalog entries and copy-count metrics with optional `search`, `category`, `page`, and `pageSize` filters.
- `POST /api/books` creates a catalog entry for an administrator.
- `POST /api/transactions` supports `issue` and `return` flows for borrowers and administrators.
- `GET /api/transactions` returns the current user’s borrowing history.
