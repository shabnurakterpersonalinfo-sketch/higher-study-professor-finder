# HigherStudy web (Next.js standalone). Also serves /api/v1/* as a proxy to the API,
# so the browser only ever talks to this origin (first-party session cookie, no CORS).
# Build from the repo root:  docker build -f apps/web/Dockerfile .
# Runtime env (no rebuild needed to change): API_INTERNAL_URL, PROXY_SECRET, TRUSTED_PROXY_HOPS.
# Railway: set RAILWAY_DOCKERFILE_PATH=apps/web/Dockerfile on the service.

FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci -w @higherstudy/web --no-audit --no-fund
COPY apps/web apps/web
ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /app/apps/web
RUN npx next build

FROM node:22-alpine
WORKDIR /app
# HOSTNAME=0.0.0.0: Docker sets HOSTNAME to the container id, and Next's standalone server
# would bind to that instead of all interfaces.
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 PORT=3000 API_INTERNAL_URL=http://localhost:4000
COPY --from=build --chown=node:node /app/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /app/apps/web/.next/static ./apps/web/.next/static
USER node
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
