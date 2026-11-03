# syntax=docker/dockerfile:1.7
# Build context: repository root.
ARG NODE_VERSION=24.22.2
ARG BUN_VERSION=1.4.4
ARG NGINX_VERSION=1.31.7

FROM oven/bun:${BUN_VERSION}-debian AS bun

# ---------------------------------------------------------------------------
# base: Node (Angular CLI) + Bun (package manager)
# ---------------------------------------------------------------------------
FROM node:${NODE_VERSION}-trixie-slim AS base
COPY --from=bun /usr/local/bin/bun /usr/local/bin/bun
RUN ln -s /usr/local/bin/bun /usr/local/bin/bunx
WORKDIR /app
# Pre-create dependency dirs owned by uid 1000 so dev named volumes inherit the owner.
RUN mkdir -p node_modules apps/api/node_modules apps/web/node_modules packages/shared/node_modules \
 && chown -R 1000:1000 /app

# dev: used by docker-compose.yml (`ng serve` with proxy to the API)
FROM base AS dev
USER node
CMD ["bun", "run", "--filter", "@meridian/web", "start"]

# ---------------------------------------------------------------------------
# build: production Angular build
# ---------------------------------------------------------------------------
FROM base AS build
COPY package.json bun.lock bunfig.toml tsconfig.base.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
RUN bun install --frozen-lockfile --filter '@meridian/web' --ignore-scripts
COPY packages/shared packages/shared
COPY apps/web apps/web
RUN cd apps/web && node scripts/sync-brand.mjs && bunx ng build --configuration production \
 && find dist/web/browser -type f \( -name '*.js' -o -name '*.css' -o -name '*.html' -o -name '*.json' -o -name '*.svg' \) \
      -exec gzip -9 -k {} \;

# ---------------------------------------------------------------------------
# runtime: unprivileged nginx (uid 101, port 8080)
# ---------------------------------------------------------------------------
FROM nginxinc/nginx-unprivileged:${NGINX_VERSION}-alpine AS runtime
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist/web/browser /usr/share/nginx/html
EXPOSE 8080
HEALTHCHECK --interval=15s --timeout=3s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:8080/healthz || exit 1
