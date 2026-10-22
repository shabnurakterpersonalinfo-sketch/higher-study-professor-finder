# HigherStudy API + worker image (same image, different start command).
# Build from the repo root:  docker build -f apps/api/Dockerfile .
# Railway: set RAILWAY_DOCKERFILE_PATH=apps/api/Dockerfile on the service.

FROM node:22-bookworm-slim AS build
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
# Lockfile + every workspace manifest, so `npm ci` installs exactly what was tested.
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci -w @higherstudy/api --no-audit --no-fund
COPY apps/api apps/api
WORKDIR /app/apps/api
RUN npx prisma generate && npx nest build

FROM node:22-bookworm-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production PORT=4000
# node_modules keeps the Prisma CLI (migrate deploy) and ts-node (seed).
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/apps/api/prisma ./apps/api/prisma
# The seed (prisma/seed.ts) imports src/common/* via ts-node.
COPY --from=build /app/apps/api/src ./apps/api/src
COPY --from=build /app/apps/api/package.json /app/apps/api/tsconfig.json ./apps/api/
WORKDIR /app/apps/api
USER node
EXPOSE 4000
# Worker: override with `node dist/worker.js`. Migrations: `npx prisma migrate deploy`.
CMD ["node", "dist/main.js"]
