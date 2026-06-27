## Purpose

Express route handlers for the two core operations: shortening a URL and resolving a short code to a redirect.

## Ownership

- `shorten.ts` — `POST /api/shorten`
- `redirect.ts` — `GET /:code`

## Local Contracts

### shorten.ts

- Accepts JSON body: `{ longUrl: string, expiryValue?: number, expiryUnit?: ExpiryUnit }`.
- Returns `{ shortUrl: string, expiresAt: string | null }` with status `201` on success. There is no dedup path — every accepted submission creates a new code.
- Creation attempts a direct insert with a random 6-char code, retrying with incrementally longer codes (up to 16) on `P2002` collisions.
- Rate limit: same anonymous browser-scoped client + same `longUrl` within `SHORTEN_COOLDOWN_MINUTES` minutes of a non-expired prior entry → 429 with `Retry-After` header, the most recent `shortUrl`, nullable `expiresAt`, numeric `retryAfter`, and human `waitLabel`. Expired prior entries are ignored and allow a fresh code.
- Client identity is an `HttpOnly`, `SameSite=Lax` cookie generated on first shorten request; only its HMAC-SHA-256 digest is stored. Client IP is taken from `X-Real-IP` (set by Nginx) or socket fallback, HMAC-hashed with `IP_HASH_SECRET`, and stored only as `createdByIpHash`.

### redirect.ts

- Validates code as alphanumeric only (`/^[a-zA-Z0-9]+$/`); rejects anything else with 400.
- 302 response includes `Location` header plus a meta-refresh + JS fallback body for edge cases.
- Invalid, missing, expired, and server-error redirect outcomes return branded HTML status pages.
- Expired links return 410 Gone.
- Click count increment is fire-and-forget: a failed DB update never blocks the redirect.

## Work Guidance

- The redirect route is registered last in `index.ts` — the catch-all `/:code` must remain after all explicit routes.
- Do not introduce per-request Prisma clients; reuse the module-level singleton.
