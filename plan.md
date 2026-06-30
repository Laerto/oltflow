# neWave OLT Panel  with Name OLTFlow — Architecture & Build Plan



> A web platform for **managing, monitoring, and troubleshooting** ZTE GPON OLTs
> (C300 / C320) and their ONUs/ONTs.
>
> **Approach:** Re-implement the **exact app we have today, feature-for-feature**, in
> Next.js (App Router) + PostgreSQL + Redis on Docker Compose — same screens, same
> Albanian UI, same ZTE logic — with built-in architectural improvements. Once parity is
> reached, **new features are added step by step** on this foundation.

---

## 1. Purpose & Context

This document is the single source of truth for what the app **is today**, the **exact
port** we are building (same features + improvements), and the **step-by-step roadmap**
for parity and then growth. Every new feature should be checked against the architecture
and conventions defined here.

> **Scope rule:** v2.0 = *the current app, ported 1:1* (no feature added or removed during
> the port) on a better stack. Anything genuinely new is explicitly marked **[NEW]** and
> only happens **after** parity. Improvements during the port are limited to
> infrastructure/security (auth, encrypted creds, queues, caching, pooling) — they do not
> change what the user can do, only how safely/reliably it runs.

The product serves an ISP NOC / field-ops team that runs ZTE OLTs and needs to:

- See the live health of every OLT and ONU (online/offline, optical signal, distance).
- Authorize (provision) new ONUs that show up as "unconfigured".
- Configure PPPoE credentials and WiFi (via TR-069) on customer devices.
- Troubleshoot signal/connectivity problems quickly.

The current UI is in **Albanian** (sq-AL). We keep Albanian as the default locale but
build with i18n so English (and others) can be added later.

---

## 2. What We Have Today (v1.0 — "WiFi TR069 working")

### 2.1 High-level architecture (current)

```
┌──────────────┐      HTTP/JSON       ┌───────────────────┐    Telnet (23)   ┌──────────┐
│  Static HTML │  ─────────────────▶  │  FastAPI (main.py)│ ───────────────▶ │ ZTE OLT  │
│  + vanilla JS│  ◀─────────────────  │   uvicorn :8000    │                  │ C300/320 │
│ (index.html) │                      └─────────┬─────────┘                  └──────────┘
└──────────────┘                                │
       │ localStorage (OLT creds!)               │ psycopg2
       │                                          ▼
       │                               ┌────────────────────┐
       │                               │  PostgreSQL         │
       │                               │  db: acsflow        │
       │                               │  nw_olts/onus/signals│
       │                               └─────────▲──────────┘
       │                                          │ writes every 60s
       │                               ┌──────────┴──────────┐
       │                               │  sync_service.py     │ Telnet polling daemon
       │                               └─────────────────────┘
       │
       └── (WiFi) ──▶ GenieACS :7557  ── TR-069 ──▶ ONU
       └── (legacy) ─▶ ACSFlow API :80 (/api/v1)
```

### 2.2 Components (current)

**Backend — `backend/main.py` (FastAPI, ~712 lines)**
- Single-file API, `version 3.0.0`, CORS open to `*`.
- Talks to OLTs over **Telnet** (`telnetlib`) with hardcoded prompt parsing
  (`Username:` / `Password:` / `#`).
- In-memory dict cache (`_cache`, `_cache_ttl`, 120s TTL) — lost on restart, not shared.
- Direct `psycopg2` connections (no pool) to a Postgres DB named `acsflow` at `172.17.0.1`.
- Endpoints:
  - `GET /health`
  - `GET /api/acsflow/olts`, `/api/acsflow/olts/{id}/onus` — legacy ACSFlow proxy.
  - `POST /api/authorize-onu` — full ZTE provisioning sequence (interface, tcont,
    gemport, service-port, `pon-onu-mng`, OMCI flows, TR-069 ACS, security-mgmt).
  - `POST /api/set-pppoe` — sets `pppoe 1 nat enable user ... password ...`.
  - `POST /api/authorize-and-pppoe` — combined provisioning + PPPoE.
  - `POST /api/get-unconfigured` — parses `show gpon onu uncfg`.
  - `POST /api/onu-signal` — parses `show pon power attenuation` (RX/TX/atten, level).
  - `POST /api/onu-detail` — `show gpon onu detail-info` + signal + running config
    (name, type, state, serial, distance, profiles, VLAN, PPPoE, connection history).
  - `POST /api/get-all-onus` — loops slots/ports `show gpon onu state` + detail.
  - `POST /api/wifi-info`, `/api/wifi-update` — GenieACS TR-069 (2.4G/5G SSID + PSK).
  - `POST /api/cache-clear`, `GET /api/cache-status`.
  - `GET /api/db/olts`, `/api/db/onus/{id}`, `/api/db/stats/{id}`,
    `/api/db/signal-history/{onu_id}`, `POST /api/db/add-olt` — fast DB-backed reads.
- Hardcoded secrets in source: ACSFlow token, GenieACS URL, DB password.
- `main1.py`, `main3.py` are **older drafts** of the same logic (to be deleted).

**Sync daemon — `backend/sync_service.py` (~216 lines)**
- Standalone loop, every `60s` syncs ONU inventory; every `5 min` syncs optical signals.
- Iterates slots `[4, 15, 17, 19, 20]`, ports `1..16`, runs `show gpon onu state`,
  then per-ONU `detail-info` + `running config`.
- Upserts into `nw_onus` (on conflict `olt_id, pon_port`), inserts time-series rows
  into `nw_signals`, updates `nw_olts.status`/`last_sync`.
- **Bug noted:** the inner `for line in out.splitlines()` is mis-indented (runs once
  per slot using only the last port's output) — carry the fix into the rewrite.

**Frontend — `frontend/index.html` (~822 lines, single file)**
- Vanilla JS + Chart.js from CDN. No build step.
- Pages (client-side toggle): Dashboard, ONU-të (ONU list), ONU Detail, Unconfigured,
  Provizionim (provisioning), OLT-et (OLT management).
- Stat cards (waiting auth / online / offline / low signal), live line chart of online
  count, recent-activity feed.
- Modals: Add OLT, PPPoE, Full provision, WiFi.
- **OLT credentials stored in `localStorage`** (plaintext host/user/pass) — major
  security issue to fix.
- `index1.html` is an **older draft** (to be deleted).

**Infra — `docker-compose.yml`**
- Single service: `python:3.11-slim` installing deps at runtime via `pip install`,
  running `uvicorn ... --reload`, port `8001:8000`. Postgres/Redis are external/manual.

### 2.3 Implied database schema (current — never committed as a file)

Reconstructed from SQL in `main.py` / `sync_service.py`:

```sql
nw_olts (id, name, ip, port, username, password, location, status, last_sync, ...)
nw_onus (id, olt_id, pon_port, serial, name, type, state, distance,
         online_duration, vlan, pppoe_user, line_profile, service_profile, last_seen,
         UNIQUE(olt_id, pon_port))
nw_signals (id, onu_id, olt_rx, onu_rx, olt_tx, onu_tx,
            atten_up, atten_down, signal_level, recorded_at)
```

### 2.4 Domain knowledge captured (ZTE C300/C320 — preserve this!)

- **PON port format:** `gpon-onu_<frame>/<slot>/<port>:<onu_id>` e.g. `gpon-onu_1/15/1:1`.
- **OLT interface:** `gpon-olt_<frame>/<slot>/<port>`.
- **Provisioning sequence** (the working recipe, keep verbatim as a template):
  ```
  interface gpon-olt_1/15/15
    onu <id> type <F660|F673A...> sn <SERIAL>
  interface gpon-onu_1/15/15:<id>
    name <NAME>
    tcont 1 profile SMARTOLT-1G-UP
    gemport 1 tcont 1
    gemport 1 traffic-limit downstream SMARTOLT-1G-DOWN
    service-port 1 vport 1 user-vlan 40 vlan 40
  pon-onu-mng gpon-onu_1/15/15:<id>
    flow mode 1 tag-filter vlan-filter untag-filter discard
    flow 1 pri 0 vlan 40
    gemport 1 flow 1
    switchport-bind switch_0/1 iphost 1
    switchport-bind switch_0/1 veip 1
    vlan-filter-mode iphost 1 ...
    dhcp-ip ethuni eth_0/1..4 from-onu
    tr069-mgmt 1 state unlock
    tr069-mgmt 1 acs http://<acs>:7547/digest/tr069
    security-mgmt 1/998/999 ...
    pppoe 1 nat enable user <USER> password <PASS>
  ```
- **Signal thresholds** (ONU RX dBm): `>= -25` good, `-25..-27` warning, `< -27` critical.
- **ONU types in use:** F660, F660V6.0, F601, F670L, F673AV9V9.0, F6600PV9.0.12, ZTE-F660.
- **Profiles:** TCONT `SMARTOLT-1G-UP`, traffic `SMARTOLT-1G-DOWN`; default VLAN `40`.
- **Useful show commands:** `show gpon onu uncfg`, `show gpon onu state <olt-if>`,
  `show gpon onu detail-info <onu-if>`, `show pon power attenuation <onu-if>`,
  `show onu running config <onu-if>`. Always `terminal length 0` to disable paging.

### 2.5 Gaps found during implementation review (added after re-checking `olt-panel` + this VPS)

1. **Slot list is inconsistent between the two existing scan paths.** `sync_service.py`
   iterates slots `[4, 15, 17, 19, 20]`; `main.py`'s `/api/get-all-onus` only scans slot
   `15`. There is no single source of truth for "which slots exist on this OLT" — the
   port adapter must take the slot list as config (per-OLT), not a hardcoded constant in
   two places.
2. **The current app is not actually running on this VPS right now.** The `olt-backend`
   container doesn't exist (docker-compose was never `up`'d / was torn down); an
   `olt-frontend` nginx container exists but is stopped; there is no nginx vhost serving
   `frontend/index.html` (the only enabled vhost is `acsflow`, the legacy Laravel CRM at
   `/srv/acsflow`, catch-all on `:80`). Postgres (`acsflow` db) and GenieACS run as
   **native host services**, not in Docker. Don't assume there's a clickable v1.0 instance
   to compare against — read the source, don't probe a live UI.
3. **Port collision:** `genieacs-ui` already listens on **`:3000`** on this host (native
   systemd service). The Next.js dev/start default is also `:3000` — v2.0's `web` service
   must bind a different host port (compose already remaps `web` separately, just don't
   default it back to 3000 when running outside Docker).
4. **Next.js 16 breaking changes relevant to this plan** (installed version is 16.2.9 —
   see `AGENTS.md`, this is not the Next.js in training data):
   - `middleware.ts` is **deprecated and renamed to `proxy.ts`** (exported function is
     also renamed `proxy`). Any route-protection/auth gate must be written as `proxy.ts`,
     not `middleware.ts`.
   - Caching model changed to **Cache Components** (`cacheComponents` + `"use cache"`
     directive) replacing the old fetch-cache/`revalidate` model. Live device/ONU data
     must never pick up `"use cache"` — only opt specific, genuinely-static reads into it.
   - Route handler `params` are `Promise`-based (`const { id } = await params`).
5. **Resolved decisions** (were open in §11, now settled): databases are **fresh** (new
   Postgres + Redis, both in Docker Compose — no migration from the native `acsflow` DB).
   Repo is restructured into the **monorepo** layout in §5 now, not deferred.

### 2.6 Pain points / risks in v1.0 (what we are fixing)

1. **Security:** OLT credentials in browser `localStorage`; secrets hardcoded in source;
   CORS `*`; no authentication/authorization at all.
2. **Telnet** is plaintext and brittle (prompt scraping, fixed `time.sleep` delays). No
   SSH option, no connection reuse, no concurrency control per OLT.
3. **No connection pooling** to Postgres; a connection per request.
4. **In-memory cache** is per-process, lost on restart, can't scale horizontally.
5. **Monolithic files**: 700-line backend, 800-line HTML — hard to extend/test.
6. **No tests, no migrations, no CI, no observability.**
7. **Blocking I/O** (telnet/db) inside async FastAPI handlers → poor concurrency.
8. **No audit trail** of who changed what on the network.

---

## 3. Target Architecture (v2.0)

### 3.1 Guiding principles

- **Separation of concerns:** UI ≠ API ≠ device-control ≠ background workers.
- **Stateless web tier**, shared state in Postgres + Redis → horizontal scaling.
- **Everything in Docker Compose**, reproducible, env-driven config, no runtime `pip install`.
- **Typed end-to-end** (TypeScript everywhere; typed device adapters in the worker).
- **Safe by default:** auth on every route, secrets in env/secrets, encrypted OLT creds,
  audit logging of all write operations to the network.
- **Extensible adapters:** OLT vendor logic behind an interface so new models/vendors
  (e.g. C600, Huawei) drop in without touching the rest.

### 3.2 Target topology

```
                       ┌────────────────────────────────────────────┐
                       │            Docker Compose network            │
                       │                                              │
  Browser ──HTTPS──▶  │  ┌────────────┐   server actions / route     │
                       │  │  Next.js    │   handlers (App Router)      │
                       │  │  web (:3000)│◀──────────────┐              │
                       │  └─────┬──────┘                │              │
                       │        │ Prisma                │ BullMQ jobs  │
                       │        ▼                        │ (enqueue)   │
                       │  ┌────────────┐         ┌───────┴─────────┐   │
                       │  │ PostgreSQL │         │     Redis        │   │
                       │  │  (:5432)    │◀───────▶│ cache + queues   │   │
                       │  └─────▲──────┘         └───────▲─────────┘   │
                       │        │ writes inventory       │ consume      │
                       │  ┌─────┴──────────────────────┴──────────┐   │
                       │  │  Worker (Node/TS)                       │   │
                       │  │   • sync scheduler (inventory/signals)  │   │
                       │  │   • device adapters (SSH/Telnet)        │   │
                       │  │   • provisioning / pppoe / wifi jobs    │   │
                       │  └───────────┬──────────────┬────────────┘   │
                       └──────────────┼──────────────┼────────────────┘
                                      │ SSH/Telnet   │ TR-069 HTTP
                                      ▼              ▼
                                ┌──────────┐   ┌─────────────┐
                                │ ZTE OLTs │   │  GenieACS    │
                                │ C300/320 │   │  (:7557 NBI) │
                                └──────────┘   └─────────────┘
```

### 3.3 Why this split

- **Next.js web** handles UI + API (route handlers / server actions). It never talks to
  OLTs directly — it reads from Postgres/Redis (fast) and **enqueues jobs** for any
  device action.
- **Worker** owns all device communication and the periodic sync. This isolates slow,
  flaky network I/O from the request path, lets us rate-limit per OLT, retry, and scale
  workers independently.
- **Redis** = cache (replaces the in-memory dict) **and** job queue (BullMQ) **and**
  pub/sub for realtime updates pushed to the browser.
- **Postgres** = system of record (OLT inventory, ONU inventory, signal time-series,
  users, audit log, job results).

---

## 4. Technology Stack (v2.0)

| Layer            | Choice                                   | Notes |
|------------------|------------------------------------------|-------|
| Frontend / API   | **Next.js 14+ (App Router), TypeScript** | RSC + route handlers + server actions |
| UI styling       | **Tailwind CSS** + shadcn/ui             | Rebuild current look (cards, badges, modals) |
| Charts           | **Recharts** (or keep Chart.js)          | Replace CDN Chart.js |
| Data layer (ORM) | **Prisma**                               | Migrations, typed queries, pooling |
| DB               | **PostgreSQL 16**                        | + optional TimescaleDB for `nw_signals` |
| Cache / queue    | **Redis 7** + **BullMQ**                 | Cache, queues, pub/sub |
| Worker           | **Node.js + TypeScript**                 | Shares Prisma client + types with web |
| Device I/O       | **ssh2** / **telnet** (node) adapters    | Prefer SSH; Telnet fallback for legacy |
| TR-069           | **GenieACS NBI** (HTTP)                   | WiFi + remote ONU mgmt |
| Auth             | **Auth.js (NextAuth)** + RBAC            | Credentials + sessions, roles |
| Validation       | **Zod**                                  | Shared request/response schemas |
| Realtime         | **SSE** (or WebSocket) backed by Redis   | Live dashboard/signal updates |
| Tests            | **Vitest** + **Playwright**              | Unit + e2e |
| Observability    | **pino** logs, **/health**, Prometheus   | Metrics + structured logs |
| CI               | **GitHub Actions**                       | lint, typecheck, test, build |

> **Decision pending (see §11):** worker in Node/TS (shared types, one language) vs.
> keeping the proven Python device code as a separate FastAPI/worker service. Default
> recommendation: **Node/TS worker** for a single-language, type-shared codebase, porting
> the ZTE command logic 1:1 from `main.py`/`sync_service.py`.

---

## 5. Repository Layout (target monorepo)

```
olt-panel/
├── docker-compose.yml            # web, worker, postgres, redis (+ genieacs optional)
├── docker-compose.prod.yml       # prod overrides (no reload, replicas, healthchecks)
├── .env.example                  # all config documented here
├── plan.md                       # THIS FILE
├── packages/
│   ├── db/                       # Prisma schema, migrations, seed, generated client
│   │   ├── schema.prisma
│   │   └── migrations/
│   ├── core/                     # shared TS: types, Zod schemas, ZTE command templates,
│   │   │                         #   signal thresholds, pon-port parser, constants
│   │   └── src/
│   └── adapters/                 # device adapters (interface + ZTE C300/C320 impl)
│       └── src/
├── apps/
│   ├── web/                      # Next.js app (UI + API route handlers + server actions)
│   │   ├── app/
│   │   │   ├── (dashboard)/      # dashboard, onus, onu/[id], unconfigured, provision, olts
│   │   │   ├── api/              # route handlers (health, internal endpoints)
│   │   │   └── login/
│   │   ├── components/           # ui (shadcn), domain components
│   │   ├── lib/                  # prisma client, redis client, auth, queue enqueue
│   │   └── messages/             # i18n: sq.json (default), en.json
│   └── worker/                   # BullMQ workers + sync scheduler
│       └── src/
│           ├── queues/           # provision, pppoe, wifi, sync
│           ├── sync/             # inventory + signal pollers
│           └── index.ts
└── .github/workflows/ci.yml
```

---

## 6. Data Model (v2.0 — Prisma)

Migrate the implied schema into versioned Prisma migrations, plus new tables for auth,
audit, and jobs. Encrypt OLT credentials at rest.

```prisma
model Olt {
  id            Int       @id @default(autoincrement())
  name          String
  ip            String    @unique
  port          Int       @default(23)
  protocol      String    @default("telnet")   // telnet | ssh
  username      String
  passwordEnc   String                          // AES-GCM encrypted
  location      String?
  vendor        String    @default("zte")
  model         String?                          // C300 | C320
  status        String    @default("unknown")    // online | offline | unknown
  lastSync      DateTime?
  onus          Onu[]
  createdAt     DateTime  @default(now())
}

model Onu {
  id              Int       @id @default(autoincrement())
  oltId           Int
  olt             Olt       @relation(fields: [oltId], references: [id], onDelete: Cascade)
  ponPort         String                          // gpon-onu_1/15/1:1
  serial          String?
  name            String?
  type            String?
  state           String?                         // working | fail | offline ...
  distance        String?
  onlineDuration  String?
  vlan            String?
  pppoeUser       String?
  lineProfile     String?
  serviceProfile  String?
  lastSeen        DateTime?
  signals         Signal[]
  @@unique([oltId, ponPort])
  @@index([serial])
  @@index([state])
}

model Signal {
  id          BigInt   @id @default(autoincrement())
  onuId       Int
  onu         Onu      @relation(fields: [onuId], references: [id], onDelete: Cascade)
  oltRx       Float?
  onuRx       Float?
  oltTx       Float?
  onuTx       Float?
  attenUp     Float?
  attenDown   Float?
  signalLevel String?                             // good | warning | critical
  recordedAt  DateTime @default(now())
  @@index([onuId, recordedAt])
}                                                 // candidate TimescaleDB hypertable

model User {
  id        Int      @id @default(autoincrement())
  email     String   @unique
  name      String?
  passwordH String
  role      String   @default("operator")         // admin | operator | viewer
  createdAt DateTime @default(now())
}

model AuditLog {
  id        BigInt   @id @default(autoincrement())
  userId    Int?
  action    String                                // authorize_onu | set_pppoe | wifi_update | add_olt ...
  oltId     Int?
  ponPort   String?
  payload   Json?                                 // sanitized (no plaintext passwords)
  result    String?                               // success | error
  createdAt DateTime @default(now())
  @@index([createdAt])
  @@index([action])
}

model Job {
  id        String   @id                          // BullMQ job id
  type      String
  status    String                                // queued | active | done | failed
  oltId     Int?
  ponPort   String?
  output    String?                               // raw device output (troubleshooting)
  error     String?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

---

## 7. API & Action Surface (v2.0)

All routes require an authenticated session; writes require `operator`+ role and are
**audit-logged**. Reads come from Postgres/Redis; writes **enqueue jobs** to the worker.

**Read (fast, DB/cache):**
- `GET /api/olts` — list with rollups (total/online/offline). (was `/api/db/olts`)
- `GET /api/olts/:id/onus` — ONU inventory + latest signal. (was `/api/db/onus/:id`)
- `GET /api/olts/:id/stats` — counts + warning/critical signal. (was `/api/db/stats/:id`)
- `GET /api/onus/:id/signal-history` — time series. (was `/api/db/signal-history/:id`)
- `GET /api/health` — liveness/readiness (db + redis + worker heartbeat).
- `GET /api/events` — **SSE** stream for live dashboard/ONU updates.

**Write (enqueue job, return jobId; poll or SSE for result):**
- `POST /api/olts` — add OLT (test connection in worker, store encrypted creds).
- `POST /api/olts/:id/scan-unconfigured` — `show gpon onu uncfg`.
- `POST /api/provision` — authorize ONU (full ZTE recipe).
- `POST /api/provision/pppoe` — set PPPoE.
- `POST /api/provision/authorize-pppoe` — combined.
- `POST /api/onus/:id/refresh` — on-demand detail/signal pull.
- `POST /api/wifi/update` — TR-069 WiFi 2.4G/5G via GenieACS.

**Worker queues (BullMQ):** `sync-inventory`, `sync-signals`, `provision`, `pppoe`,
`wifi`, `olt-connect-test`. Each job persists to `Job` + `AuditLog`, emits Redis pub/sub
event consumed by the SSE endpoint.

---

## 8. Frontend (v2.0) — preserve UX, modernize stack

Rebuild the existing pages as React components, keeping the current visual language
(stat cards, colored badges, signal pills, modals) and Albanian copy:

- **Dashboard** — 4 stat cards (waiting auth / online / offline / low signals), live
  online-count chart (Recharts), OLT list sidebar, recent activity feed (from `AuditLog`).
- **ONU-të** — searchable/filterable table; signal pill with thresholds; row actions
  (Detaje, PPPoE). Server-side pagination for large OLTs.
- **ONU Detail** — info panel, optical signal cards (ONU/OLT RX/TX, attenuation),
  connection history, WAN/PPPoE, WiFi (TR-069) panel with edit modal.
- **Unconfigured** — scan + one-click provision/PPPoE.
- **Provizionim** — Authorize, PPPoE, and combined forms + provision modal.
- **OLT-et** — OLT CRUD table (status, ONU count, last sync) — creds now server-side.
- **Auth** — login page; role-gated nav and actions.
- **i18n** — `sq` (default) + `en`, copy in `messages/*.json`.
- **Realtime** — subscribe to `/api/events` to live-update cards/tables without polling
  (replaces the 120s `setInterval`).

---

## 9. Docker Compose (v2.0 sketch)

```yaml
services:
  web:
    build: { context: ., dockerfile: apps/web/Dockerfile }
    env_file: .env
    ports: ["3000:3000"]
    depends_on: [postgres, redis]
    restart: unless-stopped

  worker:
    build: { context: ., dockerfile: apps/worker/Dockerfile }
    env_file: .env
    depends_on: [postgres, redis]
    restart: unless-stopped
    # scale: docker compose up --scale worker=N

  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: oltpanel
      POSTGRES_USER: oltpanel
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    volumes: ["pgdata:/var/lib/postgresql/data"]
    healthcheck: { test: ["CMD-SHELL","pg_isready -U oltpanel"], interval: 10s }

  redis:
    image: redis:7-alpine
    command: ["redis-server","--appendonly","yes"]
    volumes: ["redisdata:/data"]

volumes: { pgdata: {}, redisdata: {} }
```

`.env.example` keys: `DATABASE_URL`, `REDIS_URL`, `NEXTAUTH_SECRET`, `OLT_CRED_KEY`
(encryption key), `GENIEACS_URL`, optional `ACSFLOW_URL`/`ACSFLOW_TOKEN`, `SYNC_INTERVAL`,
`SIGNAL_INTERVAL`.

---

## 10. Roadmap — Port to Parity, then Grow

The roadmap is split in two: **Part A** ports today's app 1:1 onto the new stack (the
finish line is "everything the old app did, working the same way"). **Part B** is where we
add new capabilities, one feature at a time, each as its own small phase.

### Part A — Port the existing app to parity (no new features)

**Phase 0 — Foundation**
- [ ] Init monorepo (`apps/web`, `apps/worker`, `packages/{db,core,adapters}`).
- [ ] Docker Compose with postgres + redis + web + worker; `.env.example`.
- [ ] Prisma schema + first migration; port implied `nw_*` schema; add users/audit/jobs.
- [ ] `packages/core`: pon-port parser, signal thresholds, ZTE command templates, Zod
      schemas, ONU type/profile constants — ported verbatim from `main.py`.

**Phase 1 — Read path & dashboard parity**
- [ ] Prisma-backed read APIs (`/api/olts`, `/onus`, `/stats`, `/signal-history`).
- [ ] Redis caching layer (replaces in-memory dict).
- [ ] Rebuild Dashboard + ONU list + ONU detail in Next.js (Albanian, current look).
- [ ] Auth.js login + RBAC; move OLT credentials out of the browser to the server.

**Phase 2 — Device worker & sync (parity)**
- [ ] `packages/adapters`: ZTE C300/C320 adapter, porting connect/login/
      `terminal length 0`/send-command + **all** parsers from `main.py`/`sync_service.py`.
- [ ] BullMQ queues + sync scheduler (inventory 60s, signals 5m); **fix the slot/port
      loop indentation bug** carried from `sync_service.py`.
- [ ] Per-OLT concurrency limit + retries + backoff; persist `Job` + `AuditLog`.

**Phase 3 — Write path parity (provisioning + WiFi)**
- [ ] Authorize ONU, set PPPoE, authorize+PPPoE as worker jobs (exact ZTE recipe).
- [ ] Unconfigured scan + one-click provision UI; encrypt OLT creds at rest.
- [ ] GenieACS WiFi: info + 2.4G/5G update (port `/api/wifi-info`, `/api/wifi-update`).
- [ ] Add-OLT flow (connection test in worker) + OLT management table.

**✅ Parity gate:** every screen and action of the current `index.html` works on the new
stack. The old `backend/` + `frontend/` can be retired. **Stop adding nothing until here.**

### Part B — New features, added step by step  **[NEW]**

Each item below is opt-in, shipped independently after parity. Order is a suggestion; pick
per priority. None of these change Part A behavior.

- [ ] **Realtime UI** — SSE/WebSocket so dashboard, ONU tables, and job status update
      live (replaces the 120s polling).
- [ ] **Troubleshooting workspace** — signal-history charts, connection-history timeline,
      "why is this ONU down" helper, ONU reboot/diagnostics via TR-069.
- [ ] **Bulk operations** — provision / set-PPPoE / WiFi across many ONUs at once.
- [ ] **Alerting** — notify on signal critical, ONU down, OLT unreachable
      (email / Telegram / webhook).
- [ ] **Reporting & exports** — CSV/PDF of inventory, signal trends, uptime.
- [ ] **Customer/subscriber mapping** — link ONUs to customers, search by customer.
- [ ] **More OLT models / vendors** — new adapters (e.g. ZTE C600, Huawei) behind the
      same interface, no UI/API changes.
- [ ] **Config backup/restore & change history** per OLT.
- [ ] **Multi-tenancy / org scoping** if more than one ISP is served.

### Cross-cutting — Hardening & scale (ongoing)
- [ ] Vitest unit tests (parsers, command builders), Playwright e2e (provision flow).
- [ ] pino structured logs, Prometheus metrics, health/readiness probes.
- [ ] GitHub Actions CI (lint, typecheck, test, build, migrate-check).
- [ ] Prod compose (no `--reload`, worker replicas, resource limits, backups).
- [ ] Optional TimescaleDB hypertable + retention for `signals`.

---

## 11. Open Decisions

1. ~~**Worker language**~~ — **Resolved: Node/TS**, shared types with `apps/web` via
   `packages/core`.
2. **OLT transport:** enable **SSH** on OLTs (preferred, secure) or keep **Telnet**? Build
   both; default per-OLT via `protocol` column. *Telnet first (parity), SSH after.*
3. **Realtime:** SSE (simpler) vs. WebSocket (bidirectional). Default: SSE.
4. **Signal storage:** plain Postgres vs. TimescaleDB. Default: plain now, Timescale later.
5. **GenieACS / ACSFlow:** keep both, or consolidate TR-069 on GenieACS only? GenieACS is
   confirmed live on this VPS (`genieacs-cwmp`/`-fs`/`-nbi`/`-ui` systemd services) — safe
   to integrate against now.
6. **Multi-tenancy:** single ISP now; design `User`/`AuditLog` so org scoping can be added.
7. ~~**Database**~~ — **Resolved: fresh Postgres + Redis**, both provisioned in Docker
   Compose. No migration from the native `acsflow` DB.
8. ~~**Repo layout**~~ — **Resolved: monorepo now** (§5), not deferred.
9. **Auth library:** plan originally named Auth.js (NextAuth). Given Next.js 16.2.9 is
   very new, **default to a minimal hand-rolled session (signed httpOnly cookie + bcrypt
   password hash), gated by `proxy.ts`** rather than pulling in NextAuth and risking a
   version-compatibility fight; revisit NextAuth once it has confirmed Next 16 support.

---

## 12. Conventions (for every future feature)

- **Never** let the web tier talk to OLTs directly — always enqueue a worker job.
- **Never** store device credentials in the browser; always encrypted server-side.
- All **write actions** must create an `AuditLog` row (sanitized; no plaintext passwords
  in logs/output).
- All external input validated with **Zod**; shared schemas live in `packages/core`.
- Device command logic lives in `packages/adapters` behind the adapter interface; adding a
  new OLT model = new adapter, no UI/API changes.
- ZTE command templates and signal thresholds are **single-sourced** in `packages/core` —
  do not duplicate the strings inline.
- Every new env var is documented in `.env.example`.
- Migrations are forward-only and committed with the feature that needs them.

---

## 13. Cleanup TODO (carried from v1.0)

- [ ] Delete dead drafts: `backend/main1.py`, `backend/main3.py`, `frontend/index1.html`.
- [ ] Remove hardcoded secrets (ACSFlow token, DB password, GenieACS URL) → env.
- [ ] Replace open CORS `*` with explicit allowlist.
- [ ] Fix `sync_service.py` slot/port parsing indentation bug.
- [ ] Add DB connection pooling (Prisma handles this).
- [ ] Commit the database schema as versioned migrations (currently implicit).


# the app now uses telnet but we need to implement ssh and snmp to read from OLTs and execute commands on them i need this app for multiple OLTs like 100 OLTs with 1000 ONTs each 

# on the same vps genie is running API URL http://localhost:7557 UI URL http://localhost:3000

# oltflow and genieacs are in the same local vps  with ip 10.88.88.99