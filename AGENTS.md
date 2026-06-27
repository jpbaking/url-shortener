# URL Shortener

## Project

Self-hosted URL shortener. Users paste a long URL into the web UI and receive a short link. Clicking the short link issues a 302 redirect to the original URL.

Two domains, one backend:
- `short.url` — React SPA where users shorten URLs.
- `s.url` — short link resolution; all requests proxy directly to the backend redirect handler.

Stack: React + Vite (frontend), Express + Prisma + PostgreSQL (backend), Nginx (reverse proxy). All services run via Docker Compose.

## Global Contracts

- `docker-compose.yml` at the root is the single source of truth for how services connect. Only Nginx (port 80) is exposed externally; backend and postgres are internal.
- Run Docker Compose operations through `./compose-helper.sh`, which pins the project name from `compose-helper.env`, loads `.env`, and wraps common local workflows.
- Intended upstream proxies: **cloudflared** (public internet access via Cloudflare Tunnel) and **nginx-proxy-manager** (internal LAN access). Nginx trusts RFC-1918 ranges for real-IP resolution; do not expose Nginx directly to untrusted networks.
- Root `.env` (copy from `.env.example`) supplies these variables consumed by Compose:
  - `POSTGRES_DB` — database name
  - `POSTGRES_PASSWORD` — postgres superuser password
  - `SHORT_DOMAIN` — hostname for the SPA, e.g. `short.url` (default: `short.url`)
  - `S_DOMAIN` — hostname for short link resolution, e.g. `s.url` (default: `s.url`)
  - `S_SCHEME` — scheme for short links shown to users, `http` or `https` (default: `http`)
  - `SHORTEN_COOLDOWN_MINUTES` — minutes the same browser-scoped client must wait before the same `longUrl` can generate a unique new code (default: `60`)
  - `IP_HASH_SECRET` — stable HMAC secret used to anonymize client IPs before storage
  - `CLIENT_ID_HASH_SECRET` — stable HMAC secret used to anonymize browser-scoped client IDs before storage
  - `CLIENT_COOKIE_NAME` — anonymous client ID cookie name (default: `lw_client_id`)
  - `CLIENT_COOKIE_MAX_AGE_DAYS` — anonymous client ID cookie lifetime in days (default: `365`)
- Compose assembles `REDIRECT_DOMAIN` as `${S_SCHEME}://${S_DOMAIN}` and injects it alongside `DATABASE_URL` into the backend.
- Nginx reads `SHORT_DOMAIN` and `S_DOMAIN` to populate `nginx.conf.template` via `envsubst` at container start.
- Postgres data is persisted in the named volume `pg_data`; removing this volume drops all shortened URLs.
- The backend waits for Postgres to pass its healthcheck before starting (`depends_on: condition: service_healthy`).

## Work Guidance

- Bring up the full stack: `./compose-helper.sh rebuild` (build + detached start) or `./compose-helper.sh up` (build + detached start + follow logs).
- Stop the stack while keeping data: `./compose-helper.sh stop`.
- Stop and wipe the database volume: `./compose-helper.sh down`.
- Check logs: `./compose-helper.sh logs` for all services, or `./compose-helper.sh logs <service>` for a specific service such as `nginx`, `backend`, or `postgres`.
- First-time setup: copy `.env.example` → `.env`, set your real domains in `SHORT_DOMAIN` / `S_DOMAIN`, and set `S_SCHEME=https` if serving over TLS.
- Reaching the app from a host browser: `SHORT_DOMAIN` / `S_DOMAIN` are not real DNS names, so add them to `/etc/hosts` (e.g. `127.0.0.1 short.url s.url`) to load the SPA and short links locally. (The Playwright container resolves these via Docker network aliases and needs no hosts edits — see [playwright/](playwright/AGENTS.md).)
- End-to-end verification: the Playwright suite is the fastest full-stack check — see [playwright/](playwright/AGENTS.md).

## User Preferences

When the user requests a durable behavior change, record it here or in the relevant child AGENTS.md.

- **README sync (project-wide):** Any change anywhere in the project that affects API behavior, deployment setup, or configuration contracts must also update `README.md` if that change is reflected there. This applies to work owned by child AGENTS.md files as well — the DOX closeout pass is not complete until README.md is checked and updated if needed.
- **Compose helper (project-wide):** Use `./compose-helper.sh` for future Docker Compose build/start/stop/log/test operations in this repository instead of calling `docker compose` directly, unless debugging the helper itself.

## Child DOX Index

- [backend/](backend/AGENTS.md) — Express + Prisma API service; shortening logic, redirect handler, base62 encoding, DB schema
- [frontend/](frontend/AGENTS.md) — React SPA (Vite); URL input form, optional expiry controls, result display with copy button
- [nginx/](nginx/AGENTS.md) — Nginx reverse proxy; routes `${SHORT_DOMAIN}` to the SPA and `${S_DOMAIN}` to the backend redirect handler; domains set via `.env`
- [playwright/](playwright/AGENTS.md) — Playwright E2E suite; 45 tests covering the API, redirect handler, and SPA; runs against the live Docker Compose stack

# DOX framework

- DOX is highly performant AGENTS.md hierarchy installed here
- Agent must follow DOX instructions across any edits

## Core Contract

- AGENTS.md files are binding work contracts for their subtrees
- Work products, source materials, instructions, records, assets, and durable docs must stay understandable from the nearest applicable AGENTS.md plus every parent AGENTS.md above it

## Read Before Editing

1. Read the root AGENTS.md
2. Identify every file or folder you expect to touch
3. Walk from the repository root to each target path
4. Read every AGENTS.md found along each route
5. If a parent AGENTS.md lists a child AGENTS.md whose scope contains the path, read that child and continue from there
6. Use the nearest AGENTS.md as the local contract and parent docs for repo-wide rules
7. If docs conflict, the closer doc controls local work details, but no child doc may weaken DOX

Do not rely on memory. Re-read the applicable DOX chain in the current session before editing.

## Update After Editing

Every meaningful change requires a DOX pass before the task is done.

Update the closest owning AGENTS.md when a change affects:

- purpose, scope, ownership, or responsibilities
- durable structure, contracts, workflows, or operating rules
- required inputs, outputs, permissions, constraints, side effects, or artifacts
- user preferences about behavior, communication, process, organization, or quality
- AGENTS.md creation, deletion, move, rename, or index contents

Update parent docs when parent-level structure, ownership, workflow, or child index changes. Update child docs when parent changes alter local rules. Remove stale or contradictory text immediately. Small edits that do not change behavior or contracts may leave docs unchanged, but the DOX pass still must happen.

## Hierarchy

- Root AGENTS.md is the DOX rail: project-wide instructions, global preferences, durable workflow rules, and the top-level Child DOX Index
- Child AGENTS.md files own domain-specific instructions and their own Child DOX Index
- Each parent explains what its direct children cover and what stays owned by the parent
- The closer a doc is to the work, the more specific and practical it must be

## Child Doc Shape

- Create a child AGENTS.md when a folder becomes a durable boundary with its own purpose, rules, responsibilities, workflow, materials, or quality standards
- Work Guidance must reflect the current standards of the project or user instructions; if there are no specific standards or instructions yet, leave it empty
- Verification must reflect an existing check; if no verification framework exists yet, leave it empty and update it when one exists

Default section order:
- Purpose
- Ownership
- Local Contracts
- Work Guidance
- Verification
- Child DOX Index

## Style

- Keep docs concise, current, and operational
- Document stable contracts, not diary entries
- Put broad rules in parent docs and concrete details in child docs
- Prefer direct bullets with explicit names
- Do not duplicate rules across many files unless each scope needs a local version
- Delete stale notes instead of explaining history
- Trim obvious statements, repeated rules, misplaced detail, and warnings for risks that no longer exist

## Closeout

1. Re-check changed paths against the DOX chain
2. Update nearest owning docs and any affected parents or children
3. Refresh every affected Child DOX Index
4. Remove stale or contradictory text
5. Run existing verification when relevant
6. Report any docs intentionally left unchanged and why
