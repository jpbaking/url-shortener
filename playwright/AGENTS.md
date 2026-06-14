## Purpose

Playwright end-to-end test suite for the URL shortener. Covers the API, redirect handler, and React SPA.

## Ownership

All test files live in `tests/`. The suite runs against the live Docker Compose stack — it does not mock the backend or database.

## Local Contracts

- Stack must be up before running tests: `docker compose up --build` from the repo root.
- Run via Docker Compose (primary): `docker compose --profile test run --rm playwright`
- The playwright service is in the `test` profile and does not start with the normal stack.
- Inside the container, `short.url` and `s.url` resolve to nginx via Docker network aliases — no `/etc/hosts` edits required.
- Tests that write to the database (expired-link fixture, click-count checks, dedup-expired) connect directly to the `postgres` service using the `pg` client and the `POSTGRES_DB`/`POSTGRES_PASSWORD` env vars injected by Compose.

## Work Guidance

- `docker compose --profile test run --rm playwright` — run all tests in the container.
- `docker compose --profile test run --rm playwright npx playwright test --reporter=list` — override the command for a specific reporter.
- Test reports and results are written to `playwright-report/` and `test-results/` on the host via volume mounts.
- Tests use `uniqueUrl()` helpers to generate distinct URLs per run, avoiding dedup interference across test cases.
- Clipboard API is stubbed via `page.addInitScript()` in the two copy-button tests (headless Chromium does not have a focused window so the real clipboard write fails).

## Verification

`docker compose --profile test run --rm playwright` — all 41 tests must pass.
