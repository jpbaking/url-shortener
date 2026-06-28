# URL Shortener

A self-hosted URL shortener. Paste a long URL into the web UI and get a short link; the page also shows active short URLs created in the same anonymous browser session. Visiting a short link opens a branded landing page showing the destination domain — the user clicks **Proceed** to navigate there, or **Go Back** to return.

The app can run in **two-domain** or **single-domain** mode, both backed by one service:

- **`short.url`** (`SHORT_DOMAIN`) — a React SPA where users shorten URLs.
- **`s.url`** (`S_DOMAIN`) — optional short-link resolution host; when set, every request proxies straight to the backend redirect handler.
- If **`S_DOMAIN` is blank**, short links are served as `SHORT_DOMAIN/<id>` instead.

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

## Quick Start

Requires Docker and Docker Compose. Use the root `compose-helper.sh` wrapper for local Compose operations; it pins the Compose project name via `compose-helper.env` and loads the root `.env`.

### 1. Create `.env`

```bash
cp .env.example .env
```

Open `.env` and fill these required values before first start:

- `POSTGRES_DB` — database name, for example `shorturl`.
- `POSTGRES_PASSWORD` — PostgreSQL password. Use a real secret; the sample value is only a placeholder.
- `IP_HASH_SECRET` — stable random secret for anonymizing client IPs before storage.
- `CLIENT_ID_HASH_SECRET` — stable random secret for anonymizing anonymous browser IDs before storage.

One easy way to generate the two HMAC secrets:

```bash
openssl rand -hex 32
openssl rand -hex 32
```

Keep these HMAC secrets stable. Changing them later does not expose old IPs or cookie IDs, but it does make existing duplicate-detection records stop matching new requests.

### 2. Choose Domains

- `SHORT_DOMAIN` — hostname users open to reach the shortener UI. Defaults to `short.url` if unset.
- `S_DOMAIN` — optional dedicated short-link hostname. Set it for two-domain mode, or leave it blank/commented out for single-domain links like `SHORT_DOMAIN/<id>`.
- `S_SCHEME` — `http` for local/plain HTTP, `https` when TLS is provided by Cloudflare Tunnel, nginx-proxy-manager, or another upstream proxy.

For local testing, the domains do not need to be real public DNS names. They only need to resolve on the machine where your browser runs.

Single-domain mode:

```env
SHORT_DOMAIN=short.url
# S_DOMAIN=
S_SCHEME=http
```

Short links look like `http://short.url/aB3x9Z`.

Two-domain mode:

```env
SHORT_DOMAIN=short.url
S_DOMAIN=s.url
S_SCHEME=http
```

Short links look like `http://s.url/aB3x9Z`.

### 3. Add Local Hostnames

If you use local-only names such as `short.url` or `s.url`, add them to `/etc/hosts`:

```
# two-domain mode:
127.0.0.1 short.url s.url

# single-domain mode (S_DOMAIN blank):
127.0.0.1 short.url
```

Skip this step when your domains already resolve through real DNS, Cloudflare Tunnel, nginx-proxy-manager, or another upstream proxy.

### 4. Start the Stack

```bash
./compose-helper.sh rebuild
```

Then open `http://<SHORT_DOMAIN>` (for example <http://short.url>) to shorten a URL.

For most `.env` or Nginx template changes, restart through the helper so containers receive the new environment:

```bash
./compose-helper.sh restart
```

> **Example public deployment — Cloudflare Tunnel:** No DNS `A` record or open inbound port needed. Run a `cloudflared` tunnel and point it at `localhost:80`. Cloudflare terminates TLS automatically; set `S_SCHEME=https` in `.env`. Because cloudflared is the TCP peer of Nginx, client IPs arrive via `X-Forwarded-For` — the Nginx config handles this automatically.
>
> **Example internal deployment — nginx-proxy-manager:** Create a local DNS record for `SHORT_DOMAIN`, and one for `S_DOMAIN` too if you use two-domain mode. Configure NPM to proxy each configured hostname to `localhost:80` (or the Docker host IP on port `80`). NPM handles TLS (Let's Encrypt or self-signed). Set `S_SCHEME=https` once TLS is in place. Client IPs are forwarded via `X-Forwarded-For` and resolved correctly by Nginx.

## Configuration

The root `.env` (copied from `.env.example`) supplies variables consumed by Compose:

| Variable                     | Description                                                                    | Default        |
|------------------------------|--------------------------------------------------------------------------------|----------------|
| `POSTGRES_DB`                | Required database name                                                         | —              |
| `POSTGRES_PASSWORD`          | Required PostgreSQL superuser password                                         | —              |
| `SHORT_DOMAIN`               | Hostname for the SPA                                                           | `short.url`    |
| `S_DOMAIN`                   | Optional hostname for short-link resolution; leave blank or unset/comment it out to use `SHORT_DOMAIN/<id>` | `s.url` in `.env.example` |
| `S_SCHEME`                   | Scheme for short links shown to users (`http`/`https`)                        | `http`         |
| `SHORTEN_COOLDOWN_MINUTES`   | Minutes before the same browser-scoped client + URL can generate a new code    | `60`           |
| `IP_HASH_SECRET`             | Required stable HMAC secret for anonymizing client IPs before storage          | —              |
| `CLIENT_ID_HASH_SECRET`      | Required stable HMAC secret for anonymizing anonymous client cookie IDs before storage | —       |
| `CLIENT_COOKIE_NAME`         | Anonymous client ID cookie name                                                | `lw_client_id` |
| `CLIENT_COOKIE_MAX_AGE_DAYS` | Anonymous client ID cookie lifetime in days                                    | `365`          |
| `MAX_LINK_EXPIRY_MONTHS`     | Maximum short link lifetime in months; links with no custom expiry are capped here | `12`       |

The backend derives the public short-link base URL as `${S_SCHEME}://${S_DOMAIN}` when `S_DOMAIN` is set, otherwise `${S_SCHEME}://${SHORT_DOMAIN}`. Data persists in the `pg_data` named volume — removing it drops all shortened URLs.

Changing `POSTGRES_DB` or `POSTGRES_PASSWORD` after the database volume already exists may require `./compose-helper.sh down`, which removes the `pg_data` volume and deletes all stored links.

## API

### `POST /api/shorten`

Request body:

```json
{
  "longUrl": "https://example.com/some/very/long/path",
  "expiryValue": 7,
  "expiryUnit": "days",
  "customCode": "my-link"
}
```

- `longUrl` (required) — must start with `http://` or `https://`, max 2048 characters.
- `expiryValue` / `expiryUnit` (optional) — omit to use the configured maximum lifetime (`MAX_LINK_EXPIRY_MONTHS`). Explicit expiry is capped at the same maximum. Units: `minutes`, `hours`, `days`, `weeks`, `months`.
- `customCode` (optional) — a user-chosen short code, 3–16 characters, letters/numbers/hyphens/underscores, must start and end with a letter or number. If the code is occupied by an active (non-expired) link, returns `409 Conflict`. Expired codes are automatically reclaimed. Providing a custom code bypasses the cooldown/dedup check.

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

### `GET /api/shorten`

Returns the newest active short URLs created by the current anonymous browser identity. Expired links are excluded. If the browser has not created any links yet, the list is empty.

```json
{
  "links": [
    {
      "code": "aB3x9Z",
      "longUrl": "https://example.com/some/very/long/path",
      "shortUrl": "http://s.url/aB3x9Z",
      "clickCount": 0,
      "expiresAt": "2026-06-22T12:00:00.000Z",
      "createdAt": "2026-06-21T12:00:00.000Z"
    }
  ]
}
```

### `GET /api/config`

Returns server-side configuration the UI needs to enforce matching constraints.

```json
{ "maxExpiryMonths": 12 }
```

### `GET /:code`

Resolves a short code. Returns a `200` branded HTML landing page showing the destination domain and a disclaimer; the user clicks **Proceed** to navigate or **Go Back** to cancel. Returns `404 Not Found` if the code does not exist, `410 Gone` if the link has expired, or `400` for a malformed code. All failure outcomes render branded HTML status pages. Each successful resolution increments a click counter (fire-and-forget — a counter failure never blocks the landing page render).

Short codes are random base62 strings, 6–16 characters (length grows on collision), or a user-supplied custom code.

## Common commands

```bash
./compose-helper.sh rebuild      # build + start detached
./compose-helper.sh up           # build + start detached + follow logs
./compose-helper.sh stop         # stop (keep data)
./compose-helper.sh down         # stop and wipe the database volume
./compose-helper.sh logs backend # tail logs (nginx | backend | postgres)
```

Use `down` only when you intentionally want a clean database. It removes the named Postgres volume.

## Testing

A Playwright E2E suite runs against the live stack (it does not mock the backend or database). With the stack up:

```bash
./compose-helper.sh --profile test run --rm playwright
```

The Playwright container resolves the configured shortener hostnames via Docker network aliases, so no `/etc/hosts` edits are needed for tests. Reports are written to `playwright/playwright-report/` and `playwright/test-results/`.

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
