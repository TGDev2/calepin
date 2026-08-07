# @calepin/shared

Cross-cutting primitives every other package may depend on: identifiers, result
and error types, value objects, and helpers that must behave identically on the
server, in the browser and in the worker.

**Rule:** this package must never import a business domain. It sits below all of
them; an import in the other direction is a cycle.

## Subpath exports

| Import | What it holds |
|---|---|
| `@calepin/shared` | the package's own surface — `APP_NAME`, `BUSINESS_DOMAINS` |
| `@calepin/shared/config` | the Zod environment schema and the single validated `process.env` read (CAL-006) |
| `@calepin/shared/errors` | the `AppError` hierarchy, `Result`, the HTTP mapping, the French user messages (CAL-010) |
| `@calepin/shared/generation` | the generation attempt lifecycle and its append-only guarantee (CAL-010) |
| `@calepin/shared/logging` | the Pino logger, the correlation context and the log field allowlist (CAL-009) |
| `@calepin/shared/testing` | test helpers — data factories, log capture |

They are separate entry points on purpose: importing `@calepin/shared` for
`BUSINESS_DOMAINS` must not drag in environment validation, and importing the
logger must not require a complete environment.

`@calepin/shared/logging` is server-side only — it reads `node:async_hooks`.

Nothing in the backlog owns `shared` as an epic. It grows from tasks that
explicitly demand one implementation used in several runtimes — for example the
single word-count function shared by client and server (CAL-041, reused by
CAL-118), the generic versioning core (CAL-146) and the error hierarchy
(CAL-010).
