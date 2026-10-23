# Deploying to Railway

Five services in one Railway project, all built from this repository's Dockerfiles:

| Service | Source | What it is |
|---|---|---|
| `Postgres` | Railway database | Data (pg_trgm is created by the migrations) |
| `Redis` | Railway database | Cache, role cache, import previews, BullMQ queues |
| `api` | GitHub repo · `apps/api/Dockerfile` | NestJS API — private only, no public domain needed |
| `worker` | GitHub repo · `apps/api/Dockerfile` | Same image, runs `node dist/worker.js` (no domain) |
| `web` | GitHub repo · `apps/web/Dockerfile` | Next.js; the only public domain. Serves `/api/v1/*` by proxying to `api` |

The browser only ever talks to the `web` domain, so the sign-in cookie is first-party (browsers
block cookies between two `*.up.railway.app` domains) and there is no CORS in the browser path.

The variables below use Railway's `${{Service.VARIABLE}}` references, so **name the services
exactly `api`, `worker`, `web`, `Postgres`, `Redis`** (or change the references to match).

## 1. Push the code

Push this folder to a GitHub repository (without `.env`; it's in `.gitignore`/`.dockerignore`).

Generate one shared secret for the proxy now (`openssl rand -base64 32`); it goes on `api` and `web`.

## 2. Create the project and databases

1. railway.com → **New Project** → **Deploy PostgreSQL**.
2. In the project: **Create → Database → Redis**.

## 3. API service

**Create → GitHub Repo →** your repo. Rename the service to `api`.

**Variables** (Raw Editor):

```
RAILWAY_DOCKERFILE_PATH=apps/api/Dockerfile
NODE_ENV=production
PORT=4000
DATABASE_URL=${{Postgres.DATABASE_URL}}
REDIS_URL=${{Redis.REDIS_URL}}
JWT_SECRET=<output of: openssl rand -base64 48>   # the API refuses short or example values
PROXY_SECRET=<the shared proxy secret>
ACCESS_TOKEN_TTL=15m
SESSION_IDLE_DAYS=30
SESSION_MAX_DAYS=90
# Payment callbacks and redirects go through the web domain's /api/v1 proxy.
PUBLIC_API_URL=https://${{web.RAILWAY_PUBLIC_DOMAIN}}
PUBLIC_WEB_URL=https://${{web.RAILWAY_PUBLIC_DOMAIN}}
# Origins allowed to use the sign-in cookie (refresh/logout check this).
CORS_ORIGINS=https://${{web.RAILWAY_PUBLIC_DOMAIN}}
CRON_TZ=Asia/Dhaka

# Payments — live bKash:
PAYMENT_MODE=live
BKASH_BASE_URL=...
BKASH_APP_KEY=...
BKASH_APP_SECRET=...
BKASH_USERNAME=...
BKASH_PASSWORD=...
# ...or, for a staging/demo deploy only (anyone can upgrade for free):
# PAYMENT_MODE=mock
# ALLOW_MOCK_PAYMENTS=true

# Mail (leave SMTP_HOST empty to only log emails)
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
MAIL_FROM=HigherStudy <no-reply@your-domain>
```

**Settings:**

- **Deploy → Pre-deploy command:** `npx prisma migrate deploy` (runs every migration before each release; a failed migration stops the deploy).
- **Deploy → Healthcheck path:** `/api/v1/health`
- **Networking:** no public domain needed — `web` reaches it on the private network. (Generate one
  only if something outside must call the API directly; then also set `TRUST_PROXY=1`.)
- **Source → Watch paths:** `apps/api/**` (so web-only changes don't redeploy the API).

## 4. Worker service

**Create → GitHub Repo →** same repo. Rename to `worker`.

**Variables:**

```
RAILWAY_DOCKERFILE_PATH=apps/api/Dockerfile
NODE_ENV=production
DATABASE_URL=${{Postgres.DATABASE_URL}}
REDIS_URL=${{Redis.REDIS_URL}}
PUBLIC_WEB_URL=https://${{web.RAILWAY_PUBLIC_DOMAIN}}
CRON_TZ=Asia/Dhaka
SMTP_HOST=${{api.SMTP_HOST}}
SMTP_PORT=${{api.SMTP_PORT}}
SMTP_USER=${{api.SMTP_USER}}
SMTP_PASS=${{api.SMTP_PASS}}
MAIL_FROM=${{api.MAIL_FROM}}
```

**Settings:** **Deploy → Custom start command:** `node dist/worker.js`. No domain, no healthcheck,
no pre-deploy command. Watch paths: `apps/api/**`. Keep it at **1 replica** (the schedulers are
idempotent, but one worker is enough).

## 5. Web service

**Create → GitHub Repo →** same repo. Rename to `web`.

**Variables:**

```
RAILWAY_DOCKERFILE_PATH=apps/web/Dockerfile
API_INTERNAL_URL=http://${{api.RAILWAY_PRIVATE_DOMAIN}}:4000
PROXY_SECRET=${{api.PROXY_SECRET}}
TRUSTED_PROXY_HOPS=1
```

These are read at runtime, so changing them only needs a restart, not a rebuild.
`TRUSTED_PROXY_HOPS=1` takes the visitor's IP from Railway's edge, so rate limits and the
"Where you're signed in" list see real client IPs.

**Settings:** **Networking → Generate domain.** Healthcheck path: `/api/v1/health` (it proves the
proxy can reach the API). Watch paths: `apps/web/**`.

## 6. Deploy

Generate the `web` domain first (the references above need it), then **Deploy** /
**Apply changes**. Order on first deploy: `api` (runs migrations) → `worker` → `web`.

Check:

- `https://<web-domain>/api/v1/health` → `{"status":"ok","db":"up","redis":"up"}`
- `https://<web-domain>/register` → sign up → you land on the profile setup.
- In the browser's dev tools, Application → Cookies: `hs_rt` is `HttpOnly`, `Secure`, `SameSite=Lax`.

## 7. First admin and (optional) demo data

The database starts empty. Either:

- **Demo data** (the CSV seed, including the demo admin and super admin accounts) — run once inside
  the API container, with a strong password for the seeded accounts:

  ```bash
  npm i -g @railway/cli
  railway login
  railway link            # pick the project
  railway ssh --service api
  # inside the container:
  SEED_PASSWORD='<strong password>' npx prisma db seed
  ```

  The seed refuses to run in production without `SEED_PASSWORD`. Change or remove the demo
  accounts afterwards.

- **Real data only** — register your own account in the web app, then promote it to super admin
  from the Postgres service's **Data → Query** tab:

  ```sql
  UPDATE "User" SET role = 'SUPER_ADMIN' WHERE email = 'you@your-domain';
  ```

  Then log in again. Add universities, programs and professors from **Admin → CSV import**.

## Updating

Push to the branch Railway watches. `api` runs `prisma migrate deploy` before switching traffic;
`worker` and `web` rebuild when their watch paths change.

After a release that changes cached data shapes you can clear the cache safely (it refills on
demand) from the Redis service's **Data** tab, or with `railway ssh --service api` and
`node -e "new (require('ioredis'))(process.env.REDIS_URL,{family:0}).flushdb().then(()=>process.exit())"`.

## Notes

- **Private networking:** `DATABASE_URL` / `REDIS_URL` references resolve to Railway's private
  hostnames (no egress cost). Redis clients use `family: 0` so IPv6-only private networks work.
- **Rate limits** are per client IP: the web proxy forwards it in `X-HS-Client-IP`, and the API
  trusts that header only with the matching `PROXY_SECRET`. If either service lacks the secret,
  every user shares one limit (the API logs a warning at startup).
- **Custom domain:** add it to `web` under **Networking**, then set `CORS_ORIGINS`,
  `PUBLIC_WEB_URL` and `PUBLIC_API_URL` on `api` to `https://<your-domain>`.
- **bKash callbacks** go to `PUBLIC_API_URL/api/v1/payments/callback/bKash` (the web domain);
  register that URL with your merchant account.
- **Sessions:** after deploying this version everyone signs in once more (old 1-day tokens
  carry no session and are refused).

## Troubleshooting

**Pre-deploy fails: `function hs_norm_tag(text) does not exist` (migration `20261022000100_search`).**
Fixed in the repo (the search functions now pin their `search_path`; PostgreSQL 17+ builds
indexes with a restricted one). Push the fix, then clear the failed attempt:

- *Database still empty* (first deploy): in **Postgres → Data**, run
  `DROP SCHEMA public CASCADE; CREATE SCHEMA public;` and redeploy `api`.
- *Database has data:* `railway ssh --service api`, then
  `npx prisma migrate resolve --rolled-back 20261022000100_search` and redeploy `api`.
  The migration is re-runnable, so it applies cleanly on the next deploy.

**Pre-deploy fails with `P3009` / "migrate found failed migrations".** A previous deploy's
migration failed and Prisma won't continue until it is resolved — same two options as above,
using the migration name from the error.
