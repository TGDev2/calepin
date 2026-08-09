# @calepin/ai

The AI layer (CLAUDE.md §5, ADR-001). It owns mechanics — missions, models,
capabilities, retries, fallbacks, deadlines, cancellation — and knows nothing
about narrative meaning. It never writes to the database, never decides a
narrative rule, and never restates a domain schema.

## What exists (CAL-048)

- `missions.ts` — the ten mission identifiers, pinned against the
  `GenerationMission` Prisma enum.
- `capabilities.ts` — the explicit capability sheet of every model this layer
  may route to. No pricing: CAL-056 owns the configurable tariff table.
- `routing.ts` — one entry per mission: model, backup model, output cap,
  deadline, effort. **The one file a model change touches.**
- `port.ts` — `ModelProviderPort`, the only surface business code sees:
  `generateProse` and schema-validated `generateStructured`.
- `adapter.ts` — the contract a provider adapter implements (CAL-049 the
  primary, CAL-050 the second provider). Adapters receive JSON Schema and
  return exact token usage; they never see Zod and never persist anything.
- `create-model-port.ts` — the pipeline around any adapter: deadline per
  attempt, clean cancellation, retry with classification and backoff,
  rate-limit handling, switch to the backup model, output validation.

## What exists (CAL-049)

- `adapters/anthropic.ts` — the primary provider adapter, and the only file
  in the repository that may import a provider SDK. It translates and sets no
  policy: the transport streams, structured calls are constrained by the JSON
  Schema the pipeline derived, usage is reported exactly as the provider
  reported it, and the SDK's own retries are turned off (`maxRetries: 0`) so
  the one exponential backoff is `retry.ts`'s. The key is a constructor
  argument — no package outside the config module reads the environment.

## What exists (CAL-050)

- `adapters/bedrock.ts` — the fallback provider adapter. Bedrock serves the
  **same** Claude models under a different account, credential and control
  plane, which is where an outage actually lives; keeping the model is what
  keeps a chapter written after a switch from changing voice mid-novel. Its
  model ids are Bedrock's own, prefix included, so nothing translates.
- `adapters/messages.ts` — the translation the two adapters share. Both
  clients expose the same `messages` resource, so a per-provider copy of the
  request shape and the error classification would only give the failover one
  endpoint whose classification silently rots.
- `health.ts` — provider availability **across** calls. A durable outage is
  invisible from inside one request, so consecutive provider-side failures
  mark an endpoint down for a cooldown and the next call starts at the other
  one; a success clears it, and after the cooldown one call probes it again.
  A rate limit never marks a provider down — a 429 says the provider is
  working and we are over quota, and treating it as an outage would move the
  same load onto the backup.
- `routing.ts` — every mission's `fallbackModel` is now its primary's twin on
  the other provider. `routing.test.ts` pins both halves: never the same
  model, never the same provider.
- `failover.test.ts` — the acceptance criterion, run through
  `runGenerationAttempt`: a primary that dies while it answers, and a
  generation that completes anyway, started once and completed once, never
  recorded as failed, on a request the second endpoint received unchanged.

## What arrives in its own task

Full mission registry over the routing table (CAL-051) · output repair
(CAL-052) · prompt registry (CAL-053) · context composer (CAL-054) · token
accounting (CAL-056) · the credentials both adapters take, resolved from the
validated config module by the process shell (CAL-060).

## Hard rules

- Provider SDKs are importable only under `src/adapters/` — lint-enforced,
  and `provider-sdk-boundary.test.ts` proves the rule fires.
- This package depends on `@calepin/shared` only. A domain imports types,
  mission identifiers and error types from here — never an adapter; the
  concrete port is injected by `apps/web` or the worker.
