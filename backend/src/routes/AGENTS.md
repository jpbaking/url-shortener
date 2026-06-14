## Purpose

Express route handlers for the two core operations: shortening a URL and resolving a short code to a redirect.

## Ownership

- `shorten.ts` — `POST /api/shorten`
- `redirect.ts` — `GET /:code`

## Local Contracts

### shorten.ts

- Accepts JSON body: `{ longUrl: string, expiryValue?: number, expiryUnit?: ExpiryUnit }`.
- Returns `{ shortUrl: string, expiresAt: string | null }` on success (201 for new, 200 for dedup hit).
- Dedup path returns the existing code; creation path attempts a direct insert with a random 6-char code, retrying with incrementally longer codes (up to 16) on `P2002` collisions.

### redirect.ts

- Validates code as alphanumeric only (`/^[a-zA-Z0-9]+$/`); rejects anything else with 400.
- 302 response includes `Location` header plus a meta-refresh + JS fallback body for edge cases.
- Expired links return 410 Gone.
- Click count increment is fire-and-forget: a failed DB update never blocks the redirect.

## Work Guidance

- The redirect route is registered last in `index.ts` — the catch-all `/:code` must remain after all explicit routes.
- Do not introduce per-request Prisma clients; reuse the module-level singleton.
