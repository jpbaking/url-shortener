## Purpose

Nginx reverse proxy configuration. Handles either two-domain or single-domain routing on port 80, with domains fully configurable via `.env`.

- `${SHORT_DOMAIN}` — always serves the React SPA and proxies `/api/` requests to the backend.
- `${S_DOMAIN}` — when set, proxies all requests to the backend redirect handler.
- If `S_DOMAIN` is blank, `${SHORT_DOMAIN}` also proxies extensionless single-segment paths like `/${code}` to the backend.

## Ownership

`nginx.conf.template`, `nginx.single-domain.conf.template`, and `render-config.sh`. Nginx itself runs inside the frontend Docker image (multi-stage build).

## Local Contracts

- `render-config.sh` runs from `/docker-entrypoint.d/` at container start. It selects `nginx.conf.template` when `S_DOMAIN` is set, or `nginx.single-domain.conf.template` when `S_DOMAIN` is blank, then renders `/etc/nginx/conf.d/default.conf` via `envsubst`.
- `/api/` requests on `${SHORT_DOMAIN}` are forwarded to `http://backend:3000` with path preserved.
- All requests on `${S_DOMAIN}` are forwarded to `http://backend:3000` with no path stripping when that host is configured.
- In single-domain mode, extensionless single-segment paths on `${SHORT_DOMAIN}` are forwarded to `http://backend:3000` so the backend can return valid, invalid, missing, or expired short-link pages; other non-file paths still fall back to `index.html`.
- `X-Real-IP: $remote_addr` is set on every proxied request; the backend trusts this header for client IP.
- `set_real_ip_from` trusts private RFC-1918 ranges (`10/8`, `172.16/12`, `192.168/16`) so that `$remote_addr` reflects the real client IP when cloudflared or nginx-proxy-manager sits in front. `real_ip_header X-Forwarded-For` with `real_ip_recursive on` resolves multi-hop chains.
- Docker internal DNS `127.0.0.11 valid=10s` is used to resolve `backend` at request time, not at startup — this prevents Nginx from failing when the backend container restarts.
- SPA fallback on `${SHORT_DOMAIN}`: any path not matching a static file is served `index.html`.

## Work Guidance

- Keep the `set $backend http://backend:3000` pattern; do not inline the upstream directly in `proxy_pass`. The variable forces runtime DNS resolution, which is required for Docker container restart compatibility.
- Changes to either nginx template or `render-config.sh` take effect after `./compose-helper.sh rebuild` or an nginx container restart that re-runs the entrypoint.
- Do not add new nginx variables using `$varname` syntax without escaping — `envsubst` will try to replace them. Use `${DOLLAR}varname` or pass an explicit variable list to `envsubst` if needed.
