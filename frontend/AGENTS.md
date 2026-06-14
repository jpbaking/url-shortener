## Purpose

React + TypeScript SPA built with Vite. Provides the UI for shortening URLs: long URL input, optional expiry configuration, and result display with a copy-to-clipboard button.

## Ownership

All UI code lives in `src/`. The compiled static output is bundled into the Nginx Docker image (multi-stage build in `Dockerfile`).

## Local Contracts

- API calls go to `/api/shorten` (relative path). Nginx proxies this to the backend in production; point to the backend directly in local dev if needed.
- Expiry is optional: `expiryValue` is only included in the request body when the field is non-empty.
- UI state machine: `idle → loading → success | error`. The "Shorten another" button resets to `idle`.
- "Copied!" label auto-clears after 2 seconds.
- Enter key on the URL input triggers shortening.

## Work Guidance

- Dev: `npm run dev` (Vite dev server on default port 5173).
- Build: `npm run build` (tsc + vite build → `dist/`).
- Styles are CSS Modules in `App.module.css`, co-located with `App.tsx`.
- This is a single-view app — no routing library.
