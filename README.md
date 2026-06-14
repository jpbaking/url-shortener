# URL Shortener

A self-hosted URL shortener. Paste a long URL into the web UI and get a short link; visiting the short link issues a `302` redirect to the original URL.

The app runs across **two domains backed by one service**:

- **`short.url`** — a React SPA where users shorten URLs.
- **`s.url`** — short-link resolution; every request proxies straight to the backend redirect handler.

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

Requires Docker and Docker Compose.

```bash
# 1. Configure environment
cp .env.example .env
# edit .env — set your domains and (optionally) S_SCHEME=https

# 2. Bring up the full stack
docker compose up --build
```

To browse the app locally, map the domains to your loopback address (they aren't real DNS names):

```
# /etc/hosts
127.0.0.1 short.url s.url
```

Then open <http://short.url> to shorten a URL.

## Configuration

The root `.env` (copied from `.env.example`) supplies five variables consumed by Compose:

| Variable            | Description                                              | Default      |
|---------------------|----------------------------------------------------------|--------------|
| `POSTGRES_DB`       | Database name                                            | —            |
| `POSTGRES_PASSWORD` | PostgreSQL superuser password                           | —            |
| `SHORT_DOMAIN`      | Hostname for the SPA                                     | `short.url`  |
| `S_DOMAIN`          | Hostname for short-link resolution                      | `s.url`      |
| `S_SCHEME`          | Scheme for short links shown to users (`http`/`https`)  | `http`       |

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
- `expiryValue` / `expiryUnit` (optional) — omit for a link that never expires. Units: `minutes`, `hours`, `days`, `weeks`, `months`.

Response (`201` for a new link, `200` for a dedup hit):

```json
{
  "shortUrl": "http://s.url/aB3x9Z",
  "expiresAt": "2026-06-22T12:00:00.000Z"
}
```

Requests from the same IP for the same URL return the existing (non-expired) short link.

### `GET /:code`

Resolves a short code: `302` redirect to the original URL, `410 Gone` if the link has expired, or `400` for a malformed code. Each successful resolution increments a click counter (fire-and-forget — a counter failure never blocks the redirect).

Short codes are random base62 strings, 6–16 characters; length grows automatically on collision.

## Common commands

```bash
docker compose up --build        # build + start the full stack
docker compose down              # stop (keep data)
docker compose down -v           # stop and wipe the database volume
docker compose logs -f backend   # tail logs (nginx | backend | postgres)
```

## Testing

A Playwright E2E suite runs against the live stack (it does not mock the backend or database). With the stack up:

```bash
docker compose --profile test run --rm playwright
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
