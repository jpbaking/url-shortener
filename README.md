# URL Shortener

A self-hosted URL shortener. Paste a long URL into the web UI and get a short link; visiting the short link issues a `302` redirect to the original URL.

The app runs across **two domains backed by one service** (both are configurable via `.env`; the defaults below are examples):

- **`short.url`** (`SHORT_DOMAIN`) — a React SPA where users shorten URLs.
- **`s.url`** (`S_DOMAIN`) — short-link resolution; every request proxies straight to the backend redirect handler.

## Stack

| Layer        | Technology                          |
|--------------|-------------------------------------|
| Frontend     | React + Vite (TypeScript)           |
| Backend      | Express + Prisma (TypeScript)       |
| Database     | PostgreSQL                          |
| Reverse proxy| Nginx                               |
| Orchestration| Docker Compose                      |
| E2E tests    | Playwright                          |

Only Nginx (port `80`) is exposed; the backend and PostgreSQL stay on the internal Docker network.

## Quick start

Requires Docker and Docker Compose. Use the root `compose-helper.sh` wrapper for local Compose operations; it pins the Compose project name via `compose-helper.env` and loads the root `.env`.

```bash
# 1. Configure environment
cp .env.example .env
# edit .env — set your domains and (optionally) S_SCHEME=https

# 2. Bring up the full stack
./compose-helper.sh rebuild
```

To browse the app locally, map your configured domains to your loopback address (they aren't real DNS names):

```
# /etc/hosts  — replace with your SHORT_DOMAIN and S_DOMAIN values
127.0.0.1 short.url s.url
```

Then open `http://<SHORT_DOMAIN>` (e.g. <http://short.url>) to shorten a URL. Unknown paths on the main domain render a branded 404 page.

> **Production — public (Cloudflare Tunnel):** No DNS `A` record or open inbound port needed. Run a `cloudflared` tunnel and point it at `localhost:80`. Cloudflare terminates TLS automatically; set `S_SCHEME=https` in `.env`. Because cloudflared is the TCP peer of Nginx, client IPs arrive via `X-Forwarded-For` — the Nginx config handles this automatically.
>
> **Production — internal (nginx-proxy-manager):** Create local DNS records for `SHORT_DOMAIN` and `S_DOMAIN` pointing to your server. Configure NPM to proxy both hostnames to `localhost:80` (or the Docker host IP on port `80`). NPM handles TLS (Let's Encrypt or self-signed). Set `S_SCHEME=https` once TLS is in place. Client IPs are forwarded via `X-Forwarded-For` and resolved correctly by Nginx.

## Configuration

The root `.env` (copied from `.env.example`) supplies variables consumed by Compose:

| Variable                     | Description                                                                    | Default        |
|------------------------------|--------------------------------------------------------------------------------|----------------|
| `POSTGRES_DB`                | Database name                                                                  | —              |
| `POSTGRES_PASSWORD`          | PostgreSQL superuser password                                                  | —              |
| `SHORT_DOMAIN`               | Hostname for the SPA                                                           | `short.url`    |
| `S_DOMAIN`                   | Hostname for short-link resolution                                             | `s.url`        |
| `S_SCHEME`                   | Scheme for short links shown to users (`http`/`https`)                        | `http`         |
| `SHORTEN_COOLDOWN_MINUTES`   | Minutes before the same browser-scoped client + URL can generate a new code    | `60`           |
| `IP_HASH_SECRET`             | Stable HMAC secret for anonymizing client IPs before storage                   | —              |
| `CLIENT_ID_HASH_SECRET`      | Stable HMAC secret for anonymizing anonymous client cookie IDs before storage   | —              |
| `CLIENT_COOKIE_NAME`         | Anonymous client ID cookie name                                                | `lw_client_id` |
| `CLIENT_COOKIE_MAX_AGE_DAYS` | Anonymous client ID cookie lifetime in days                                    | `365`          |
| `MAX_LINK_EXPIRY_MONTHS`     | Maximum short link lifetime in months; links with no custom expiry are capped here | `12`       |

Compose derives `REDIRECT_DOMAIN` as `${S_SCHEME}://${S_DOMAIN}` and injects it, along with `DATABASE_URL`, into the backend. Data persists in the `pg_data` named volume — removing it drops all shortened URLs.

## API

### `POST /api/shorten`

Request body:

```json
{
  "longUrl": "https://example.com/some/very/long/path",
  "expiryValue": 7,
  "expiryUnit": "days"
}
```

- `longUrl` (required) — must start with `http://` or `https://`, max 2048 characters.
- `expiryValue` / `expiryUnit` (optional) — omit to use the configured maximum lifetime (`MAX_LINK_EXPIRY_MONTHS`). Explicit expiry is capped at the same maximum. Units: `minutes`, `hours`, `days`, `weeks`, `months`.

Response (`201` for a new link):

```json
{
  "shortUrl": "http://s.url/aB3x9Z",
  "expiresAt": "2026-06-22T12:00:00.000Z"
}
```

Submitting the same URL from the same browser within `SHORTEN_COOLDOWN_MINUTES` returns `429 Too Many Requests` with a `Retry-After` header if the previous matching short URL has not expired. The body includes the most recent short URL so the user can reuse it, plus a human wait label for when a unique new code can be generated. The browser identity is an anonymous `HttpOnly`, `SameSite=Lax` cookie; the server stores only HMAC-SHA-256 digests of that cookie and the client IP, never raw IP addresses or raw cookie IDs.

```json
{
  "error": "This URL was already shortened recently in this browser. Use the existing short URL below, or wait about 1 hour to generate a unique new short URL. If the existing short URL expires first, you can generate a new one then.",
  "shortUrl": "http://s.url/aB3x9Z",
  "expiresAt": "2027-06-22T12:00:00.000Z",
  "retryAfter": 3598,
  "waitLabel": "1 hour"
}
```

After the cooldown window clears, or once the previous matching short URL has expired, submitting the same URL creates a new short code.

### `GET /:code`

Resolves a short code: `302` redirect to the original URL, `404 Not Found` if the code does not exist, `410 Gone` if the link has expired, or `400` for a malformed code. Failed redirect outcomes render branded HTML status pages. Each successful resolution increments a click counter (fire-and-forget — a counter failure never blocks the redirect).

Short codes are random base62 strings, 6–16 characters; length grows automatically on collision.

## Common commands

```bash
./compose-helper.sh rebuild      # build + start detached
./compose-helper.sh up           # build + start detached + follow logs
./compose-helper.sh stop         # stop (keep data)
./compose-helper.sh down         # stop and wipe the database volume
./compose-helper.sh logs backend # tail logs (nginx | backend | postgres)
```

## Testing

A Playwright E2E suite runs against the live stack (it does not mock the backend or database). With the stack up:

```bash
./compose-helper.sh --profile test run --rm playwright
```

The Playwright container resolves `short.url` / `s.url` via Docker network aliases, so no `/etc/hosts` edits are needed for tests. Reports are written to `playwright/playwright-report/` and `playwright/test-results/`.

## Project layout

```
.
├── backend/      Express + Prisma API (shorten + redirect handlers, DB schema)
├── frontend/     React + Vite SPA
├── nginx/        Reverse-proxy config (templated per domain via envsubst)
├── playwright/   End-to-end test suite
└── docker-compose.yml
```

Each directory carries an `AGENTS.md` documenting its contracts and workflow.

## License

Released under the [BSD Zero-Clause License](LICENSE) (`0BSD`) — effectively public domain. Use, copy, modify, and distribute it for any purpose, with **no attribution required** and **no warranty**.
