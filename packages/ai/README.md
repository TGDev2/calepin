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

## What exists (CAL-052)

- `repair.ts` — the answer to an answer that failed its mission's schema, and
  the distinction §6 asks for: *erreur de forme* against *erreur de fond*.
  `classifyOutputFailure` is structural and never semantic, because this layer
  may not know what a chapter means. Two signals make an answer off-topic —
  it is **not of the contract's kind** (a string, a list, a null, or no JSON at
  all where an object was asked for), or it **shares no field name with the
  contract** (`{}`, a refusal wearing its own shape). Everything else is a form
  failure: the answer attempted the contract and one field of it is wrong.
- `buildRepairPrompt` — the targeted re-ask, in French, carrying the mission,
  the rejected answer and one clause per violation. The answer travels back
  because a provider call is stateless: without it the model has nothing to
  correct and the pass is a blind retry wearing a repair's name. The clauses
  are built from issue *codes*, never from issue messages — a validator's
  message is the one place a received value can appear.
- `RepairPolicy` — the bound, explicit and injectable. **One** repair pass by
  default; `0` disables it. A repair is a full pass, so a rate limit hit during
  one is treated as a rate limit rather than as an unusable answer.
- Two codes rather than one: `MODEL_OUTPUT_INVALID` once the repair has been
  attempted and did not hold, `MODEL_OUTPUT_OFF_TOPIC` for the answer that was
  never repaired. Different remedies — a prompt to fix against a schema or a
  format — and the code is the axis an operations view reads.
- The failure type is logged, the answer never is: `ai.output-repair-attempted`
  and `ai.output-rejected` carry the mission, the endpoint, the attempt, the
  number of violations and the **path** of the first one (§9).
- `output-repair.test.ts` — the acceptance criterion, through
  `runGenerationAttempt`: an invalid output is repaired once, fails explicitly,
  and writes nothing at all.

## What exists (CAL-053)

- `prompts/` — the prompt registry. A prompt is a **versioned resource**: an
  id, a version, the mission it serves, its typed variables, and the two pieces
  of text it is made of. One module per prompt, versions in an append-only
  array, the current one last — the shape `SourceTextVersion` already uses,
  and the reason a recorded `promptVersion` still points at fixed text a year
  later.
- **Prompts are code, not rows.** A `Prompt` table would let the text that
  produces the novel change without review, drift between environments, and
  need a migration to ship a wording fix. Being code, a prompt change is a diff
  a human reads and is reachable forever from the version an attempt recorded.
- **The port stops accepting strings.** `ModelRequest.prompt` is a
  `RenderedPrompt` — branded, mintable only by `renderPrompt`, the
  `ProjectScope` idiom one layer up. Two consequences, and both are the point:
  no prompt text reaches a provider from outside the registry (§5.2), and no
  call can happen without a version to record. The mission is read off the
  prompt rather than passed beside it, so a request cannot name one mission and
  carry another's text.
- **Variables are declared and typed** — `text`, `number`, `list` — and all of
  them are required; an optional section is a `list`, and an empty one renders
  as a dash. `currentPrompt(id)` is typed as the *last* version, so shipping a
  version that adds a variable breaks every call site that does not supply it,
  at compile time. `registry.test.ts` checks the two directions no compiler
  can: every placeholder is declared, and every declared variable is used.
- **The version is recorded before the call**, not read off the answer:
  `runGenerationAttempt` takes `promptVersion` and hands it to `start`, so a
  worker that dies mid-generation still attributes the attempt to a prompt.
  `ModelCallMeta` carries `promptId` and `promptVersion` too, and both are on
  the §9 log allowlist — they are identifiers, and the composed context they
  were filled with never is.
- **The repair re-ask became a prompt** (`prompts/repair.ts`), scoped to the
  pipeline rather than to a mission: it serves every mission and names none.
  The derived pass keeps the *mission* prompt's id and version, because
  `GenerationAttempt` has one `promptVersion` column and recording the repair
  resource's own would attribute the answer to the wrong prompt. `repair.ts`
  keeps the classification and the bound, and now holds no instruction to a
  model at all.
- **The comparison tool**: `comparePromptVersions(id, from, to)` returns the
  variable contract's changes — added, removed, retyped — and a line-level diff
  of both texts; `formatPromptComparison` renders it; `pnpm prompt:diff` is the
  command. Two versions of the *same* prompt only: two different prompts share
  no variable set, so a diff of them says nothing about either.

## What arrives in its own task

Context composer (CAL-054) · token accounting and pricing (CAL-056) · the
credentials both adapters take, resolved from the validated config module by
the process shell (CAL-060).

## Hard rules

- Provider SDKs are importable only under `src/adapters/` — lint-enforced,
  and `provider-sdk-boundary.test.ts` proves the rule fires.
- This package depends on `@calepin/shared` only. A domain imports types,
  mission identifiers and error types from here — never an adapter; the
  concrete port is injected by `apps/web` or the worker.
