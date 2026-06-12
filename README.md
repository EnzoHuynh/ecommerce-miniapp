# E-commerce Mini-App

A small but production-minded e-commerce product catalog: secure authentication,
persistent-yet-inactivity-bounded sessions, and a high-performance infinite-scroll
catalog over a large dataset.

**Stack:** Next.js (App Router) · NestJS · PostgreSQL (Prisma) · pnpm + Turborepo monorepo.

---

## 1. Quick start

### Prerequisites

- Node.js **>= 20**
- pnpm **>= 9** (`npm i -g pnpm`)
- A PostgreSQL database — either:
  - **Docker** (local): `docker compose up -d` (starts Postgres on `localhost:5432`), or
  - **Neon / any managed Postgres**: copy your connection string.

### Setup

```bash
# 1. Install dependencies
pnpm install

# 2. Configure environment
cp .env.example .env
#   - set DATABASE_URL (the docker-compose default is already filled in)
#   - set a strong JWT_ACCESS_SECRET:
#     node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"

# 3. Prepare the database in one command
#    (generate Prisma client → sync schema → seed 10k products + demo user)
pnpm setup

# 4. Run both apps (web :3000, api :3001)
pnpm dev
```

> **Fastest path for reviewers:** with Docker, `docker compose up -d` then
> `cp .env.example .env` needs **no edits** — the default `DATABASE_URL` already
> points at the compose Postgres, and the example `JWT_ACCESS_SECRET` is valid as-is.
> So the whole setup is: `docker compose up -d && cp .env.example .env && pnpm install && pnpm setup && pnpm dev`.

Open **http://localhost:3000**. Demo credentials are pre-filled:

```
email:    demo@example.com
password: Password123!
```

> **Note on corporate TLS proxies (Windows):** if `pnpm install` fails with
> `UNABLE_TO_VERIFY_LEAF_SIGNATURE`, your network re-signs TLS. Export your
> Windows root CAs to a PEM bundle and set `NODE_EXTRA_CA_CERTS` to it.

---

## 2. Architecture & key decisions

### Monorepo (pnpm workspaces + Turborepo)

```
apps/api        → NestJS backend
apps/web        → Next.js frontend
packages/shared → Zod schemas + constants shared by BOTH ends
```

The **shared package is the single source of truth for the API contract** (login
payload, product query/response, page-size bounds). The frontend and backend
import the *same* Zod schemas, so they can never drift — e.g. the UI cannot offer
a page size the API would reject.

### Authentication & sessions — the core of the brief

The brief asks for two things that are in tension: **persistent sessions**
(survive a browser restart) *and* **invalidation after 30 minutes of inactivity**.
The design satisfies both:

| Token | Lifetime | Stored | Purpose |
| --- | --- | --- | --- |
| **Access token** (JWT) | 15 min | in **memory** (never `localStorage`) | authorizes API calls |
| **Refresh token** (opaque, 256-bit) | 7 days | **httpOnly · Secure · SameSite=Lax** cookie, hashed in DB | renews the access token |

- **Persistence:** the refresh cookie has a `Max-Age` (it is *not* a session
  cookie), so it survives tab close / browser restart. On app boot the client
  performs a **silent refresh** to restore the session.
- **Inactivity (30 min):** every refresh checks a server-side **sliding window**
  (`lastActivityAt`). Past 30 minutes of inactivity, the session is revoked and
  re-authentication is required. The client mirrors this with a 30-min idle timer
  for an immediate UX response.
- **Refresh-token rotation + theft detection:** each refresh issues a new token
  and revokes the old one, linked by a `familyId`. Replaying an already-rotated
  token is treated as theft → **the whole family is revoked**.
- **Access tokens in memory, not `localStorage`:** an XSS payload can't exfiltrate
  them.

**Brute-force & spam protection (all local, no external service):**

- **Rate limiting** (`@nestjs/throttler`): 100 req/min/IP globally, **10/min/IP on
  `/auth/login`**.
- **Per-account lockout:** 5 failed attempts within 15 min → **HTTP 423 Locked**,
  checked *before* the password is verified.
- **Honeypot field:** a hidden `website` input; bots that auto-fill it are rejected
  (HTTP 400) without bothering a human with a captcha.
- **Argon2id** password hashing; a **dummy verify** runs for unknown emails so
  response timing can't be used to enumerate accounts.
- **CSRF:** `SameSite=Lax` + a required `X-Requested-With` header on
  cookie-authenticated, state-changing routes. **Helmet** sets security headers;
  CORS is an explicit allow-list with credentials (no wildcard).

### Catalog & infinite scroll

- **Keyset (cursor) pagination** ordered by `(createdAt, id)`, backed by a
  composite index — *not* `OFFSET`. Page 1,000 costs the same as page 1, and the
  feed is **stable under concurrent inserts** (no skipped/duplicated rows). The
  cursor is an opaque base64 token.
- **Configurable page size, strictly validated to `[5, 50]`** by the shared Zod
  schema. Out-of-range values are **rejected with HTTP 400** rather than silently
  clamped — explicit over implicit.
- **Frontend performance:** TanStack Query `useInfiniteQuery` + **`@tanstack/react-virtual`
  row virtualization**. Only the visible rows are mounted, so the list stays
  smooth with **10,000+ products** (the DOM never holds more than a few dozen
  nodes). The next page is prefetched as the sentinel row enters the viewport.

### Why these libraries

- **Prisma** — type-safe queries end-to-end and declarative schema/migrations; the
  same schema targets local Postgres or Neon by only swapping `DATABASE_URL`.
- **TanStack Query** — battle-tested caching/pagination, removes hand-rolled
  fetch/cache/retry state.
- **Zod** — runtime validation that doubles as the shared static contract.

---

## 3. Project layout

```
apps/api
  src/
    auth/         login, token rotation, guards, cookies, CSRF
    products/     keyset pagination + opaque cursor
    config/       env parsing & validation (Zod)
    prisma/       PrismaService
  prisma/         schema.prisma + seed (10k products)
  test/           e2e (pagination bounds & cursor passthrough)
apps/web
  src/
    app/          App Router pages (login, products)
    components/   virtualized ProductList
    lib/          auth context + authenticated fetch (silent refresh)
    hooks/        inactivity timeout
packages/shared   Zod schemas, constants, shared types
.github/workflows CI pipeline
```

---

## 4. Useful commands

| Command | Description |
| --- | --- |
| `pnpm dev` | Run web + api in watch mode |
| `pnpm build` | Build all packages |
| `pnpm lint` / `pnpm typecheck` | Lint / typecheck the workspace |
| `pnpm --filter @app/api test` | API unit tests |
| `pnpm --filter @app/api test:e2e` | API e2e tests |
| `pnpm setup` | One-shot DB bootstrap: generate client + sync schema + seed |
| `pnpm db:push` / `pnpm db:seed` | Sync schema / seed data |

---

## 5. CI/CD

`.github/workflows/ci.yml` runs on every push/PR to `main` and spins up a real
PostgreSQL service container to:

1. install (frozen lockfile) → 2. build the shared package → 3. generate the
Prisma client → 4. **apply the schema to a live Postgres** → 5. lint →
6. typecheck → 7. unit tests → 8. e2e tests → 9. build.

This validates the schema, types, tests, and production build on every change.

---

## 6. Testing

Focused on the highest-risk logic (per the senior brief):

- **Auth** — refresh-token reuse revokes the family, the 30-min inactivity window,
  expiry, account lockout (423), invalid-credential handling, timing-safe unknown
  email.
- **Pagination** — `limit` bounds (5/50 → 400), default, opaque-cursor round-trip
  and rejection of malformed cursors, keyset `WHERE`-clause construction, and an
  e2e pass over the controller (validation + cursor passthrough).

---

## 7. Notable trade-offs

- **Stateless access-token guard:** the product feed doesn't hit the DB per
  request; session revocation is enforced at refresh time and bounded by the
  15-min access TTL. A redis/DB check per request would tighten logout-to-effect
  latency at a throughput cost.
- **`prisma db push` over migration history:** chosen for take-home simplicity;
  `prisma migrate dev` is wired (`prisma:migrate:dev`) for a real migration flow.
- **Plain `<img loading="lazy">`** instead of `next/image`: rows are already
  windowed by the virtualizer, so the extra optimization buys little here.
