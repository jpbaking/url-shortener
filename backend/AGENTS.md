## Purpose

Express + TypeScript API service. Owns URL shortening and redirect resolution. Uses Prisma ORM against a PostgreSQL database.

## Ownership

All API behavior: short code generation, expiry logic, dedup, click counting, and the database schema.

## Local Contracts

- Short codes are random alphanumeric strings generated from a 62-character alphabet (`src/base62.ts` → `generateCode(length)`). Minimum length is 6, maximum is 16. Creation attempts a direct insert at length 6; on each `P2002` unique-constraint collision the length increments by 1 and retries up to 16.
- Dedup: same IP + same `longUrl` returns the existing code if it has not expired. Expired entries are ignored and a fresh code is created.
- `longUrl` must start with `http://` or `https://` and be ≤ 2048 characters.
- Expiry units: `minutes`, `hours`, `days`, `weeks`, `months`. Omitted or empty `expiryValue` = no expiry.
- `REDIRECT_DOMAIN` env var sets the domain prefix in the returned short URL (no trailing slash).
- `DATABASE_URL` env var is the Prisma PostgreSQL DSN.
- Client IP is read from the `X-Real-IP` header (set by Nginx); falls back to socket address for local dev.

## Database Schema

Single model `ShortUrl` in `prisma/schema.prisma`:

| Field         | Type       | Notes                          |
|---------------|------------|--------------------------------|
| id            | BigInt PK  | Auto-increment                 |
| code          | String(16) | Unique; random alphanumeric, 6–16 chars |
| longUrl       | String     | The original URL               |
| createdByIp   | String     | Used for dedup                 |
| clickCount    | Int        | Default 0; incremented on redirect |
| expiresAt     | DateTime?  | Null = never expires           |
| createdAt     | DateTime   | Default now()                  |

Index on `(longUrl, createdByIp)` for dedup lookups.

## Work Guidance

- This project ships **no migration files** and uses `prisma db push` (not migrations). After any schema change: `npx prisma generate`, then `npx prisma db push` to sync the dev database. Do not run `prisma migrate dev` — it would create a `migrations/` directory and switch the project to a migration-based workflow the Dockerfile does not use.
- Dev: `npm run dev` (ts-node-dev with hot reload).
- Build: `npm run build` (tsc → `dist/`). Start: `npm run start`.
- The Dockerfile runs `prisma generate` at build time and `prisma db push --skip-generate` at container start before launching the server.

## Verification

No automated test suite. Verify routes via `curl`:

```bash
# Shorten
curl -s -X POST http://localhost:3000/api/shorten \
  -H 'Content-Type: application/json' \
  -d '{"longUrl":"https://example.com"}' | jq

# Redirect
curl -v http://localhost:3000/<code>
```

## Child DOX Index

- [src/routes/](src/routes/AGENTS.md) — Shorten and redirect route handlers
