# @calepin/shared

Cross-cutting primitives every other package may depend on: identifiers, result
and error types, value objects, and helpers that must behave identically on the
server, in the browser and in the worker.

**Rule:** this package must never import a business domain. It sits below all of
them; an import in the other direction is a cycle.

## Subpath exports

| Import                       | What it holds                                                                                                                                                |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `@calepin/shared`            | the package's own surface — `APP_NAME`, `BUSINESS_DOMAINS`                                                                                                   |
| `@calepin/shared/audit`      | the audited-model registry, the actor scope and the Prisma extension that fills `updatedById` and `version` (CAL-022)                                        |
| `@calepin/shared/auth`       | the Auth.js persistence adapter over the client seam, the session lifetimes (CAL-024), the email sign-in provider and its five-per-hour rate limit (CAL-025), the Google and GitHub providers and their shared verified-email account linking (CAL-026, CAL-027) |
| `@calepin/shared/config`     | the Zod environment schema and the single validated `process.env` read (CAL-006)                                                                             |
| `@calepin/shared/database`   | the client seam — the process shell registers a `PrismaClient` here and the repository layer reads it (CAL-023). **Only a process shell may import it**      |
| `@calepin/shared/repository` | the owner access policy: the ownership registry, `ProjectScope`, the scoped `where` builder and the project repository (CAL-023)                             |
| `@calepin/shared/errors`     | the `AppError` hierarchy, `Result`, the HTTP mapping, the French user messages (CAL-010)                                                                     |
| `@calepin/shared/freedom-level` | the freedom-level policy over the ten source dimensions, the constraints it resolves to at each of the four stages, the compliance check and the French an author reads (CAL-044) |
| `@calepin/shared/generation` | the generation attempt lifecycle and its append-only guarantee (CAL-010)                                                                                     |
| `@calepin/shared/logging`    | the Pino logger, the correlation context and the log field allowlist (CAL-009)                                                                               |
| `@calepin/shared/testing`    | test helpers — data factories, log capture                                                                                                                   |

They are separate entry points on purpose: importing `@calepin/shared` for
`BUSINESS_DOMAINS` must not drag in environment validation, and importing the
logger must not require a complete environment.

`@calepin/shared/logging` and `@calepin/shared/audit` are server-side only — both
read `node:async_hooks`. `audit` describes the Prisma extension structurally and
imports nothing from `@prisma/client`, not even a type, so the registry stays
readable by the `unit` test project without a generated client.

`database` and `repository` are server-side only too, and `@prisma/client` is a
**dev** dependency of this package on purpose: both import it as a type and
never as a value, so neither adds a runtime dependency on a generated client.
The two are separate entry points so the lint rule of CLAUDE.md §3.5 can ban one
by name and leave the other importable — the repository is what a route reaches
for, the client is what only a process shell may hold.

`auth` is there for the same reason (CAL-024). Auth.js needs a Prisma client and
`apps/web` may not hold one, so the adapter is built here, over
`getDatabaseClient()`, and the application receives an opaque `AuthAdapter`. It
is the one module in this package with a runtime dependency on
`@auth/prisma-adapter`; nothing else imports it, so nothing else pays for it.
The email sign-in provider (CAL-025) follows the same division for the same
reason: `apps/web` supplies SMTP settings, not a `nodemailer` `Transporter`,
so this is also the one module with a runtime dependency on `@auth/core` and
`nodemailer`.

Nothing in the backlog owns `shared` as an epic. It grows from tasks that
explicitly demand one implementation used in several runtimes — for example the
single word-count function shared by client and server (CAL-041, reused by
CAL-118), the generic versioning core (CAL-146) and the error hierarchy
(CAL-010).
