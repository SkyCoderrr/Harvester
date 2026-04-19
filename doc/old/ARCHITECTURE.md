# Harvester — Architecture Decision Record (ARCHITECTURE.md)

> **Doc ID:** ARCHITECTURE.md
> **Version:** 1.0 (authoritative for v1 architectural decisions)
> **Audience:** Downstream AI authors (IMPLEMENTATION.md, Claude Code build agent). Not human-facing.
> **Format:** Dense, precise. ADRs numbered and immutable once "Accepted." Append, do not edit.
> **Status of this file:** Accepted. All ADRs herein are binding on IMPLEMENTATION.md.
> **Supersedes:** Nothing. First ADR set for Harvester.
> **Cross-refs:** `PRD.md` (requirements), `UI_DESIGN.md` (visual), `UI_HANDOFF.md` (frontend contract), `IMPLEMENTATION.md` (build plan — consumes this doc).

---

## 0. Conventions & Document Structure

- **ADR-NNN** = immutable decision record. Once "Accepted," changes require a new ADR that supersedes the old one.
- **P0 / P1 / P2** inherit from PRD §0.
- **Phase 1 / 2 / 3** inherit from PRD §13.
- All paths in Windows form (primary target) with POSIX equivalent where relevant.
- ADRs are organized by layer: runtime (001–010), data & persistence (011–020), networking & API (021–030), application logic (031–040), frontend (041–050), cross-cutting (051+).
- "Rejected" options are kept verbatim in each ADR — downstream must not re-litigate without an override.

---

## 1. System Overview

Harvester is a **single-process Node.js 20 LTS application** that runs on the user's Windows/POSIX desktop. It embeds:

1. **HTTP + SSE server** (Fastify) serving REST JSON on `/api/*` and streaming events on `/api/logs/stream` and `/api/service/events`, plus static-file-serving the built React SPA from `/`.
2. **SQLite database** at `%APPDATA%\Harvester\harvester.db` accessed synchronously via `better-sqlite3`.
3. **Worker modules** (poller, downloader, lifecycle, profile-probe, emergency-monitor) that run on independent timer loops sharing the same Node event loop.
4. **External integrations** — M-Team API (via yeast.js SDK + raw-HTTP fallback in one wrapper module), qBittorrent WebUI API v2 (thin wrapper).

The React SPA is **prebuilt** and bundled into the distribution. There is no dev-time reverse proxy required — Fastify serves both API and static assets in production. During development, Vite runs on a separate port and proxies `/api` to Fastify.

### 1.1 High-level block diagram (textual)

```
                                            +--------------------+
                                            | User's Browser(s)  |
                                            |  (localhost + LAN) |
                                            +---------+----------+
                                                      |
                                                      | HTTP + SSE
                                                      v
+---------------------------------------------------------------------+
|                      Harvester Node.js Process                       |
|  (single event loop, single OS process)                              |
|                                                                      |
|  +---------------------+       +------------------------------+      |
|  |   HTTP/SSE Server   |<----->|    Service State Manager     |      |
|  |   (Fastify + auth)  |       |  (in-mem + service_state tbl)|      |
|  +----------+----------+       +---------------+--------------+      |
|             |                                   ^                    |
|             v                                   |                    |
|  +--------------------+   +-------------------+ |  +---------------+ |
|  |   Static SPA       |   | TanStack Query <- /   | Event Bus     | |
|  |   (React build)    |   | API handlers          | (EventEmitter)| |
|  +--------------------+   +-------+-----------+   +-------+-------+ |
|                                    |                       ^         |
|                                    v                       |         |
|  +-------+  +---------+  +-----------+  +------------+  +----------+ |
|  |Poller |  |Rule Eng.|  |Downloader |  | Lifecycle  |  |Emergency | |
|  |loop   |->|(pure fn)|->|(qBt add)  |  |loop        |  |monitor   | |
|  +---+---+  +---------+  +-----+-----+  +------+-----+  +----+-----+ |
|      |                         |               |              |      |
|      v                         v               v              v      |
|  +--------------------------------------------------------------+    |
|  |                  SQLite (better-sqlite3, WAL)                 |    |
|  |   torrent_events | rule_sets | poll_runs | grab_queue |       |    |
|  |   logs | stats_daily | lifecycle_peer_state | profile_snaps | |    |
|  |   service_state | rule_sets_archive | schema_migrations      |    |
|  +--------------------------------------------------------------+    |
|                                                                      |
|  +----------------+                         +-----------------+      |
|  | yeast.js SDK + |<----- HTTPS ----------> |  M-Team API     |      |
|  | raw-HTTP fbck  |                         +-----------------+      |
|  +----------------+                                                  |
|                                                                      |
|  +----------------+                         +-----------------+      |
|  | qBt Client     |<----- HTTP ------------>|  qBittorrent    |      |
|  | (fetch + cookie)|                         |  WebUI :8080    |     |
|  +----------------+                                                  |
|                                                                      |
|  +----------------+                                                  |
|  | File logger    |-------> %APPDATA%\Harvester\logs\*.jsonl         |
|  +----------------+                                                  |
+---------------------------------------------------------------------+
```

### 1.2 Data flow — happy path ("torrent observed → grabbed")

1. **Poller** fires every `poll_interval_sec` (default 90 s). Calls M-Team `POST /api/torrent/search` via yeast.js.
2. For each result: **dedup** against `torrent_events.mteam_id`. New rows inserted with `decision = ?` (TBD in step 4).
3. **Rule engine** (pure function) is invoked with `(torrent_normalized, enabled_rule_sets[], now, free_disk_gib)`. Returns `{decision, matched_rule_set_names, rejection_reason}`.
4. On `GRABBED` decision: **Downloader** receives the tuple. Requests `genDlToken`, POSTs multipart to qBt `torrents/add` with tags. Updates `torrent_events` row with `decision=GRABBED, matched_rule=...`. Queues on failure in `grab_queue`.
5. **Event bus** emits `torrent:decision` event. SSE endpoint forwards to connected clients. Dashboard KPIs refresh.
6. **Lifecycle** (separate loop, 5 min) queries qBt for `harvester`-tagged torrents and removes per FR-LC-02. Safety override (FR-LC-03) checks discount flip every cycle.
7. **Profile-probe** (15 min) snapshots uploaded/downloaded/ratio to `profile_snapshots`. Feeds **emergency-monitor**, which short-circuits the poller when ratio-to-tier-min < 0.2 (§7.5 PRD).

### 1.3 Deployment view

**v1 target:** single Node process launched by `start.bat` (Windows) or `start.sh` (POSIX). Process supervisor is the user's choice (documented: `nssm`, `pm2`, or nothing).

- Install: `git clone` → `npm install` → `npm run build` (frontend) → `start.bat`.
- Upgrade: `git pull` → `npm install` → `npm run build` → restart. No in-app updater in v1 (PRD N9).
- Config: `%APPDATA%\Harvester\config.json` on Windows; `~/.config/harvester/config.json` on POSIX. Auto-created on first run.
- DB: `%APPDATA%\Harvester\harvester.db` (same parent dir). Permissions: file-owner-only where the OS supports it.
- Logs: `%APPDATA%\Harvester\logs\harvester-YYYY-MM-DD.jsonl`. Rotated daily, 14-day retention.
- Ports: default `5173` (matches Vite's default — chosen for dev/prod parity). Configurable.

---

## 2. Architectural Principles (binding)

Every ADR below inherits these.

**P-01. Single-user, single-machine, localhost-first.** Multi-user, cloud, or SaaS is never supported. Design for a workstation, not a server farm.

**P-02. Crash-only restartable.** Every worker loop must survive process kill -9 and restart cleanly. No in-memory state that matters is kept without a DB mirror. Recovery path is "read DB, resume."

**P-03. Small, boring stack.** Prefer one mature library per concern over many. Every dependency added is a long-term liability. Banned libraries explicitly listed in §5.3.

**P-04. Pure functions at the core.** Rule evaluation, schedule window checks, size/age math, discount enum parsing — all pure, testable with no I/O. Workers are thin orchestrators around pure cores.

**P-05. Redact at the source, not at the sink.** Secrets never reach the logger as plaintext. Argon2id hashes and API keys live inside the config module only.

**P-06. HTTP first, SSE second, WebSocket never (in v1).** Everything is either a request/response or a server-stream. No bidirectional realtime.

**P-07. Fail loud, fail visible.** Silent degradation is a bug. If the poller errors, the Dashboard status banner turns yellow within 1 poll cycle. If qBt is unreachable, the Torrents page shows a banner, not an empty table.

**P-08. No background network without user consent.** Zero telemetry, zero auto-updates, zero "phone home." Every outbound connection is either to M-Team (user-configured), qBt (user-configured), or serves the UI.

**P-09. Evolve via migrations, never delete data.** `torrent_events` is append-only. Rule-set updates archive the prior version. Schema migrations never `DROP` without archival.

**P-10. Machine-readable > human-readable in internal docs.** This doc prioritizes precision for IMPLEMENTATION.md consumption over prose flow.

---

## 3. Context & Constraints

### 3.1 Non-functional requirement targets (NFRs)

| Category | Target | Measurement |
|----------|--------|-------------|
| Poller latency | ≥ 95% of matching torrents grabbed within 180 s of M-Team publish (PRD G1) | Time delta `mteam.createdDate` → `torrent_events.seen_at` (GRABBED rows) |
| API p95 | < 80 ms for all non-stream endpoints on a 2020-era laptop | Benchmark in test matrix |
| UI Time-to-Interactive | < 1.5 s on localhost cold load (Chrome, 2020-era laptop) | Lighthouse CI |
| DB size after 1 year | < 500 MB with 50 grabs/day sustained | Projection: ~18k rows × ~20 KB payload ≈ 360 MB |
| Memory | RSS < 300 MB steady state | `process.memoryUsage().rss` sampled via metrics |
| CPU | < 5% of one core idle, < 20% during poll+grab burst | `process.cpuUsage()` |
| Crash-free | Zero unhandled rejections escape to `process.on('unhandledRejection')` | CI assertion |
| Log volume | < 100 MB/day at INFO level during normal operation | Observed on dev rig |

### 3.2 Platform matrix

| Platform | Priority | Tested | Notes |
|----------|----------|--------|-------|
| Windows 10 | P0 | Yes (primary dev rig) | Target platform |
| Windows 11 | P0 | Yes | Target platform |
| macOS (arm64/x64) | P1 | Dev-box only | Contributors use it |
| Linux (x64) | P1 | Dev-box only | Self-hosters |
| Node 18 | not supported | — | better-sqlite3 native bindings + `fetch` consistency |
| Node 20 LTS | P0 | Yes | Primary |
| Node 22 | P1 | CI smoke | Forward-compat |
| Node 24 | not supported | — | Too new for LTS |

### 3.3 Inherited constraints (from PRD)

- PRD §7.6 FR-UI-04: bind `127.0.0.1` unless password set.
- PRD §7.9: Argon2id + bearer token.
- PRD §7.1 FR-PO-01: hard floor 60 s poll interval.
- PRD §8 FR-CP-03: yeast.js `UnimplementedMethodError` must never be shimmed with raw HTTP **for that endpoint**. (Raw HTTP elsewhere is fine.)
- PRD §10: dark-first UI, SPA, React.
- PRD §11 telemetry: **never** phone home.
- PRD N7: no tray icon, no Windows service in v1.

---

## 4. Architecture Decision Records

---

### ADR-001: Single-process, single-event-loop concurrency model

**Status:** Accepted
**Date:** 2026-04-18
**Deciders:** User (decided by scope), Harvester architect

#### Context
Harvester has five long-lived workers (poller, downloader, lifecycle, profile-probe, emergency-monitor), a blocking SQLite layer (better-sqlite3 uses sync calls on the main thread), an HTTP server, and an SSE fan-out. The combined CPU load is trivial (<5% sustained), but correctness depends on workers seeing consistent state.

#### Options Considered

##### Option A — Single Node process, single event loop, timer-based workers
| Dimension | Assessment |
|-----------|------------|
| Complexity | Low |
| Cost | Zero |
| Scalability | Adequate (single user, single machine) |
| Team familiarity | High — default Node model |
| Crash isolation | Weak — one unhandled error could kill all workers |

**Pros:** Simplest model. No IPC. Shared in-memory state is cheap. Every worker sees the same DB handle (better-sqlite3 single connection, WAL mode). Hot reload is `SIGINT` + restart.
**Cons:** One worker throwing an unhandled promise rejection can crash all workers. `better-sqlite3` sync calls block the event loop (mitigated — calls are small).

##### Option B — Node cluster / worker_threads per worker
**Pros:** True isolation. One poller crash doesn't kill downloader. Could parallelize CPU-bound work.
**Cons:** No CPU-bound work exists. Every worker needs DB access, forcing either serialization through IPC or multiple better-sqlite3 connections to the same file (WAL permits it, but now migrations and txn semantics are complicated). Cost of complexity is not justified by the threat model.

##### Option C — Child processes (e.g., `child_process.fork` per worker)
**Pros:** Full isolation.
**Cons:** Same DB-serialization problem as B, plus IPC overhead, plus process-supervision headaches on Windows. No benefit.

##### Option D — Monolithic worker daemon + separate HTTP process
**Pros:** HTTP server survives worker crash.
**Cons:** Requires an IPC protocol. For a single-user tool, not worth it.

#### Decision
**Option A.** Single Node process, five workers on independent `setInterval` / custom timer loops, one shared better-sqlite3 connection in WAL mode.

#### Trade-off Analysis
Crash isolation is real-but-minor because every worker is wrapped in a `try/catch` that logs and continues (ADR-033), and the top-level process has `unhandledRejection` and `uncaughtException` handlers that log + exit with code 1. The supervisor (start.bat loop, nssm, or pm2) restarts. Total downtime on a crash is <5 s. Acceptable.

#### Consequences
- **Easier:** Debugging (one process, one log stream). State sharing (pass object references, not serialize). Tests (spin up the app in-process).
- **Harder:** Nothing significant. CPU scaling if the tool ever grew to 100+ concurrent grabs (not a v1 concern).
- **Revisit when:** Node event loop lag p99 exceeds 100 ms, OR user-visible pauses appear, OR the tool is asked to handle >500 torrents simultaneously.

#### Action Items
1. [ ] Implement top-level `unhandledRejection` + `uncaughtException` handlers that log structured JSON and `process.exit(1)`.
2. [ ] Every worker: wrap body in try/catch, never let an exception escape the timer callback.
3. [ ] Graceful shutdown: `SIGINT` / `SIGTERM` → set shutdown flag → stop timers → drain in-flight grabs → close DB → exit.

---

### ADR-002: Node.js 20 LTS as runtime

**Status:** Accepted
**Date:** 2026-04-18

#### Context
Need a JS runtime for the backend. Candidates: Node.js (several versions), Bun, Deno. M-Team SDK (yeast.js) is TypeScript, npm-distributed.

#### Options Considered

##### Option A — Node.js 20 LTS
| Complexity | Cost | Scalability | Familiarity |
|---|---|---|---|
| Low | Zero | Adequate | High |

**Pros:** LTS until April 2026 (within v1 window), wide ecosystem, native `fetch`, `--watch`, `--env-file`. better-sqlite3 has prebuilt Windows/macOS/Linux binaries.
**Cons:** Older V8 than Node 22. Heavier than Bun.

##### Option B — Bun
**Pros:** Faster startup, built-in SQLite, built-in test runner, TypeScript executes natively.
**Cons:** Windows support was marked "experimental" in early 2025 and still has rough edges with native modules. yeast.js compatibility unverified. Not an LTS story. Primary platform is Windows — deal-breaker.

##### Option C — Deno
**Pros:** Security sandbox, TypeScript native.
**Cons:** Permissions friction with SQLite file paths, native-module story weaker, Fastify ecosystem is Node-centric, yeast.js imports unverified.

##### Option D — Node 22 (current, not LTS yet)
**Pros:** Newer V8, slightly better performance.
**Cons:** Not LTS for another year. better-sqlite3 prebuilt bindings release cycle occasionally lags. Unnecessary risk for P0 window.

#### Decision
**Option A — Node.js 20 LTS.** Pin `"node": ">=20.11.0 <21"` in `package.json.engines`. Document recommended exact version `20.14.0` in README.

#### Consequences
- **Easier:** Ecosystem, tooling, hiring (mental cost for human reviewers).
- **Harder:** Nothing.
- **Revisit when:** Node 22 becomes LTS (October 2026) — consider bumping.

#### Action Items
1. [ ] `package.json` engines field.
2. [ ] `.nvmrc` file at repo root with `20.14.0`.
3. [ ] CI matrix: 20.14, 20-latest, 22-latest.

---

### ADR-003: Fastify as HTTP framework

**Status:** Accepted
**Date:** 2026-04-18

#### Context
Need an HTTP server that serves JSON REST, SSE, and static files, with schema validation and low overhead.

#### Options Considered

##### Option A — Fastify v4
| Complexity | Cost | Scalability | Familiarity |
|---|---|---|---|
| Low | Zero | High | Medium-high |

**Pros:** Built-in JSON-schema validation (ajv), plugin ecosystem (`@fastify/static`, `@fastify/rate-limit`, `@fastify/sensible`), excellent perf, TypeScript-first in v4, native SSE via reply.raw or via `@fastify/sse-v2` plugin, supports graceful close.
**Cons:** Smaller community than Express. Idiomatic plugin model has a learning curve.

##### Option B — Express
**Pros:** Ubiquitous.
**Cons:** No native schema validation. Slower. Older middleware API. Express 5 has been "imminent" for years.

##### Option C — Hono
**Pros:** Fast, works in Node/Bun/Deno.
**Cons:** Smaller ecosystem, limited plugin story, overkill for single-runtime target.

##### Option D — Raw `http` module
**Pros:** No dependency.
**Cons:** Reinvents routing, schema validation, static file serving. Anti-productivity.

#### Decision
**Option A — Fastify v4.x** with these plugins: `@fastify/static`, `@fastify/rate-limit`, `@fastify/sensible`, `@fastify/cors`. SSE implemented hand-rolled against `reply.raw` (no plugin dep — SSE is trivial).

#### Consequences
- **Easier:** Schema validation for all POST/PUT bodies via route schemas (every Zod schema in UI_HANDOFF has a JSON-schema equivalent in API).
- **Harder:** Fastify's async hook timing is unfamiliar to some contributors.
- **Revisit when:** Fastify v5 GA is stable and offers clear benefit.

#### Action Items
1. [ ] Declare Fastify routes with schemas (per-route `schema: { body, querystring, response }`).
2. [ ] Error boundary: `setErrorHandler` that normalizes every thrown error to the `{ok:false, error}` envelope (PRD §12).

---

### ADR-004: better-sqlite3 (synchronous) as persistence layer

**Status:** Accepted
**Date:** 2026-04-18

#### Context
Need embedded persistence. PRD mandates SQLite. Question is which driver.

#### Options Considered

##### Option A — better-sqlite3 (synchronous API, prebuilt native binding)
| Complexity | Cost | Scalability | Familiarity |
|---|---|---|---|
| Low | Zero | Excellent for single-user | High |

**Pros:** Blazing fast (direct C bindings, no callback overhead), WAL mode, prepared statements are trivial, transactions are synchronous (matches our code flow), prebuilt Windows/macOS/Linux binaries via prebuild-install.
**Cons:** Blocks event loop for the duration of the query — but our queries are all single-digit milliseconds, so it's fine. Native binding means upgrading Node requires re-running `npm rebuild` or hoping prebuilds exist.

##### Option B — node-sqlite3 (async)
**Pros:** Non-blocking.
**Cons:** Slower. Callback-based API is awkward. Transactions span async ticks, creating correctness footguns. Zero actual benefit given our workload.

##### Option C — Prisma ORM (with SQLite adapter)
**Pros:** Type-safe schema, migrations.
**Cons:** Another layer of abstraction, heavier runtime, codegen step, overkill for a 12-table schema. Adds complexity we don't need.

##### Option D — Kysely query builder + better-sqlite3 driver
**Pros:** Type-safe queries without the ORM layer.
**Cons:** Worth considering. Adds 1 dep but gives type safety across SQL/TS boundary.

#### Decision
**Option A — better-sqlite3 v11.x** raw. No query builder, no ORM. Use **prepared-statement helpers** in a `db/queries.ts` module (ADR-013). Consider Kysely in a future ADR if type friction becomes painful.

#### Trade-off Analysis
ORMs hide the SQL we want to control (migration SQL is hand-written, partial indexes, JSON functions, CHECK constraints). A 12-table schema is small enough to manage by hand. We accept the loss of compile-time type checking at the SQL boundary; runtime validation via Zod at the API layer catches mismatches.

#### Consequences
- **Easier:** Direct control over SQL. WAL + `PRAGMA busy_timeout=5000` gives safe concurrent reads from the HTTP handlers while the poller writes.
- **Harder:** Manual maintenance of TS types for row shapes (ADR-013 codifies a pattern).
- **Revisit when:** > 50 tables, OR type errors at SQL boundary exceed 3/month.

#### Action Items
1. [ ] Singleton DB handle; `PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL; PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON` set at open.
2. [ ] Handle closed in `process.on('exit')` AND on graceful SIGINT.
3. [ ] Prepared statements cached in a module-level map; `db.prepare()` called once per query.

---

### ADR-005: Hand-rolled SQL migration runner

**Status:** Accepted
**Date:** 2026-04-18

#### Context
Schema will evolve. Need versioned migrations. PRD §9 defines `schema_migrations(version, applied_at)`.

#### Options Considered

##### Option A — Hand-rolled runner: numbered `.sql` files, compared against `schema_migrations`
| Complexity | Cost | Scalability | Familiarity |
|---|---|---|---|
| Low | Zero | Plenty | High |

**Pros:** Zero dependencies. Total control. Easy to audit. Bootstrap is trivial (create `schema_migrations` + apply all).
**Cons:** Must hand-code down-migrations if needed (we don't in v1 — forward-only).

##### Option B — Umzug
**Pros:** Standardized.
**Cons:** Adds dep, configured for more complex scenarios.

##### Option C — Prisma migrations
**Pros:** Declarative.
**Cons:** Rejected with Prisma itself (ADR-004).

#### Decision
**Option A.** `db/migrations/0001_init.sql`, `0002_...`, each wrapped in `BEGIN; ... COMMIT;`. Runner reads files, skips applied versions, runs pending in version order under a single transaction per file. On failure: rollback that migration, log, refuse to start server.

#### Consequences
- **Easier:** Transparent in diffs, reviewable in PRs, no magic.
- **Harder:** Rule-set migrations (JSON blob changes) are not SQL — handled separately by the rule-schema-migrator (ADR-032).
- **Revisit when:** Team grows and someone misses the ergonomics of a framework.

#### Action Items
1. [ ] `db/migrate.ts` runner module.
2. [ ] First migration: `0001_init.sql` containing every `CREATE TABLE` and `CREATE INDEX` in PRD §9 verbatim.
3. [ ] Idempotency: runner must be safe to call on every process start.

---

### ADR-006: SSE for live updates; no WebSockets in v1

**Status:** Accepted
**Date:** 2026-04-18

#### Context
Dashboard must refresh status, KPIs, and log tail in near-real-time. PRD §12 exposes `/api/logs/stream` and `/api/service/events` as SSE. PRD §7.6 FR-UI-02 forbids WebSockets.

#### Options Considered

##### Option A — Server-Sent Events (SSE) over HTTP/1.1
**Pros:** One-way is all we need. Works through CORS, proxies, firewalls. Browser auto-reconnects. `@microsoft/fetch-event-source` lets the client send `Authorization` headers (required for Phase 3 auth — FR-AUTH-07 query-param fallback exists for native `EventSource`).
**Cons:** One connection per stream; HTTP/1.1 limits (6 per origin) matter if many tabs open. We have two SSE endpoints — well within limits.

##### Option B — WebSocket
**Pros:** Bidirectional.
**Cons:** Bidirectional not needed. Extra auth protocol (no easy `Authorization` header on WS handshake in browsers without subprotocol hacks). Banned by PRD.

##### Option C — Short-poll (1 s) every endpoint
**Pros:** Trivial.
**Cons:** Wastes bandwidth; dashboard feels laggy at 1 s intervals; logs stream is untenable.

#### Decision
**Option A.** SSE on two endpoints. Implementation details:
- Heartbeat: `: keep-alive\n\n` comment line every 15 s to keep proxies and idle connections open.
- Retry hint: `retry: 3000\n\n` on first line.
- Events namespaced: `event: log`, `event: service-state`, `event: kpi-delta`, `event: toast`.
- Frontend reconnection policy: exponential backoff up to 30 s, reset on success. Yellow chip in footer if disconnected > 5 s (PRD §10.3).
- Auth (Phase 3): header via `@microsoft/fetch-event-source`, query-param fallback honored server-side per FR-AUTH-07.

#### Consequences
- **Easier:** No WS protocol complexity, no `ws` dep, works with `curl`.
- **Harder:** Must manage back-pressure on the server (don't buffer 10k events if a client stalls). Policy: `/api/logs/stream` ring-buffers last 100 events server-side; slow clients get "drop-oldest" semantics.
- **Revisit when:** Bidirectional real-time commands appear in scope (not foreseeable in v1).

#### Action Items
1. [ ] Event bus module `events/bus.ts` — `EventEmitter`-backed, typed events.
2. [ ] SSE handler subscribes, writes to `reply.raw`, unsubscribes on `req.raw.on('close')`.
3. [ ] Heartbeat interval; drop-oldest buffer.

---

### ADR-007: M-Team integration via yeast.js wrapper + raw-HTTP fallback in the SAME module

**Status:** Accepted
**Date:** 2026-04-18

#### Context
yeast.js is the sanctioned SDK but some endpoints throw `UnimplementedMethodError` (PRD §8 FR-CP-03). `genDlToken`, `torrent/search`, `member/profile` are required but SDK coverage is not guaranteed for all of them (Phase 0 spike verifies).

#### Options Considered

##### Option A — Single `mteam/` module that first tries yeast.js, falls back to raw HTTPS (with matching request shape) when SDK lacks the method, EXCEPT methods explicitly marked `UnimplementedMethodError` (which we must NOT shim per FR-CP-03)
**Pros:** Clear policy: one file owns all M-Team calls. Raw-HTTP fallback uses the same auth mechanism (API key header). Throwing an explicit `McpEndpointForbidden` error for methods on the denylist prevents accidents.
**Cons:** Slightly more complex than using either one alone.

##### Option B — yeast.js only; fail on missing methods
**Pros:** Cleanest compliance.
**Cons:** If yeast.js lacks, say, a field we need, we're blocked.

##### Option C — raw HTTP only; ignore yeast.js
**Pros:** Maximum control.
**Cons:** Violates the spirit of using the sanctioned SDK.

#### Decision
**Option A.** Module structure:
```
src/mteam/
  client.ts          // Public surface: search(), genDlToken(), profile(), etc.
  yeast-adapter.ts   // Wraps yeast.js SDK calls, catches UnimplementedMethodError
  raw-adapter.ts     // HTTPS fetch with API-key header
  forbidden.ts       // Denylist of methods that MUST NEVER be shimmed
  types.ts           // Canonical M-Team response types
```

**Policy:** `client.ts` exposes one method per API action. Each method tries yeast.js first; on `UnimplementedMethodError`, checks `forbidden.ts`; if forbidden → throws `McpEndpointForbidden`; else → delegates to `raw-adapter.ts`. Every fallback path logs INFO once per process-lifetime per method.

**forbidden.ts** contents are populated during Phase 0 spike (OQ-4 in PRD §14).

#### Consequences
- **Easier:** Rate limiting, auth, logging all centralized in `client.ts`.
- **Harder:** Phase 0 MUST produce the forbidden list or we risk accidental shimming.
- **Revisit when:** yeast.js becomes feature-complete or a second tracker is added (Phase 4).

#### Action Items
1. [ ] Phase 0: populate `forbidden.ts`.
2. [ ] Every raw-HTTP call MUST redact the API key before logging the request URL/headers.
3. [ ] All M-Team timeouts: 15 s connect+read; retry 3× with exponential backoff (1 s, 2 s, 4 s); after 3rd failure, propagate and let the poller's backoff (FR-PO-04) take over.

---

### ADR-008: Hand-rolled timer loops per worker (no node-cron, no BullMQ)

**Status:** Accepted
**Date:** 2026-04-18

#### Context
Five workers on different cadences: poller (60–600 s configurable), lifecycle (300 s fixed), profile-probe (900 s), emergency-monitor (runs on every profile snapshot), grab-retry (depends on backoff state).

#### Options Considered

##### Option A — Custom timer loops: `setTimeout(tick, delay)` recursion, with graceful abort and monotonic clock via `process.hrtime.bigint()`
**Pros:** Zero deps. Handles sleep/wake correctly (FR-PO-06 — if wall clock jumped more than 3× poll interval, fire an immediate catch-up tick). Interval can change mid-run (user changes `poll_interval_sec` in Settings).
**Cons:** Must be written carefully — `setInterval` has drift and doesn't pause on user action.

##### Option B — node-cron
**Pros:** Declarative.
**Cons:** Overkill for 5 workers. Doesn't handle "fire-once-then-backoff" patterns well. Wall-clock jumps on sleep wake require extra logic.

##### Option C — BullMQ + Redis
**Pros:** Persistent job queues.
**Cons:** Another service (Redis). For a desktop tool. No.

##### Option D — node-schedule
**Pros:** Similar to node-cron.
**Cons:** Same reasons.

#### Decision
**Option A.** Each worker implements the `LoopWorker` interface:
```ts
interface LoopWorker {
  name: string;
  start(): Promise<void>;
  stop(): Promise<void>;        // waits for in-flight iteration
  tick(): Promise<void>;        // one iteration
  readonly nextTickAt: number;  // Unix ms
}
```

The process-level orchestrator starts all workers, subscribes to the service-state store (ADR-035), and calls `worker.stop()` on emergency pause / kill switch (non-lifecycle workers). Lifecycle keeps running during emergency (PRD FR-EM-03).

#### Consequences
- **Easier:** Total control over pause/resume, interval changes, sleep/wake handling.
- **Harder:** Every worker must implement graceful shutdown correctly. Template + tests mandatory.
- **Revisit when:** Number of workers exceeds ~10 OR scheduling becomes genuinely complex.

#### Action Items
1. [ ] `workers/loopWorker.ts` base helper: monotonic clock, sleep/wake detection, abort-on-stop.
2. [ ] Every worker extends or composes with it.
3. [ ] Test: simulate sleep by jumping `Date.now()` via a clock-injection pattern and assert catch-up fires.

---

### ADR-009: Rule engine as a pure function; workers call it, never owns side effects

**Status:** Accepted
**Date:** 2026-04-18

#### Context
The rule engine is the product's core correctness boundary. It must be trivially testable, deterministic, and immune to I/O-related flakiness.

#### Options Considered

##### Option A — Pure function: `evaluate(torrent, ruleSets, context): Decision` where `context = { now_ms, free_disk_gib, simulate_at_ms? }`
**Pros:** Trivial unit tests (thousands of cases under a second). No I/O. No race conditions.
**Cons:** Callers must gather I/O (free disk) and pass it in — trivial.

##### Option B — Class with side-effecting methods
**Cons:** Harder to test, couples concerns.

#### Decision
**Option A.** Pure functions. Signature:

```ts
type Decision =
  | { kind: 'GRABBED'; matched_rule_set_ids: number[]; matched_rule_set_names: string[] }
  | { kind: 'SKIPPED_RULE'; per_rule_set: { id: number; name: string; rejection_reason: string }[] }
  | { kind: 'SKIPPED_DUP' }
  | { kind: 'SKIPPED_FLIPPED' };

function evaluate(
  torrent: NormalizedTorrent,
  enabledRuleSets: RuleSet[],
  context: { now_ms: number; free_disk_gib: (path: string) => number; simulate_at_ms?: number }
): Decision;
```

Re-evaluation, dry-run, and live evaluation all call the same function — `simulate_at_ms` is the only context knob.

#### Consequences
- **Easier:** Coverage target: 100% of branches in rule engine.
- **Harder:** Free-disk lookup must be injected — handled via `context.free_disk_gib` callback. Tests use a stub that returns a fixed value.
- **Revisit when:** Rule semantics grow beyond the 8-step flowchart (not foreseeable).

#### Action Items
1. [ ] `rules/evaluator.ts` — exports `evaluate()`.
2. [ ] Golden test fixtures: 50+ torrent/rule-set combinations with expected decisions.
3. [ ] Benchmark: 100 k evaluations/sec on laptop — we need < 10 ms for 200-event dry-run.

---

### ADR-010: pino + custom redaction transform; SQLite tail via pino transport

**Status:** Accepted
**Date:** 2026-04-18

#### Context
Need structured JSON logging with redaction (PRD FR-OB-02), daily file rotation, and a rolling SQLite buffer (last 10k entries for UI).

#### Options Considered

##### Option A — pino + pino-roll (file rotation) + custom pino transport to SQLite
**Pros:** Fastest Node logger. Redaction built-in (`redact: { paths, censor }`). Structured JSON natively. Transports run in worker threads (doesn't block main loop).
**Cons:** Transport API v2 has a slight learning curve.

##### Option B — winston
**Pros:** More featureful out of the box.
**Cons:** Slower. Older API.

##### Option C — Custom logger
**Cons:** Reinventing wheel.

#### Decision
**Option A.** Configuration:

```
pino({
  level: config.log_level || 'info',
  redact: {
    paths: [
      '*.mteam_api_key', '*.qbt_password', 'config.mteam_api_key',
      'req.headers.authorization', 'req.headers.cookie',
      '*.lan_access_password', '*.lan_access_password_hash',
    ],
    censor: '***REDACTED***',
  },
  timestamp: pino.stdTimeFunctions.isoTime,
}, pino.multistream([
  { stream: fileRollerStream }, // daily rotated JSONL
  { stream: sqliteTailStream }, // custom writable that INSERTs into `logs`
]));
```

Plus a **secondary redactor** applied BEFORE pino receives the object — a regex sweep over string fields that match the currently-loaded M-Team API key, qBt password, or LAN password plaintext (held in memory for the lifetime of the process). Pino's redact is field-based; regex covers cases where a secret lands inside a stringified payload.

#### Consequences
- **Easier:** Structured logs everywhere. Redaction is never forgotten.
- **Harder:** Secrets must be set on the redactor at config load AND on config-change. If user rotates API key, redactor regex set must include both old and new for the length of the process.
- **Revisit when:** Log throughput becomes a bottleneck (unlikely).

#### Action Items
1. [ ] `logger/index.ts` — singleton logger.
2. [ ] `logger/redactor.ts` — regex set, hot-updatable.
3. [ ] `logger/sqlite-transport.ts` — tail buffer with cap 10 k (oldest rows pruned).
4. [ ] `logger/file-roller.ts` — daily rotation, 14-day retention.

---

### ADR-011: Auth = plaintext-at-edge + Argon2id at rest; stateless bearer; SSE query-param escape hatch

**Status:** Accepted
**Date:** 2026-04-18

#### Context
PRD §7.9 mandates LAN auth via password. No sessions, no OAuth, no cookies, minimal dependency surface.

#### Options Considered

##### Option A — Password is the bearer token; server Argon2id-verifies on every request; stateless
**Pros:** Simple. No session store. No JWT secret management. No refresh-token dance. Matches PRD FR-AUTH-06.
**Cons:** Argon2id verify is deliberately slow (hundreds of ms on tuned params). Hammering the middleware would cause CPU load.

##### Option B — Password-on-login → HMAC-signed JWT → verify per request
**Pros:** Fast per-request verify (HMAC SHA-256 is <1 ms).
**Cons:** Requires a JWT signing secret, adds a dep (`jsonwebtoken`), introduces refresh-token semantics or short TTLs — complexity. Logout means nothing in stateless JWT without a blocklist.

##### Option C — Session cookies + SQLite session store
**Pros:** Classic, revocable.
**Cons:** Cookie handling, CSRF considerations, state in DB.

#### Decision
**Option A with guardrails.** 
- Argon2id verify tuned per ADR FR-AUTH-03 params, but results are **cached** in an LRU of size 10 for 60 s keyed by SHA-256 of `(remote_ip, token)`. An authenticated connection staying alive does one Argon2id verify per 60 s of activity, not one per request.
- Rate limiter (FR-AUTH-05) protects from brute-force.
- SSE: query-param token allowed (FR-AUTH-07) because browsers cannot set headers on `EventSource`. The token is scrubbed from Fastify's request log and from URL-bar history via `history.replaceState` after the stream opens.

#### Consequences
- **Easier:** Zero session state.
- **Harder:** Cache invalidation — if user rotates password, existing cached hashes from "old password" must be invalidated. Implementation: password rotate bumps a server-side `auth_epoch`; cache entries are keyed by `(ip, token, auth_epoch)`. Changing epoch logically flushes the cache.
- **Revisit when:** CPU overhead from Argon2id at load becomes an issue (measurable).

#### Action Items
1. [ ] `auth/middleware.ts` — Fastify preHandler hook running on all `/api/*` except `/api/health`.
2. [ ] LRU cache module — `auth/verify-cache.ts`.
3. [ ] Rate limiter via `@fastify/rate-limit` with localhost-exempt allowlist.
4. [ ] `auth/argon2.ts` wrapper — uses `argon2` npm package (native binding, prebuilt).

---

### ADR-012: Frontend state = TanStack Query (server state) + Zustand (UI state); no Redux

**Status:** Accepted
**Date:** 2026-04-18

#### Context
UI_HANDOFF.md already picks React + TanStack Query. This ADR records and binds the rationale.

#### Options Considered

##### Option A — TanStack Query v5 for everything server-shaped + Zustand for a small slice of local UI state (selected theme, drawer open/closed, toast queue)
**Pros:** Clear split: anything that came from the API is a query/mutation; anything else is a Zustand store. Minimal boilerplate. No reducers.
**Cons:** Developers unfamiliar with TanStack Query have a ramp.

##### Option B — Redux Toolkit + RTK Query
**Pros:** Mature.
**Cons:** More boilerplate, more concepts, more bytes.

##### Option C — React Context only
**Pros:** No deps.
**Cons:** Re-render storms when any piece changes. Painful at this scale.

#### Decision
**Option A.** Conventions:
- Every API call goes through a named hook: `useDashboardSummary()`, `useRuleSets()`, etc. Hooks live in `web/src/hooks/api/`.
- Stale times and poll intervals are configured per hook (e.g. dashboard 1 s stale / 2 s refetch; rule list 30 s stale; logs are SSE, no polling).
- Zustand stores: `uiStore` (theme, density, shortcuts-panel visibility), `authStore` (LAN password in memory, auth epoch, "re-login required" flag), `toastStore` (queue + mute prefs).
- No cross-store imports. UI store never imports auth store; components compose them.

#### Consequences
- **Easier:** Refetch + cache + optimistic updates for free.
- **Harder:** Offline behavior needs explicit thought per query.
- **Revisit when:** State graph grows beyond ~10 stores (unlikely).

#### Action Items
1. [ ] `web/src/api/client.ts` — fetch wrapper with auth injection.
2. [ ] `web/src/hooks/api/` — one file per endpoint group.
3. [ ] `web/src/store/uiStore.ts`, `authStore.ts`, `toastStore.ts`.

---

### ADR-013: Repository structure — single Node project, not a monorepo, with a first-class `web/` subfolder

**Status:** Accepted
**Date:** 2026-04-18

#### Context
We have a Node backend and a React frontend. Options: single repo + one `package.json`, monorepo with workspaces, two separate repos.

#### Options Considered

##### Option A — Single repo, two `package.json`s (root + `web/`)
**Pros:** Simple. `npm install` at root installs backend; `cd web && npm install` installs frontend. CI can run backend tests independently.
**Cons:** Must remember to `cd web` for UI changes. Some DX rough edges.

##### Option B — npm workspaces monorepo (`packages/server`, `packages/web`, shared `packages/types`)
**Pros:** Shared types between backend and frontend in a `types` workspace. Single `npm install`.
**Cons:** npm workspaces still has quirks with native deps (better-sqlite3 builds) on Windows. Adds tooling complexity.

##### Option C — Two repos
**Pros:** Hard boundary.
**Cons:** Cross-cutting changes require two PRs. Type drift likely.

##### Option D — Single repo + single `package.json`
**Cons:** Vite and Fastify dev dependencies mingle — unclean.

#### Decision
**Option A.** Layout:
```
/ (repo root)
  package.json              # backend + shared build scripts
  tsconfig.json             # backend
  tsconfig.shared.json      # shared types (paths-only, no compile)
  src/                      # backend source
  db/migrations/            # SQL migration files
  config/                   # example config, defaults
  scripts/                  # start.bat, start.sh, dev.sh
  web/                      # frontend workspace
    package.json
    vite.config.ts
    tsconfig.json
    src/                    # frontend source (structure per UI_HANDOFF §2)
  tests/                    # backend tests
  fixtures/                 # recorded M-Team / qBt responses (msw)
  logs/                     # gitignored, runtime
  .github/workflows/        # CI
```

**Shared types:** `shared/types.ts` in repo root, imported by both sides via relative path. No `types` package yet; if drift appears, promote to a workspace later.

#### Consequences
- **Easier:** Simple mental model.
- **Harder:** Relative imports from `web/` into `shared/` via `../../shared/types` — mildly annoying, solved with tsconfig `paths`.
- **Revisit when:** A third entrypoint is added (CLI, worker binary, etc.) — then switch to workspaces.

#### Action Items
1. [ ] Repo scaffold.
2. [ ] Root `tsconfig.json` with `paths: { "@shared/*": ["shared/*"] }`.
3. [ ] `web/tsconfig.json` extends root and re-declares `paths`.

---

### ADR-014: Distribution = source + `start.bat` in v1; no binary, no Tauri, no installer

**Status:** Accepted
**Date:** 2026-04-18

#### Context
Users need to run Harvester on Windows. They can install Node (documented pre-req). No code-signing budget; no installer budget; Tauri deferred to v2.

#### Options Considered

##### Option A — Git clone + `npm install` + `npm run build` + `start.bat`
**Pros:** Zero budget, zero CI signing, easy to update (git pull).
**Cons:** Requires user to install Node and run 3 commands.

##### Option B — `pkg` / `nexe` single-exe bundle
**Pros:** One file.
**Cons:** better-sqlite3 native binding complicates bundling. File size 80+ MB. Code signing would be required for Windows SmartScreen friendliness — we don't have a cert.

##### Option C — Tauri wrapper
**Deferred to Phase 4.**

#### Decision
**Option A.** `start.bat` is a ~10-line script:
```bat
@echo off
cd /d "%~dp0"
if not exist "web\dist" (
  echo First run: building UI...
  call npm install --production=false
  call npm run build
)
node dist/index.js
pause
```

`start.sh` is a POSIX equivalent. `npm run build` builds both backend TS (to `dist/`) and frontend (to `web/dist/`). `dist/index.js` boots Fastify which serves `web/dist/` as static.

#### Consequences
- **Easier:** Updates = `git pull && npm install && npm run build && restart`.
- **Harder:** Users must have Node 20. README documents how to install it.
- **Revisit when:** Phase 4 Tauri work begins.

#### Action Items
1. [ ] `scripts/start.bat`, `scripts/start.sh`, made executable.
2. [ ] README with Node install link.

---

### ADR-015: Config in `%APPDATA%\Harvester\config.json`; secrets live alongside; no separate keystore

**Status:** Accepted
**Date:** 2026-04-18

#### Context
Need to persist: M-Team API key, qBt credentials, LAN password hash, user preferences. Options: `config.json`, OS keystore (DPAPI on Windows, Keychain on macOS, libsecret on Linux), env vars.

#### Options Considered

##### Option A — Single `config.json`, plain text (permissions restricted), secrets within
**Pros:** Simple. Backup-friendly. Cross-platform.
**Cons:** Plain text. Anyone with disk access sees the API key.

##### Option B — OS keystore for secrets + `config.json` for preferences
**Pros:** Secrets not on disk in plain text.
**Cons:** Three platform-specific integrations (DPAPI, Keychain, libsecret). Adds native deps. Debugging harder.

##### Option C — Encrypted `config.json` (master passphrase)
**Pros:** Portable.
**Cons:** Another passphrase UX, and user-forgot-passphrase is a total-wipe scenario.

#### Decision
**Option A with caveats.** Rationale: this is a single-user desktop tool where an attacker with disk access already has qBt's `qBittorrent.ini` (which stores credentials), probably has cookies for M-Team in their browser, and definitely has keys to the DB. Adding a keystore dependency does not raise the bar meaningfully for the threat model and adds deps.

Mitigations:
- Config file permissions: `0600` on POSIX via `fs.chmod`. On Windows, leverage default `%APPDATA%` ACL (user-only) — no additional code.
- LAN password stored as Argon2id hash, never plaintext (FR-AUTH-03).
- M-Team API key redacted from all logs (FR-OB-02).
- Config file parser validates and rejects unknown fields to prevent typos.

#### Consequences
- **Easier:** No native-dep complexity.
- **Harder:** Must document clearly: "Your M-Team API key is stored in `%APPDATA%\Harvester\config.json` — treat that file as sensitive."
- **Revisit when:** User base expands to less-technical users where "file lives in AppData" is not obvious.

#### Action Items
1. [ ] `config/schema.ts` — Zod schema for the whole config file.
2. [ ] `config/load.ts` — reads, validates, applies default merges.
3. [ ] `config/write.ts` — validates, writes atomically (write to `config.json.tmp`, rename), sets permissions.
4. [ ] Settings API handlers use load/write; UI never edits the file directly.

---

### ADR-016: Typed error taxonomy with user-safe messages

**Status:** Accepted
**Date:** 2026-04-18

#### Context
Errors flow from many sources (M-Team, qBt, config parse, DB) to many sinks (logs, UI toasts, audit rows). We need a uniform shape.

#### Decision
Define a base class and a closed set of subclasses. Every thrown error in Harvester source code is one of these. Third-party errors are caught and wrapped at the module boundary.

```ts
class HarvesterError extends Error {
  readonly code: ErrorCode;            // enum string
  readonly user_message: string;       // safe to surface in UI
  readonly context?: Record<string, unknown>; // redactable, goes to logs
  readonly retryable: boolean;
  readonly cause?: unknown;            // original error
}

type ErrorCode =
  | 'CONFIG_INVALID'
  | 'CONFIG_MISSING'
  | 'MTEAM_AUTH_FAILED' | 'MTEAM_RATE_LIMITED' | 'MTEAM_UNAVAILABLE' | 'MTEAM_FORBIDDEN_METHOD'
  | 'QBT_UNREACHABLE' | 'QBT_AUTH_FAILED' | 'QBT_VERSION_DISALLOWED' | 'QBT_BAD_RESPONSE'
  | 'RULE_VALIDATION' | 'RULE_SCHEDULE_INVALID'
  | 'AUTH_UNAUTHENTICATED' | 'AUTH_RATE_LIMITED' | 'AUTH_PASSWORD_WEAK'
  | 'DISK_LOW' | 'DISK_UNREACHABLE'
  | 'GRAB_TOKEN_EXPIRED' | 'GRAB_DUPLICATE' | 'GRAB_DISCOUNT_FLIPPED'
  | 'INTERNAL';

// Fastify error handler maps code → HTTP status; user_message → response body.
```

- `user_message` is pre-written and safe — never interpolate raw SDK error strings into it (those may contain secrets or noise).
- `context` is logged; redactor strips any field that matches known secrets.
- Retry policy (backoff, queue) reads `retryable`.

#### Consequences
- **Easier:** Consistent error shape in UI; toast copy is pre-cleared; debugging via `code`.
- **Harder:** Every third-party error site needs wrapping — enforced via lint rule that bans raw `throw new Error(...)` in `src/**` except inside `errors/*`.

#### Action Items
1. [ ] `errors/index.ts` — base class + subclass factories.
2. [ ] Fastify `setErrorHandler` maps to HTTP 400/401/404/409/429/500/503 by `code`.
3. [ ] UI error boundary + toast system consume `{ok:false, error:{code, user_message}}`.

---

### ADR-017: qBittorrent client — thin fetch wrapper with cookie-based session, no library

**Status:** Accepted
**Date:** 2026-04-18

#### Context
qBt WebUI API v2 uses cookie auth (login returns `SID` cookie, subsequent requests include it). Libraries exist (`qbittorrent-api-node`, etc.) but they add surface and may lag.

#### Decision
Hand-roll `qbt/client.ts` with:
- `login(host, port, user, pass)` → POSTs `/api/v2/auth/login`, captures `SID` cookie in-memory.
- Auto-reauth on 403.
- `getVersion()`, `getBuildInfo()`, `listTorrents(filter?)`, `addTorrent({urls, category, tags, paused, savepath, upLimit})`, `torrentInfo(hashes)`, `pauseTorrents(hashes)`, `resumeTorrents(hashes)`, `deleteTorrents(hashes, deleteFiles)`.
- Uses Node's built-in `fetch` (no axios dep). 10-second timeouts via `AbortController`.

Rationale: ~200 LoC, fully controlled, no supply-chain risk, easy to mock (msw) in tests.

#### Action Items
1. [ ] `qbt/client.ts`.
2. [ ] `qbt/types.ts` — canonical qBt response types (keep separate from M-Team types).
3. [ ] Test fixtures: recorded responses from a local qBt 4.x and 5.x instance.

---

### ADR-018: Testing stack = Vitest (both layers) + msw for network mocks + Playwright for E2E

**Status:** Accepted
**Date:** 2026-04-18

#### Decision
- **Unit + integration tests:** Vitest. One test runner for backend and frontend. Fast, ESM-native, Jest-compatible API.
- **HTTP mocking:** msw (Mock Service Worker) — works in both Node and browser; lets us record live M-Team responses once and replay.
- **E2E:** Playwright — one test spec for first-run wizard happy path, one for kill-switch, one for rule-dry-run, one for LAN-auth roundtrip. Runs against a full boot of the app with temp DB.
- **Load / soak:** not automated in v1. Manual with k6 if needed.

#### Rejected
- **Jest:** Slower, CJS-first.
- **ava:** Fine but Vitest has mindshare.
- **Cypress:** Bigger, slower, and we don't need cross-browser.

#### Action Items
1. [ ] `vitest.config.ts` (root) — backend unit + integration projects.
2. [ ] `web/vitest.config.ts` — component tests.
3. [ ] `playwright.config.ts` — E2E, uses temporary config+DB.

---

### ADR-019: Feature-module boundaries inside `src/`

**Status:** Accepted
**Date:** 2026-04-18

#### Decision
Backend `src/` is organized by **feature**, not by **layer**. Layers within a feature when needed.

```
src/
  index.ts                # bootstrap
  config/                 # config schema, load, write
  db/                     # connection, migrations, query helpers
  logger/                 # pino + redaction + SQLite transport + file rotation
  events/                 # event bus
  errors/                 # typed errors
  mteam/                  # M-Team integration (per ADR-007)
  qbt/                    # qBt integration (per ADR-017)
  rules/                  # evaluator (pure), schema migrator, validator
  workers/
    loopWorker.ts         # base helper
    poller.ts
    downloader.ts
    lifecycle.ts
    profileProbe.ts
    emergencyMonitor.ts
    grabRetry.ts          # drains grab_queue on qBt recovery
  auth/                   # Phase 3 middleware, Argon2id, rate limiter
  http/
    server.ts             # Fastify app wire-up
    routes/
      dashboard.ts
      torrents.ts
      rules.ts
      logs.ts
      stats.ts
      settings.ts
      service.ts
      health.ts
      auth.ts             # Phase 3
      firstRun.ts
    sse/
      logs.ts
      service.ts
  services/               # cross-feature orchestrators (serviceState, preflight)
shared/
  types.ts                # types shared between backend and frontend
```

**Rule:** no feature imports another feature's internal module. Cross-feature use goes through the feature's public entrypoint (`mteam/index.ts`, etc.) or through the event bus.

#### Action Items
1. [ ] ESLint boundaries rule (`eslint-plugin-boundaries`) enforcing the above.

---

### ADR-020: Service-state store as an append-only event-sourced reducer on top of `service_state` row

**Status:** Accepted
**Date:** 2026-04-18

#### Context
Many components need to know/set "is service running, is it emergency-paused, is qBt reachable, has preflight succeeded, what's last_poll_at." Bare SQL updates from everywhere leads to race conditions and transition bugs.

#### Decision
A single module `services/serviceState.ts`:
- Owns the single-row `service_state` table.
- Exposes `dispatch(action)` where `action` is a typed union (`'POLL_STARTED'`, `'POLL_FINISHED'`, `'POLL_FAILED'`, `'USER_PAUSED'`, `'USER_RESUMED'`, `'EMERGENCY_TRIGGERED'`, `'EMERGENCY_CLEARED'`, `'PREFLIGHT_PASSED'`, `'PREFLIGHT_FAILED'`, `'ALLOWED_CLIENT_WARN'`, `'ALLOWED_CLIENT_ACK'`).
- A pure reducer computes the next `ServiceState`. If the transition is illegal, the dispatcher throws `HarvesterError({code:'INTERNAL'})`. Legal transitions are enumerated in a state machine.
- After reducer returns, store UPSERTs the row and emits `service-state-changed` on the event bus. SSE handler forwards to clients.

State machine:
```
STOPPED --start→ RUNNING
RUNNING --user→ PAUSED_USER
PAUSED_USER --user→ RUNNING
RUNNING --emergency→ PAUSED_EMERGENCY
PAUSED_EMERGENCY --ratio_recovered | user_override→ RUNNING
RUNNING --3 consecutive errors→ PAUSED_BACKOFF
PAUSED_BACKOFF --success→ RUNNING
* --SIGINT→ STOPPED
```

PAUSED_USER blocks user-ratio-recovery-auto-resume; emergency monitor respects PAUSED_USER (doesn't touch it).

#### Action Items
1. [ ] `services/serviceState.ts` — dispatcher + reducer + legal-transition matrix.
2. [ ] Test matrix: every transition, every illegal transition.

---

### ADR-021: Rule-set JSON Schema + migration runner

**Status:** Accepted
**Date:** 2026-04-18

#### Context
Rule-sets are stored as JSON blobs (`rules_json`). Schema will evolve. PRD FR-RE-06 mandates migration on load.

#### Decision
- One JSON Schema file per version: `rules/schemas/v1.schema.json`. Validated with `ajv`.
- Migration module `rules/migrate.ts` with functions `migrate(json, fromVersion, toVersion): json`. Each step is a pure function.
- On app startup, `rule_sets` rows with `schema_version < CURRENT` are migrated in a single DB transaction: original archived, new written, `schema_version` bumped.
- Dry-run API endpoint also validates against the current schema.

The Zod schema in `UI_HANDOFF.md` and the JSON Schema MUST stay in sync — maintained by generating JSON Schema from Zod via `zod-to-json-schema` and committing the output. Deviations fail CI.

#### Action Items
1. [ ] `rules/schemas/v1.schema.json` committed.
2. [ ] `rules/validate.ts` — ajv-compiled validator, exports `validateRuleSet(json): {ok, errors}`.
3. [ ] CI check: Zod → JSON-Schema round-trip.

---

### ADR-022: Preflight checks fail closed; user cannot bypass M-Team auth or qBt auth, CAN bypass allowed-client with typed confirmation

**Status:** Accepted
**Date:** 2026-04-18

#### Context
PRD FR-SG-03: startup blocks poller on failed preflight. Some failures are user-fixable (M-Team key wrong), some user-toleratable (allowed-client range violation).

#### Decision
Preflight is a deterministic sequence with two categories:
- **Hard fail:** M-Team auth (no valid key = no polling, period), qBt auth (no credentials = can't dispatch), save-path existence.
- **Soft fail (user override):** qBt version outside allowed range, free disk < 10 GiB but ≥ 1 GiB.

Override UI: the "I ACCEPT" typed-confirmation field in Settings (PRD §10.2 Settings→qBittorrent). After override, `service_state.allowed_client_ok = 1`. If the user changes qBt version, override clears and they must re-type.

#### Action Items
1. [ ] `services/preflight.ts` — returns `{hard: [...], soft: [...], ok: boolean}`.
2. [ ] Server boots UI server unconditionally, but poller waits on `ok && !paused`.

---

### ADR-023: Free-disk lookup via `fs.statfs` (Node 20+) with caching

**Status:** Accepted
**Date:** 2026-04-18

#### Context
Rule engine needs `free_disk_gib(path)` to evaluate `free_disk_gib_min`. Cost matters: evaluating 50 torrents/cycle × 5 rule-sets could call it 250× if naïvely.

#### Decision
- Use `node:fs/promises`.`statfs` (Node 20+) to get filesystem free bytes.
- Cache result per path for 30 s in a Map. Polling runs once/90 s so cache is cold once per cycle; rule-set evaluations within a cycle all hit cache.
- Cache key = resolved absolute path; use `fs.realpath` to canonicalize.

#### Action Items
1. [ ] `util/disk.ts` — `freeGib(path): Promise<number>` with TTL cache.

---

### ADR-024: Dependency policy — allowlist + banlist, deny dynamic `require`

**Status:** Accepted
**Date:** 2026-04-18

#### Decision
**Allowlist (backend):** fastify, @fastify/static, @fastify/rate-limit, @fastify/sensible, @fastify/cors, better-sqlite3, pino, pino-roll, argon2, ajv, zod, zod-to-json-schema, @microsoft/fetch-event-source (in frontend), yeast.js, msw, vitest, playwright, typescript, eslint, prettier, eslint-plugin-boundaries.

**Allowlist (frontend):** react, react-dom, react-router, @tanstack/react-query, zustand, @tanstack/react-virtual, recharts, @monaco-editor/react, lucide-react, react-hook-form, @hookform/resolvers, zod, @microsoft/fetch-event-source, tailwindcss, clsx, tailwind-merge, class-variance-authority, date-fns.

**Banlist:** lodash (use native), moment (use date-fns), axios (use fetch), express (ADR-003), puppeteer (ADR-018), @prisma/* (ADR-004).

**Process:**
- CI runs `npm audit` on every PR; high/critical issues block merge.
- Adding any dep not in allowlist requires an ADR amendment.
- `npm-check-updates` weekly; breaking-change upgrades require ADR-level review.

#### Action Items
1. [ ] `.github/workflows/ci.yml` with audit gate.
2. [ ] `depcheck` in CI to catch unused deps.

---

### ADR-025: Observability — JSON logs + `/api/metrics` + future-proof label set

**Status:** Accepted
**Date:** 2026-04-18

#### Context
PRD FR-OB-03 defines a metrics set. Prometheus is Phase 4. JSON endpoint ships now.

#### Decision
- All metrics live in `observability/metrics.ts` as a singleton with typed `Counter`, `Gauge`, `Histogram` classes (bucketed).
- `/api/metrics` returns JSON: `{counters: {name: value}, gauges: {name: value}, histograms: {name: {buckets: [...], sum, count}}}`.
- Label structure is **Prometheus-compatible** even though we don't expose Prometheus format yet. Future Phase 4 work is just a format adapter.
- Histograms for M-Team and qBt call durations with buckets `[50, 100, 200, 500, 1000, 2000, 5000, 10000]` ms.

#### Action Items
1. [ ] `observability/metrics.ts`.
2. [ ] Every external call wrapped with a duration timer.

---

### ADR-026: UI theming via CSS custom properties + Tailwind; not CSS-in-JS

**Status:** Accepted (records decision already made in UI_HANDOFF §3)
**Date:** 2026-04-18

Binding ADR — rationale recorded in UI_HANDOFF.md. Key points:
- Design tokens in `tokens.css` as CSS custom properties, bifurcated by `[data-theme="dark"]` and `[data-theme="light"]`.
- Tailwind extended via `tailwind.config.ts` to consume those custom properties.
- No styled-components, no emotion — zero runtime cost, no cascade churn.

---

### ADR-027: Frontend SPA boot performance budget

**Status:** Accepted
**Date:** 2026-04-18

#### Decision
- Critical JS budget: 250 KB gzipped for first paint.
- Monaco editor **code-split** — loads only on `/rules/:id` route.
- Recharts lazy-loaded on `/stats` route.
- Tailwind JIT mode enabled (default v3).
- Vite `build.rollupOptions.output.manualChunks` splits: react, @tanstack/*, monaco, recharts.

#### Action Items
1. [ ] CI gate: bundle size.
2. [ ] Lighthouse CI run on build output.

---

### ADR-028: Time handling — user-local display, UTC storage, Luxon OR native Intl

**Status:** Accepted
**Date:** 2026-04-18

#### Decision
- **Storage:** UTC unix seconds (integer). No ISO strings in DB for timestamps.
- **Display:** user's local timezone via `Intl.DateTimeFormat`.
- **Schedule windows (FR-RE-07):** IANA TZ resolved via `Intl.DateTimeFormat(..., {timeZone: zone})` + day-of-week math via `date-fns-tz` (bundled with date-fns).
- Rejected Luxon: bigger, overlaps Intl API.
- Rejected moment: banned.

Day-of-week math edge: when the schedule uses a non-system TZ, computing "which weekday is it in TZ X right now" requires a mapping — `date-fns-tz` handles it.

#### Action Items
1. [ ] `util/time.ts` with `isScheduleActive(schedule, nowMs): boolean`.
2. [ ] Golden tests for midnight-wrap and DST transitions.

---

### ADR-029: Browser storage — React state only; no localStorage for sensitive data

**Status:** Accepted
**Date:** 2026-04-18

#### Decision
- LAN password: **never** persisted client-side. Lives in `authStore` (Zustand) — in-memory only. Tab close = re-prompt.
- Theme preference: `localStorage` **is** used (not sensitive). Key: `harvester:theme`.
- Last-seen-log-ts: `localStorage`, used to show "new logs since your last visit" affordance on Dashboard.
- No IndexedDB.

#### Action Items
1. [ ] `util/storage.ts` wrapper — typed keys, never stores anything from `authStore`.

---

### ADR-030: Backup, export, and data portability

**Status:** Accepted
**Date:** 2026-04-18

#### Decision
- Settings page: "Export config" button → downloads `config.json` (API key masked as `***`, LAN hash masked as `***`). Not a backup — a troubleshooting artifact.
- Settings page: "Export DB" button → hot-copies `harvester.db` via `VACUUM INTO` to a user-chosen path. Full backup.
- Logs `/logs` page: export button (PRD §10.2) → JSONL of filtered view.
- Stats page: CSV export of daily rollups.
- No import-config feature in v1 — rule-sets can be recreated, DB can be copied into place manually.

#### Action Items
1. [ ] Backend: `GET /api/settings/export` (masked config), `GET /api/db/export` (streams file).
2. [ ] Frontend: buttons.

---

### ADR-031: Process supervision = user's responsibility; documentation-only

**Status:** Accepted
**Date:** 2026-04-18

#### Decision
Harvester ships with a `start.bat` that runs once and exits when the process dies. For persistence across crashes or reboots, README documents three options:
- **`nssm`** (Windows): turns any exe into a service.
- **`pm2`** (cross-platform): process manager with auto-restart.
- **Task Scheduler** (Windows): on-login trigger.

We ship zero code for any of these. User picks. This was explicitly dropped from v1 scope per user direction.

---

### ADR-032: First-run migrations for the factory default rule-set

**Status:** Accepted
**Date:** 2026-04-18

#### Decision
On first successful first-run-wizard completion, if user opted in, seed the DB with the factory default rule-set (PRD FR-RE-02 values). Seed code is idempotent via a marker in `service_state.metadata` (JSON column — add in migration 0002 if not in 0001).

**Actually:** simpler — use a row in `rule_sets` with `name='default'` and `created_at` marking seed. If present, skip.

Default rule-set JSON written verbatim into a constant `DEFAULT_RULE_SET` in `rules/defaults.ts`. That constant is also the reference the JSON Schema validator is tested against.

---

### ADR-033: Graceful degradation playbook

**Status:** Accepted
**Date:** 2026-04-18

#### Decision
Every external dependency has a defined degraded mode:

| Dependency down | Behavior |
|-----------------|----------|
| M-Team API 5xx / timeout | Poller backoff (FR-PO-04). Dashboard shows "API errors" banner. UI stays usable (reads DB). |
| qBt unreachable | Grabs queue in `grab_queue`. Torrents page shows "qBt disconnected" banner. Lifecycle pauses new decisions (existing stays). |
| SQLite write fails (disk full, locked) | Log WARN, retry 3× with 100 ms backoff. If persists: set service to STOPPED, surface red banner, reject API writes. Reads still serve from DB. |
| Log file system full | Drop to DB tail only; file-writer logs one WARN per hour. |
| Event bus listener dies | Never — listeners are wrapped in try/catch per-handler. Broken handler is removed with a WARN. |

Never silent: every degraded state has a visible UI chip or banner.

---

### ADR-034: Security posture & threat model

**Status:** Accepted
**Date:** 2026-04-18

#### Threat model
| Threat | Mitigation |
|--------|------------|
| Malicious rule JSON via API | Zod + JSON Schema validation at API boundary; regex compiled once via `new RegExp(..., 'u')` with a length cap (≤ 500 chars) to prevent ReDoS. |
| Cross-site request forgery | Not applicable v1 (localhost only), relevant Phase 3 — mitigated by bearer-token requirement and no cookies. |
| Secret exfiltration via logs | Redactor (ADR-010). |
| Brute force LAN password | Rate limiter + Argon2id verify cost + strong-password validator. |
| Supply chain | Pinned deps (package-lock.json), CI audit gate, allowlist (ADR-024). |
| qBt credential exposure on process memory dump | Accepted — this is a desktop tool; OS-level memory protection applies. |
| M-Team ToS violation via poll rate | Hard-coded 60 s floor. |

#### Out of scope for v1
Code signing, sandboxing, hardened binary. Documented.

---

### ADR-035: Versioning & compatibility promises

**Status:** Accepted
**Date:** 2026-04-18

#### Decision
- **Semantic versioning** for releases.
- `/api/*` contract is the stable surface. Breaking changes bump major.
- Rule-set JSON schema version is **independent** from app version. Migrations bridge.
- `schema_migrations.version` is independent from both. Migrations are forward-only and never deleted.
- Config file format is versioned via `config_schema_version` field. Unknown fields at load time → WARN log, ignored (forward-compat); missing required fields → error.

---

## 5. Cross-Cutting Concerns — Appendix

### 5.1 Logging event catalog (subset — full list in IMPLEMENTATION.md)

| Component | Event | Level | Notes |
|-----------|-------|-------|-------|
| `poller` | `cycle.started` | INFO | — |
| `poller` | `cycle.finished` | INFO | `{torrents_seen, torrents_grabbed, duration_ms}` |
| `poller` | `cycle.failed` | WARN | `{error.code, consecutive_errors}` |
| `rules` | `evaluate.grabbed` | INFO | `{mteam_id, name, matched_rule_set_names}` |
| `rules` | `evaluate.skipped` | DEBUG | `{mteam_id, rejection_reason}` |
| `downloader` | `grab.started` | INFO | `{mteam_id, rule_set_names}` |
| `downloader` | `grab.queued` | WARN | qBt was down |
| `downloader` | `grab.success` | INFO | `{mteam_id, infohash}` |
| `downloader` | `grab.failed` | ERROR | |
| `lifecycle` | `remove.data` | INFO | |
| `lifecycle` | `discount.flipped` | WARN | safety override fired |
| `emergency` | `triggered` | WARN | |
| `emergency` | `cleared` | INFO | |
| `auth` | `request.unauthenticated` | WARN | Phase 3 |
| `auth` | `rate_limited` | WARN | Phase 3 |
| `config` | `updated` | INFO | redacted payload |

### 5.2 HTTP status code policy

| Scenario | Status | Body shape |
|----------|--------|------------|
| Success | 200 | `{ok:true, data:...}` |
| Validation error | 400 | `{ok:false, error:{code:'RULE_VALIDATION'|'CONFIG_INVALID'|..., user_message, details?}}` |
| Unauthenticated (Phase 3) | 401 | `{ok:false, error:{code:'AUTH_UNAUTHENTICATED', user_message}}` |
| Conflict (e.g. rule name exists) | 409 | `{ok:false, error:{code:'RULE_NAME_CONFLICT', user_message}}` |
| Rate limited | 429 | `{ok:false, error:{code:'AUTH_RATE_LIMITED', user_message}}`, header `Retry-After` |
| Not found | 404 | `{ok:false, error:{code:'NOT_FOUND', user_message}}` |
| Upstream failure (M-Team, qBt) | 503 | `{ok:false, error:{code:'MTEAM_UNAVAILABLE'|'QBT_UNREACHABLE', user_message, retryable:true}}` |
| Internal | 500 | `{ok:false, error:{code:'INTERNAL', user_message:'Unexpected error, see logs'}}` |

### 5.3 Dependencies — final pinned list (see ADR-024)

| Package | Role | Pin |
|---------|------|-----|
| fastify | HTTP | `^4.28.0` |
| @fastify/static | static | `^7.0.0` |
| @fastify/rate-limit | rate limit | `^9.0.0` |
| @fastify/sensible | defaults | `^5.5.0` |
| @fastify/cors | CORS | `^9.0.0` |
| better-sqlite3 | DB | `^11.3.0` |
| pino | logger | `^9.3.0` |
| pino-roll | rotation | `^2.0.0` |
| argon2 | hashing | `^0.41.0` |
| ajv | JSON Schema | `^8.17.0` |
| zod | validation | `^3.23.0` |
| zod-to-json-schema | codegen | `^3.23.0` |
| date-fns | time | `^3.6.0` |
| date-fns-tz | TZ | `^3.1.0` |
| yeast.js | M-Team SDK | Phase 0 verifies version |
| vitest | test | `^1.6.0` |
| playwright | E2E | `^1.44.0` |
| msw | mocks | `^2.3.0` |
| typescript | TS | `^5.4.0` |
| eslint | lint | `^9.0.0` |
| eslint-plugin-boundaries | boundaries | `^5.0.0` |
| prettier | fmt | `^3.3.0` |

Frontend (per UI_HANDOFF.md):
| Package | Role | Pin |
|---------|------|-----|
| react | UI | `^18.3.0` |
| react-dom | DOM | `^18.3.0` |
| react-router-dom | routing | `^6.23.0` |
| @tanstack/react-query | server state | `^5.40.0` |
| zustand | local state | `^4.5.0` |
| @tanstack/react-virtual | virtualization | `^3.5.0` |
| recharts | charts | `^2.12.0` |
| @monaco-editor/react | code editor | `^4.6.0` |
| lucide-react | icons | `^0.383.0` |
| react-hook-form | forms | `^7.51.0` |
| @hookform/resolvers | zod | `^3.3.0` |
| @microsoft/fetch-event-source | SSE | `^2.0.0` |
| tailwindcss | CSS | `^3.4.0` |
| class-variance-authority | variants | `^0.7.0` |
| clsx / tailwind-merge | class utils | `^2.1.0` |
| vite | bundler | `^5.3.0` |

### 5.4 Build & CI pipeline

```
lint → typecheck → unit-test (backend) → unit-test (frontend) → integration-test →
build-backend → build-frontend → bundle-size-check → e2e → audit → package
```

Gates:
- ESLint zero-warnings.
- `tsc --noEmit` zero errors.
- Vitest pass with ≥ 80% coverage on `rules/evaluator.ts`, `workers/*`, `auth/*`.
- Playwright pass on three specs minimum.
- Bundle size check: frontend critical JS ≤ 250 KB gzipped.
- `npm audit --audit-level=high` zero issues.

### 5.5 Release checklist (v1.0)

- [ ] Phase 0 spike complete; `forbidden.ts` populated (ADR-007).
- [ ] Schema migration `0001_init.sql` matches PRD §9 exactly.
- [ ] Factory default rule-set seed validated against JSON Schema.
- [ ] All PRD §15 acceptance criteria green in test matrix.
- [ ] README with install instructions & `start.bat` walkthrough.
- [ ] Redactor loaded with user's API key + qBt password at boot (verified via test that writes those values into a log and asserts redaction).
- [ ] Argon2id cost parameters tuned on target hardware (measured).

---

## 6. Open Architectural Questions (minimal — most resolved via PRD brainstorm)

| # | Question | Blocking? |
|---|----------|-----------|
| OAQ-1 | Exact Argon2id cost params — final values after bench on reference 2020 laptop | No (placeholder `t=3, m=64MiB, p=4`) |
| OAQ-2 | SSE ring-buffer size per connection — 100 events enough for slow clients, or need 1 k? | No (revise post-beta) |
| OAQ-3 | Whether to expose `/api/db/export` unauthenticated on localhost only, or require LAN-mode password when LAN is enabled | Yes — lean toward require auth always when LAN on |
| OAQ-4 | yeast.js package exports — confirm compatibility with Node 20 ESM in Phase 0 | Yes |

---

## 7. Traceability Matrix (PRD FR → ADR)

| PRD FR | ADR owner |
|--------|-----------|
| FR-PO-01..07 (Poller) | ADR-001, ADR-007, ADR-008, ADR-020 |
| FR-RE-01..07 (Rule Engine) | ADR-009, ADR-021, ADR-028 |
| FR-DL-01..05 (Downloader) | ADR-017, ADR-007, ADR-020 |
| FR-LC-01..07 (Lifecycle) | ADR-008, ADR-017 |
| FR-EM-01..04 (Emergency) | ADR-008, ADR-020 |
| FR-UI-01..04 (Web UI) | ADR-012, ADR-013, ADR-026, ADR-027 |
| FR-OB-01..03 (Observability) | ADR-010, ADR-025 |
| FR-SG-01..05 (Safety) | ADR-020, ADR-022 |
| FR-AUTH-01..10 (LAN Auth) | ADR-011, ADR-029, ADR-034 |
| FR-CP-01..06 (Compliance) | ADR-007, ADR-015, ADR-034 |
| Data model (PRD §9) | ADR-004, ADR-005 |
| HTTP/SSE API (PRD §12) | ADR-003, ADR-006 |
| Phased plan (PRD §13) | ADR-035 |
| Acceptance criteria (PRD §15) | ADR-018 (test matrix) |

---

*End of ARCHITECTURE.md. All ADRs are Accepted. IMPLEMENTATION.md MUST NOT contradict this file; if it does, amend ADR first.*
