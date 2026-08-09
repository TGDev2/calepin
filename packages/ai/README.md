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
- `mission-registry.ts` — one entry per mission. **The one file a model change
  touches** (grown into the full registry by CAL-051, below).
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
- `mission-registry.ts` — every mission's `fallbackModel` is now its primary's
  twin on the other provider. The registry's test pins both halves: never the
  same model, never the same provider.
- `failover.test.ts` — the acceptance criterion, run through
  `runGenerationAttempt`: a primary that dies while it answers, and a
  generation that completes anyway, started once and completed once, never
  recorded as failed, on a request the second endpoint received unchanged.

## What exists (CAL-051)

- `mission-registry.ts` — ten entries, one per mission, each carrying its
  model, its parameters, the kind of answer it produces and who owns that
  schema, its context budget and its expected cost. Business code names a
  mission and nothing else, so retuning one is an edit here and no caller
  moves — and `mission-registry.test.ts` proves it by walking every package's
  sources: no file outside this one and the capability sheet names a model.

  | mission                  | model    | effort | max out | timeout | output     | budget | expected in/out |
  | ------------------------ | -------- | ------ | ------- | ------- | ---------- | ------ | --------------- |
  | `analyze-source-text`    | Opus 5   | high   | 16 k    | 300 s   | analysis   | 200 k  | 60 k / 8 k      |
  | `propose-directions`     | Opus 5   | high   | 16 k    | 300 s   | direction  | 60 k   | 20 k / 8 k      |
  | `evaluate-direction`     | Opus 5   | medium | 8 k     | 180 s   | direction  | 40 k   | 12 k / 4 k      |
  | `create-character-sheet` | Opus 5   | medium | 8 k     | 180 s   | bible      | 40 k   | 12 k / 4 k      |
  | `build-chapter-outline`  | Opus 5   | high   | 16 k    | 300 s   | outline    | 60 k   | 20 k / 6 k      |
  | `write-scene`            | Opus 5   | high   | 32 k    | 600 s   | **prose**  | 80 k   | 30 k / 12 k     |
  | `extract-facts`          | Sonnet 5 | low    | 8 k     | 180 s   | bible      | 60 k   | 15 k / 4 k      |
  | `check-coherence`        | Opus 5   | xhigh  | 16 k    | 600 s   | coherence  | 120 k  | 40 k / 10 k     |
  | `fix-issue`              | Opus 5   | medium | 16 k    | 300 s   | coherence  | 60 k   | 15 k / 6 k      |
  | `summarize-chapter`      | Sonnet 5 | low    | 4 k     | 120 s   | manuscript | 40 k   | 10 k / 2 k      |

  The backup is always the same model on Bedrock. Two missions leave Opus:
  `extract-facts` and `summarize-chapter` run after every chapter and produce
  no prose a reader reads, which is where the recurring cost is and where a
  cheaper model changes nothing visible.

- **The schema column is a reference, never a copy** (§5.5). A structured
  entry names the domain package that owns its Zod schema; the schema itself
  arrives per call through `StructuredGenerationRequest.schema`, so there is
  one of it and nothing to drift. The pipeline holds a caller to the declared
  kind: a structured call to a prose mission throws
  `MISSION_OUTPUT_MISMATCH`.
- **The context budget is a live signal.** When a provider reports more input
  tokens than the mission's budget, the pipeline logs
  `ai.context-budget-exceeded` — identifiers and counts only. It is checked
  after the fact because that is when the count is exact, and the tokens are
  already spent by then; refusing on an estimate would kill generations on a
  guess. It is what will catch a context composer that sends chapter 12 the
  eleven chapters before it (CAL-054).
- **Expected cost is stated in tokens, never money.** CAL-056 owns the tariff
  table; `expectedUsage` is the shape it multiplies.

## What arrives in its own task

Output repair (CAL-052) · prompt registry (CAL-053) · context composer
(CAL-054) · token accounting and pricing (CAL-056) · the credentials both
adapters take, resolved from the validated config module by the process shell
(CAL-060).

## Hard rules

- Provider SDKs are importable only under `src/adapters/` — lint-enforced,
  and `provider-sdk-boundary.test.ts` proves the rule fires.
- This package depends on `@calepin/shared` only. A domain imports types,
  mission identifiers and error types from here — never an adapter; the
  concrete port is injected by `apps/web` or the worker.
