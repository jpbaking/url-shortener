## Purpose

Express route handlers for the two core operations: shortening a URL and resolving a short code to the branded landing page.

## Ownership

- `shorten.ts` — `POST /api/shorten`
- `redirect.ts` — `GET /:code`
- `../index.ts` owns `GET /api/config` plus route registration order

## Local Contracts

### shorten.ts

- Accepts JSON body: `{ longUrl: string, expiryValue?: number, expiryUnit?: ExpiryUnit, customCode?: string }`.
- Returns `{ shortUrl: string, expiresAt: string }` with status `201` on success. `expiresAt` is always a non-null ISO string for newly created rows: omitting the expiry field uses `MAX_LINK_EXPIRY_MONTHS` as the default; explicit expiry is capped at the same maximum.
- Creation attempts a direct insert with a random 6-char code, retrying with incrementally longer codes (up to 16) on `P2002` collisions.
- Custom short codes are allowed with the format `[a-zA-Z0-9][a-zA-Z0-9_-]{1,14}[a-zA-Z0-9]`. Active collisions return `409`; expired rows with the same code are reclaimed before insert. Custom-code requests bypass the cooldown/dedup logic.
- Rate limit: same anonymous browser-scoped client + same `longUrl` within `SHORTEN_COOLDOWN_MINUTES` minutes of a non-expired prior entry → 429 with `Retry-After` header, the most recent `shortUrl`, nullable `expiresAt` (null only for legacy rows predating the max-expiry policy), numeric `retryAfter`, and human `waitLabel`. Expired prior entries are ignored and allow a fresh code.
- Client identity is an `HttpOnly`, `SameSite=Lax` cookie generated on first shorten request; only its HMAC-SHA-256 digest is stored. Client IP is taken from `X-Real-IP` (set by Nginx) or socket fallback, HMAC-hashed with `IP_HASH_SECRET`, and stored only as `createdByIpHash`.

### redirect.ts

- Validates code as alphanumeric plus internal custom-code punctuation (`/^[a-zA-Z0-9_-]+$/`) and rejects anything else with 400.
- Successful resolution returns a `200` branded landing page showing the destination domain, a disclaimer, and Proceed / Go Back actions. The landing page is the primary user-facing flow; there is no immediate 302 redirect on success.
- Invalid, missing, expired, and server-error redirect outcomes return branded HTML status pages.
- Expired links return 410 Gone.
- Click count increment is fire-and-forget: a failed DB update never blocks the landing page.

## Work Guidance

- `GET /api/config` is defined in `index.ts` before the route mounts; keep that endpoint registered before the catch-all short-code route.
- The redirect route is registered last in `index.ts` — the catch-all `/:code` must remain after all explicit routes.
- Do not introduce per-request Prisma clients; reuse the module-level singleton.
