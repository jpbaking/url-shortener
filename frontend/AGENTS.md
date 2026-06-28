## Purpose

React + TypeScript SPA built with Vite. Provides the UI for shortening URLs: long URL input, optional expiry configuration, result display with copy-to-clipboard, and the current browser's created active short URL list.

## Ownership

All UI code lives in `src/`. Static brand assets live in `public/design/assets/` (`logo-mark.svg`, `mesh-blue.svg`, `mesh-white.svg`) and Vite copies them to the build root, where they are served at `/design/assets/...`. The compiled static output is bundled into the Nginx Docker image (multi-stage build in `Dockerfile`).

## Local Contracts

- API calls go to `/api/shorten` (relative path). `POST` creates a short URL; `GET` lists active short URLs for the current anonymous browser cookie. Nginx proxies this to the backend in production; point to the backend directly in local dev if needed.
- On mount, the app fetches `GET /api/config` to retrieve `maxExpiryMonths` and enforces it client-side; falls back to 12 if the request fails.
- Expiry is optional: `expiryValue` is only included in the request body when the field is non-empty. The Shorten button is disabled if the entered expiry exceeds `maxExpiryMonths`.
- Custom short code: hidden by default behind a `[ use custom ID ]` toggle in the expiry row. Clicking the toggle reveals a text input (3–16 chars, letters/numbers/hyphens/underscores, must start and end with a letter or number). A circled ✕ button dismisses the input and clears the value. `customCode` is included in the request body only when non-empty. The Shorten button is disabled if the value fails the format check.
- UI state machine: `idle → loading → success | duplicate | error`. The `duplicate` state shows the most recent short URL returned by a 429 response plus the wait time for generating a unique new code. The "Shorten another" button resets to `idle`.
- The created active short URLs list appears below the submission card after its first load. It shows an empty state when the browser has no active links, refreshes after successful or duplicate submissions, and includes copy buttons for each short URL.
- "Copied!" label auto-clears after 2 seconds.
- Enter key on the URL input triggers shortening.
- The wordmark and page `<title>` are derived from `window.location.hostname` at runtime — no hardcoded domain name in source. `index.html` carries only a generic fallback title.
- The brand mark renders from `/design/assets/logo-mark.svg`; both the main view and the 404 view link it back to `/`.
- Unknown SPA paths render the branded 404 view client-side; Nginx still serves `index.html` for those paths.

## Work Guidance

- Dev: `npm run dev` (Vite dev server on default port 5173).
- Build: `npm run build` (tsc + vite build → `dist/`).
- Styles are CSS Modules in `App.module.css`, co-located with `App.tsx`.
- This is a single-view app — no routing library.
