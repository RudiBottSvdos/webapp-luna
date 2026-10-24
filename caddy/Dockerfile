# syntax=docker/dockerfile:1
# Build-Kontext: Repo-Root (siehe docker-compose.yml)

# 1) Frontend bauen
FROM node:22-alpine AS frontend
WORKDIR /app
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# 2) Caddy mit DNS-Challenge-Plugin bauen
FROM caddy:2-builder AS builder
# DNS-Anbieter ist eine offene Frage (docs/KONZEPT.md) -> per Build-Arg wählbar,
# z. B. github.com/caddy-dns/cloudflare, .../hetzner, .../ionos, .../duckdns
ARG CADDY_DNS_PLUGIN=github.com/caddy-dns/cloudflare
RUN xcaddy build --with ${CADDY_DNS_PLUGIN}

# 3) Laufzeit-Image
FROM caddy:2
COPY --from=builder /usr/bin/caddy /usr/bin/caddy
COPY caddy/Caddyfile /etc/caddy/Caddyfile
COPY --from=frontend /app/dist /srv
