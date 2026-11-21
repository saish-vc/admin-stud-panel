# syntax=docker/dockerfile:1.7

FROM node:22-bookworm-slim AS base
WORKDIR /app
ENV NPM_CONFIG_UPDATE_NOTIFIER=false \
    NPM_CONFIG_FUND=false

FROM base AS manifests
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json

FROM manifests AS deps
RUN npm ci

FROM deps AS build
COPY apps/api ./apps/api
RUN npm run build -w @nttf/api

FROM manifests AS prod-deps
RUN npm ci --omit=dev \
    && rm -f node_modules/@nttf/web \
    && npm cache clean --force

FROM base AS runtime
ENV NODE_ENV=production \
    PORT=4000

COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=prod-deps /app/package.json ./package.json
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/apps/api/drizzle ./apps/api/drizzle
COPY apps/api/package.json ./apps/api/package.json
COPY docs/openapi.yaml ./docs/openapi.yaml

RUN mkdir -p /data/storage && chown -R node:node /data
USER node

EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:4000/health/liveness').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "apps/api/dist/server.js"]
