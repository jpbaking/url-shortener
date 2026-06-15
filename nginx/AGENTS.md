## Purpose

Nginx reverse proxy configuration. Handles two virtual hosts on port 80, with domains fully configurable via `.env`.

- `${SHORT_DOMAIN}` — serves the React SPA and proxies `/api/` requests to the backend.
- `${S_DOMAIN}` — proxies all requests to the backend redirect handler (short link resolution).

## Ownership

`nginx.conf.template` only. Nginx itself runs inside the frontend Docker image (multi-stage build).

## Local Contracts

- The config file is `nginx.conf.template`. The official `nginx:alpine` image processes it with `envsubst` at container start, writing the result to `/etc/nginx/conf.d/default.conf`. The `SHORT_DOMAIN` and `S_DOMAIN` env vars are injected by Compose from the root `.env`.
- `/api/` requests on `${SHORT_DOMAIN}` are forwarded to `http://backend:3000` with path preserved.
- All requests on `${S_DOMAIN}` are forwarded to `http://backend:3000` with no path stripping.
- `X-Real-IP: $remote_addr` is set on every proxied request; the backend trusts this header for client IP.
- `set_real_ip_from` trusts private RFC-1918 ranges (`10/8`, `172.16/12`, `192.168/16`) so that `$remote_addr` reflects the real client IP when cloudflared or nginx-proxy-manager sits in front. `real_ip_header X-Forwarded-For` with `real_ip_recursive on` resolves multi-hop chains.
- Docker internal DNS `127.0.0.11 valid=10s` is used to resolve `backend` at request time, not at startup — this prevents Nginx from failing when the backend container restarts.
- SPA fallback on `${SHORT_DOMAIN}`: any path not matching a static file is served `index.html`.

## Work Guidance

- Keep the `set $backend http://backend:3000` pattern; do not inline the upstream directly in `proxy_pass`. The variable forces runtime DNS resolution, which is required for Docker container restart compatibility.
- Changes to `nginx.conf.template` take effect after `docker compose restart nginx` (or a full `docker compose up --build` if the image needs to be rebuilt).
- Do not add new nginx variables using `$varname` syntax without escaping — `envsubst` will try to replace them. Use `${DOLLAR}varname` or pass an explicit variable list to `envsubst` if needed.
