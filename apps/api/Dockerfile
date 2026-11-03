# syntax=docker/dockerfile:1.7
# Build context: repository root.
ARG BUN_VERSION=1.4.4

# ---------------------------------------------------------------------------
# base: Bun + Chromium (headless shell) and its system libraries for PDFs
# ---------------------------------------------------------------------------
FROM oven/bun:${BUN_VERSION}-debian AS base
WORKDIR /app
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright \
    PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
ARG PLAYWRIGHT_VERSION=1.64.1
RUN apt-get update \
 && bunx playwright@${PLAYWRIGHT_VERSION} install --with-deps --only-shell chromium \
 && apt-get install -y --no-install-recommends tini \
 && rm -rf /var/lib/apt/lists/* /root/.bun/install/cache \
 && chmod -R a+rX /ms-playwright

# ---------------------------------------------------------------------------
# dev: used by docker-compose.yml (source is bind-mounted, hot reload)
# ---------------------------------------------------------------------------
FROM base AS dev
RUN mkdir -p node_modules apps/api/node_modules apps/web/node_modules packages/shared/node_modules \
 && chown -R bun:bun /app
USER bun
CMD ["bun", "--watch", "apps/api/src/index.ts"]

# ---------------------------------------------------------------------------
# deps: production dependencies only, frozen lockfile
# ---------------------------------------------------------------------------
FROM base AS deps
COPY package.json bun.lock bunfig.toml ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
RUN bun install --frozen-lockfile --production --filter '@meridian/api' --ignore-scripts

# ---------------------------------------------------------------------------
# build: full install + strict typecheck as a gate, then assemble sources
# ---------------------------------------------------------------------------
FROM base AS build
COPY package.json bun.lock bunfig.toml tsconfig.base.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
RUN bun install --frozen-lockfile --filter '@meridian/api' --ignore-scripts
COPY packages/shared packages/shared
COPY apps/api apps/api
RUN cd apps/api && bunx tsc -p tsconfig.json \
 && rm -rf test drizzle.config.ts

# ---------------------------------------------------------------------------
# runtime: non-root, read-only friendly, healthcheck
# ---------------------------------------------------------------------------
FROM base AS runtime
ENV NODE_ENV=production PORT=3000
COPY --from=deps --chown=root:root /app/node_modules ./node_modules
COPY --from=deps --chown=root:root /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=build --chown=root:root /app/package.json ./package.json
COPY --from=build --chown=root:root /app/packages/shared ./packages/shared
COPY --from=build --chown=root:root /app/apps/api ./apps/api
WORKDIR /app/apps/api
USER bun
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=3 \
  CMD ["bun", "-e", "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["bun", "src/index.ts"]
