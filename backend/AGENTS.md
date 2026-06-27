## Purpose

Express + TypeScript API service. Owns URL shortening and redirect resolution. Uses Prisma ORM against a PostgreSQL database.

## Ownership

All API behavior: short code generation, expiry logic, dedup, click counting, and the database schema.

## Local Contracts

- Short codes are random alphanumeric strings generated from a 62-character alphabet (`src/base62.ts` → `generateCode(length)`). Minimum length is 6, maximum is 16. Creation attempts a direct insert at length 6; on each `P2002` unique-constraint collision the length increments by 1 and retries up to 16.
- **Custom codes:** the caller may supply a `customCode` (3–16 chars, `[a-zA-Z0-9][a-zA-Z0-9_-]{1,14}[a-zA-Z0-9]`). Before inserting, any existing record with that code whose `expiresAt ≤ now` is deleted (reclaim). If the slot is still occupied by an active link, returns 409. Custom codes bypass the cooldown/dedup check.
- Every accepted submission always creates a new short code, even if another browser or device behind the same IP submits the same `longUrl`.
- Rate limit: if the same browser-scoped client submits the same `longUrl` within `SHORTEN_COOLDOWN_MINUTES` of a prior non-expired submission, the request is rejected with 429, a `Retry-After` header (seconds until the window clears), and the most recent short URL for that client + URL. Expired prior links do not block new short-code creation. Rate limit does not apply to custom-code requests.
- Redirect resolution returns a `200` branded HTML landing page (not a 302). All failure outcomes also render branded HTML pages: invalid code = 400, missing code = 404, expired code = 410.
- `GET /api/config` returns `{ maxExpiryMonths: number }` from `MAX_LINK_EXPIRY_MONTHS` (default 12).
- `longUrl` must start with `http://` or `https://` and be ≤ 2048 characters.
- Expiry units: `minutes`, `hours`, `days`, `weeks`, `months`. Omitting `expiryValue` assigns the maximum lifetime (`MAX_LINK_EXPIRY_MONTHS`). Explicit expiry exceeding the maximum is rejected with 400.
- `REDIRECT_DOMAIN` env var sets the domain prefix in the returned short URL (no trailing slash).
- `SHORT_DOMAIN` env var sets the wordmark shown on server-rendered HTML pages (status pages and landing page).
- `S_SCHEME` env var sets the scheme used when constructing the home URL on server-rendered pages.
- `SHORTEN_COOLDOWN_MINUTES` env var sets the duplicate-submission cooldown window in minutes (default 60; invalid values fall back to 60).
- `MAX_LINK_EXPIRY_MONTHS` env var caps the maximum link lifetime in months (default 12; invalid values fall back to 12).
- `IP_HASH_SECRET` and `CLIENT_ID_HASH_SECRET` env vars are required stable HMAC secrets. Raw IPs and cookie IDs must never be stored.
- `CLIENT_COOKIE_NAME` and `CLIENT_COOKIE_MAX_AGE_DAYS` configure the anonymous browser-scoped client ID cookie.
- `DATABASE_URL` env var is the Prisma PostgreSQL DSN.
- Client IP is read from the `X-Real-IP` header (set by Nginx); falls back to socket address for local dev. The IP is HMAC-hashed before storage and is not used as the primary duplicate key.

## Database Schema

Single model `ShortUrl` in `prisma/schema.prisma`:

| Field           | Type       | Notes                          |
|-----------------|------------|--------------------------------|
| id              | BigInt PK  | Auto-increment                 |
| code            | String(16) | Unique; random alphanumeric, 6–16 chars |
| longUrl         | String     | The original URL               |
| clientIdHash    | String(64) | HMAC-SHA-256 of anonymous client cookie; primary duplicate key |
| createdByIpHash | String(64) | HMAC-SHA-256 of client IP; anonymized abuse signal |
| clickCount      | Int        | Default 0; incremented on redirect |
| expiresAt       | DateTime?  | Null = never expires           |
| createdAt       | DateTime   | Default now()                  |

Index on `(longUrl, clientIdHash)` for rate-limit lookups; index on `createdByIpHash` for anonymized IP analysis.

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
