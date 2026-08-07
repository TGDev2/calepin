# ADR-001 — Application architecture

- **Status**: accepted
- **Date**: 2026-08-08
- **Task**: CAL-008
- **Scope**: the shape of the backend, the boundary between the AI layer and
  the business layer, the versioning strategy for narrative entities, and
  what these decisions mean for deployment. Revising any of them starts with
  revising this document.

## Context

Calepin accompanies the writing of a novel from a source text to an exported
manuscript. Its workload has two shapes that pull the architecture in
opposite directions.

The first shape is interactive: browsing and editing the bible, the outline,
the manuscript. Request-scoped, low-latency, ordinary web work — exactly what
Next.js is for.

The second shape is generative. A mission (`analyze-source-text`,
`write-scene`, `check-coherence`, …) composes context, calls a model
provider, and waits for a structured response that must be validated before
anything is persisted. Five forces make this second shape the one that
decides the architecture:

1. **Generations are long.** Writing a scene or auditing coherence can take
   minutes — longer than an HTTP request should live. Browser tabs close,
   proxies time out, deploys restart processes. Each attempt has a real token
   cost, so an interrupted generation is not a free retry; it is money spent
   for nothing.
2. **Generations need a queue.** Bounded concurrency, retry with error
   classification (transient versus permanent, CAL-064), resumability after
   a crash and per-generation accounting all require a durable queue with a
   long-lived consumer. The backlog builds this on BullMQ over Redis
   (CAL-060 and onwards), and the compose stack already provisions Redis.
3. **Every narrative entity is versioned.** A successful generation appends
   a `Revision`; nothing is overwritten in place (CAL-146). A failed
   generation must write nothing except its `Generation` record — status,
   failure category, attempt count — and must leave the project valid and
   replayable. This requires transactional writes in PostgreSQL, and it is
   also what makes retries safe: replaying a job can only add a new
   revision, never corrupt an existing one.
4. **One person deploys and operates everything.** Every additional service,
   API contract, deployment pipeline or dashboard is paid for out of the
   same person's attention. The whole system must fit on one machine and in
   one head.
5. **Provider independence is a named major risk.** The model provider must
   be swappable — per mission — without touching a narrative rule. Wherever
   provider code can leak into business code, it eventually will; the
   architecture has to make the leak structurally visible.

## Options considered

### Option A — everything inside Next.js (rejected)

Server actions and route handlers hold the business logic and call the model
provider inline; no worker, no queue. This is the default shape a Next.js
codebase grows into when nothing pushes back.

Rejected because the request cycle is the wrong lifetime for the product's
core operation:

- A generation tied to an HTTP connection dies with it. A closed tab, a
  proxy timeout or a deploy kills a paid, minutes-long generation in flight,
  and force 3's guarantees — nothing partial, everything replayable — have
  nowhere to live.
- Retry, backoff, concurrency limits and resumability would have to be
  rebuilt inside request handlers: a queue, written badly, by hand.
- Generation load and interactive load compete in the same process; one long
  mission degrades the editing experience for everything else.
- Business logic embedded in routes is unreachable from any second process —
  and CAL-060's worker is a certainty in the backlog, not a hypothesis.

What survives from this option: server actions remain the door for
everything request-shaped, and `apps/web` stays the only HTTP surface.

### Option B — a separate backend service (rejected)

A standalone API service (Fastify, NestJS, …) owns the business logic and
the database; Next.js becomes a pure frontend talking to it over HTTP; the
worker sits beside the API service.

Rejected because it buys isolation Calepin does not need, at a price a solo
operator cannot amortise:

- It doubles the operational surface: a second deployment, a second
  configuration, a second log stream, plus an API contract to design,
  version and keep backward-compatible — for a product with exactly one
  consumer of that API.
- Every feature crosses the contract: define the DTO, validate it twice, or
  maintain an RPC layer. Iteration speed is the solo operator's main asset,
  and this spends it on plumbing.
- The boundary it hardens — interface versus business — is not the one at
  risk. The boundary this product lives or dies by is business versus AI
  (force 5), and a network hop does nothing to defend it.
- The monorepo already provides the separation that matters: business logic
  in packages, consumed as source by any process, with pnpm refusing
  undeclared imports.

### Option C — serverless functions with a managed queue (rejected)

Deploy `apps/web` on a serverless platform and run generations as cloud
functions triggered by a managed queue (Inngest, QStash, SQS, …).

Rejected because it moves the hardest constraint onto rented ground:

- Function execution caps collide with force 1 exactly where it hurts: the
  platform decides the ceiling, and multi-minute missions with retries end
  up shaped around it.
- It trades provider independence for platform dependence — vendor coupling
  in the layer where independence is a named risk.
- Local development and integration tests become simulation. The compose
  stack (PostgreSQL, Redis, MinIO) and Testcontainers already give a local
  story faithful to production; a managed queue forks the two.

## Decision

**Calepin is a modular monolith: one repository, one deployable unit, two
long-lived processes over the same packages.**

```
 apps/web ─────────────── enqueues jobs ──────────► Redis (BullMQ)
 Next.js: routes, screens,                              │
 server actions — the only                              ▼
 HTTP surface                                  apps/worker (CAL-060)
     │                                         executes missions
     │                                                  │
     └──────────────► packages/* ◄──────────────────────┘
        domains ×7 · @calepin/ai (CAL-048) · @calepin/shared
        imported as TypeScript source by both processes
                          │
                          ▼
          PostgreSQL · Redis · MinIO   (docker compose)
```

- **`apps/web`** is the only HTTP surface: routes, screens, server actions,
  composition of dependencies. It enqueues generation jobs and reads
  generation state. It holds no business rule.
- **`apps/worker`** (CAL-060) is a plain long-lived Node process consuming
  BullMQ queues. It executes missions through `@calepin/ai` and persists
  results through domain code. It serves no HTTP.
- **`packages/<domain>`** hold every narrative rule, as `CLAUDE.md` §3
  already requires. The backend is neither "inside Next.js" nor "a separate
  service": the backend is the packages, and the two processes are thin
  shells that compose them with concrete adapters.
- **All shared state lives in PostgreSQL and Redis.** Neither process holds
  authoritative state in memory, so either can restart at any time — a
  property CAL-190 tests mid-generation.

### Execution model for generations

- A mission that can outlive a comfortable request window runs as a BullMQ
  job in the worker. A short mission may run synchronously inside a server
  action. Both paths execute the same domain function with the same injected
  AI port; only the scheduler differs.
- The durable record of an attempt is the `Generation` row: mission id,
  prompt version, model, token counts, duration, status, error category,
  attempt count. The UI observes progress by reading generation state —
  polling or server-sent events, decided by the task that builds the
  generation UI — never through the HTTP response that enqueued the job.
- Provider credentials are configuration of the processes that execute
  missions, injected at composition time — never read inside a domain
  (`CLAUDE.md` §4.2: `process.env` has exactly one reader).

### Versioning strategy

The write path for narrative entities is append-only:

- A successful generation appends a `Revision` linked to its `Generation`;
  the current state of an entity is its latest accepted revision, never an
  in-place update.
- A failed or abandoned generation writes its `Generation` record and
  nothing else. The previous revision remains the visible, valid state.
- Retries and replays are therefore safe by construction: they can add
  revisions, they cannot corrupt one. The queue is allowed to redeliver
  precisely because the write path is append-only.
- Prompts version independently (a numeric `version`, CAL-053). A
  `Generation` records both its prompt version and its model, so any output
  is attributable to exactly what produced it.

## The boundary between the AI layer and the business layer

This section ratifies `CLAUDE.md` §5. The two layers are defined by what
they own — and, more importantly, by what they must never contain.

**The business layer** — `packages/<domain>` — owns narrative meaning:
rules, invariants, state machines, the Zod output schema of every mission,
and the decision of what gets persisted. It never imports a provider SDK,
never holds prompt text, never reads `process.env`, never talks to the
network.

**The AI layer** — `@calepin/ai` (CAL-048) — owns mechanics: the provider
port and its adapters, the mission registry (one mission, one declared
treatment — model, parameters, context budget, schema reference, expected
cost), the versioned prompt registry (CAL-053), context composition
(CAL-054), token accounting, retries, fallbacks and error classification.
It never decides a narrative rule, never writes to the database, never
restates a domain schema.

The seam between them, in five rules:

1. **Domains import types only** from `@calepin/ai`: the port interface,
   the mission identifiers, the error types. Never an adapter.
2. **The concrete port is injected** by the process shell — `apps/web` or
   the worker — into domain functions. Unit tests inject a fake and run
   every narrative rule without a network call (CAL-189).
3. **The domain owns the schema; the registry references it.** A model
   response is untrusted input: it is parsed against the domain's schema
   before any side effect, and a response that fails validation writes
   nothing.
4. **Data flows one way.** The domain asks the port to execute a mission
   with composed context; the AI layer returns validated, typed data or a
   classified error; the domain decides persistence and resolves every id
   and reference itself. A model names things; it never chooses keys.
5. **Text and SDKs stay home.** Prompt text exists only in the prompt
   registry; provider SDKs exist only inside `@calepin/ai` adapters. Both
   are lint-enforced from CAL-048; until then, review enforces them.

## Consequences

### What this buys

- Generations survive closed tabs, timeouts, deploys and worker crashes; a
  failure is visible, classified and replayable, and the project it touched
  stays valid.
- One deployment story: `docker compose up` — or one small VM — runs web,
  worker, PostgreSQL, Redis and MinIO. One person can hold the whole system
  in their head: force 4 satisfied rather than approximated.
- Swapping or adding a model provider is an adapter plus mission
  declarations inside `@calepin/ai`; no narrative rule moves.
- Domains stay unit-testable with no network, database or clock — the same
  boundaries the test pyramid (CAL-189 to CAL-191) leans on.
- No API contract between frontend and backend to design, version or
  maintain.

### What this costs — accepted

- Two processes exist from CAL-060 on: both must build, start and be
  monitored, locally and in production. Local work needs Docker running.
- **Web and worker deploy from the same commit, always.** They share domain
  code and database schema; letting them drift is a corruption risk. One
  release produces both images; a deploy replaces both.
- Redis is a hard availability dependency of the core feature, not a cache.
- Generation UX is asynchronous by construction: job state must be surfaced
  explicitly, and the interface must treat "in progress" as a first-class
  state.
- The in-process boundaries are defended by dependency declarations, lint
  and review — not by a network. `CLAUDE.md` §3.2 and CAL-048's lint rule
  are the enforcement; a boundary breach in review is a defect, not a style
  remark.
- Scaling is vertical in practice. Accepted: the unit of load is one
  author's novel. If that changes, the cut point already exists — the worker
  is a separate process consuming a durable queue, so replicating or
  extracting it later requires no change to domain code.

### What this binds

The tasks that build on this decision inherit its constraints instead of
re-deciding them: logging and errors as values (CAL-009, CAL-010), Prisma
and the append-only write path (CAL-011 onwards, CAL-146), the AI layer and
its registries (CAL-048, CAL-051 to CAL-054), the worker (CAL-060 onwards),
retry classification (CAL-064), and the test pyramid against fakes and real
infrastructure (CAL-189 to CAL-191).
