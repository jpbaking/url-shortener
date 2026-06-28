## Purpose

Playwright end-to-end test suite for the URL shortener. Covers the API, redirect handler, and React SPA.

## Ownership

All test files live in `tests/`. The suite runs against the live Docker Compose stack — it does not mock the backend or database.

## Local Contracts

- Stack must be up before running tests: `./compose-helper.sh rebuild` from the repo root.
- Run via the Compose helper (primary): `./compose-helper.sh --profile test run --rm playwright`
- The playwright service is in the `test` profile and does not start with the normal stack.
- Inside the container, `SHORT_DOMAIN` always resolves to nginx and `S_DOMAIN` resolves too when set — no `/etc/hosts` edits required.
- Tests that write to the database (expired-link fixture, click-count checks, rate-limit-elapsed backdating) connect directly to the `postgres` service using the `pg` client and the `POSTGRES_DB`/`POSTGRES_PASSWORD` env vars injected by Compose.

## Work Guidance

- `./compose-helper.sh --profile test run --rm playwright` — run all tests in the container.
- `./compose-helper.sh --profile test run --rm playwright npx playwright test --reporter=list` — override the command for a specific reporter.
- Test reports and results are written to `playwright-report/` and `test-results/` on the host via volume mounts.
- Tests use `uniqueUrl()` helpers to generate distinct URLs per run, avoiding rate-limit interference across test cases.
- Clipboard API is stubbed via `page.addInitScript()` in the two copy-button tests (headless Chromium does not have a focused window so the real clipboard write fails).

## Verification

`./compose-helper.sh --profile test run --rm playwright` — all 47 tests must pass.
