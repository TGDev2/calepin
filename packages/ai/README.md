# @calepin/ai

The AI layer (CLAUDE.md §5, ADR-001). It owns mechanics — missions, models,
capabilities, retries, fallbacks, deadlines, cancellation — and knows nothing
about narrative meaning. It never writes to the database, never decides a
narrative rule, and never restates a domain schema.

## What exists (CAL-048)

- `missions.ts` — the mission identifiers (twenty since CAL-092), pinned
  against the `GenerationMission` Prisma enum.
- `capabilities.ts` — the explicit capability sheet of every model this layer
  may route to. No pricing: `pricing.ts` (CAL-056) owns the configurable
  tariff table.
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

- `mission-registry.ts` — eighteen entries, one per mission, each carrying its
  model, its parameters, the kind of answer it produces and who owns that
  schema, its context budget and its expected cost. Business code names a
  mission and nothing else, so retuning one is an edit here and no caller
  moves — and `mission-registry.test.ts` proves it by walking every package's
  sources: no file outside this one and the capability sheet names a model.

  | mission                       | model    | effort | max out | timeout | output     | budget | expected in/out |
  | ----------------------------- | -------- | ------ | ------- | ------- | ---------- | ------ | --------------- |
  | `analyze-source-text`         | Opus 5   | high   | 16 k    | 300 s   | analysis   | 200 k  | 60 k / 8 k      |
  | `detect-cliche-risks`         | Opus 5   | high   | 8 k     | 300 s   | analysis   | 60 k   | 20 k / 3 k      |
  | `assess-novel-potential`      | Opus 5   | high   | 8 k     | 300 s   | analysis   | 60 k   | 25 k / 3 k      |
  | `regenerate-analysis-section` | Opus 5   | high   | 4 k     | 180 s   | analysis   | 120 k  | 20 k / 0.8 k    |
  | `propose-directions`          | Opus 5   | high   | 16 k    | 300 s   | direction  | 60 k   | 20 k / 8 k      |
  | `replace-direction`           | Opus 5   | high   | 6 k     | 180 s   | direction  | 60 k   | 22 k / 2.7 k    |
  | `evaluate-direction`          | Opus 5   | medium | 8 k     | 180 s   | direction  | 40 k   | 12 k / 4 k      |
  | `combine-directions`          | Opus 5   | xhigh  | 8 k     | 300 s   | direction  | 60 k   | 24 k / 3 k      |
  | `define-novel-identity`       | Opus 5   | high   | 6 k     | 240 s   | bible      | 40 k   | 16 k / 2.5 k    |
  | `define-style`                | Opus 5   | high   | 6 k     | 240 s   | bible      | 40 k   | 16 k / 2 k      |
  | `create-character-sheet`      | Opus 5   | high   | 8 k     | 240 s   | bible      | 40 k   | 12 k / 4 k      |
  | `relate-characters`           | Opus 5   | high   | 12 k    | 300 s   | bible      | 60 k   | 20 k / 5 k      |
  | `define-world`                | Opus 5   | high   | 10 k    | 300 s   | bible      | 40 k   | 14 k / 4 k      |
  | `build-chapter-outline`       | Opus 5   | high   | 16 k    | 300 s   | outline    | 60 k   | 20 k / 6 k      |
  | `write-scene`                 | Opus 5   | high   | 32 k    | 600 s   | **prose**  | 80 k   | 30 k / 12 k     |
  | `extract-facts`               | Sonnet 5 | low    | 8 k     | 180 s   | bible      | 60 k   | 15 k / 4 k      |
  | `check-coherence`             | Opus 5   | xhigh  | 16 k    | 600 s   | coherence  | 120 k  | 40 k / 10 k     |
  | `fix-issue`                   | Opus 5   | medium | 16 k    | 300 s   | coherence  | 60 k   | 15 k / 6 k      |
  | `summarize-chapter`           | Sonnet 5 | low    | 4 k     | 120 s   | manuscript | 40 k   | 10 k / 2 k      |
  | `summarize-part`              | Sonnet 5 | low    | 2 k     | 120 s   | manuscript | 30 k   | 8 k / 1 k       |

  The backup is always the same model on Bedrock. Three missions leave Opus:
  `extract-facts`, `summarize-chapter` and `summarize-part` run after every
  validated chapter and produce no prose a reader reads, which is where the
  recurring cost is and where a cheaper model changes nothing visible.

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
- **Expected cost is stated in tokens, never money.** `pricing.ts`'s tariff
  table is what multiplies it; `expectedUsage` is the shape that table takes.

## What exists (CAL-052)

- `repair.ts` — the answer to an answer that failed its mission's schema, and
  the distinction §6 asks for: _erreur de forme_ against _erreur de fond_.
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
  are built from issue _codes_, never from issue messages — a validator's
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
  as a dash. `currentPrompt(id)` is typed as the _last_ version, so shipping a
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
  The derived pass keeps the _mission_ prompt's id and version, because
  `GenerationAttempt` has one `promptVersion` column and recording the repair
  resource's own would attribute the answer to the wrong prompt. `repair.ts`
  keeps the classification and the bound, and now holds no instruction to a
  model at all.
- **The comparison tool**: `comparePromptVersions(id, from, to)` returns the
  variable contract's changes — added, removed, retyped — and a line-level diff
  of both texts; `formatPromptComparison` renders it; `pnpm prompt:diff` is the
  command. Two versions of the _same_ prompt only: two different prompts share
  no variable set, so a diff of them says nothing about either.

## What exists (CAL-054)

- `context/` — the dynamic context composer, §5.8 made structural.
  `composeSceneContext(input)` assembles the seven ingredients of a writing
  context — the permanent instructions (the prompt's own text), the bible's
  style section, the target chapter's plan, the canon facts actually
  concerned, the preceding chapters' summaries, the excerpts continuity
  strictly requires, and the author's request — into the current `write-scene`
  prompt, and returns `Result<{ prompt, report }>`: a branded `MissionPrompt`
  and a §9-safe report (counts, identifiers, token numbers — never text).
- **A preceding chapter's full text has no way in.** No input field carries
  one, and every field that carries prose has a per-kind ceiling
  (`CONTEXT_ITEM_CEILINGS`) an entire chapter cannot pass — an oversized item
  is refused (`CONTEXT_ITEM_OVERSIZED`), never quietly truncated. The
  acceptance criterion is a test: the chapter-12 context contains none of the
  eleven preceding chapters in full.
- **Selection is structural, never semantic** (§5.7). A canon fact enters when
  the outline names it (`ChapterOutlineFact`) or when one of its subjects is
  an entity the outline names — id intersection, statements unread; named
  before linked. Excerpts: the top `MAX_CONTINUITY_EXCERPTS` by
  caller-assigned priority. Summaries: every preceding chapter, detailed for
  the nearest `DETAILED_SUMMARY_WINDOW`, brief beyond.
- **The budget is the mission's** (`contextBudgetTokens`, CAL-051) **and it is
  measured on the rendered prompt** — the exact text a provider would receive
  — with a deliberately conservative estimate (`ESTIMATED_CHARS_PER_TOKEN`,
  3 against the ~3.5–4 French prose measures). The exact check stays the
  pipeline's post-hoc `ai.context-budget-exceeded` against the provider's own
  count; over-estimating here degrades slightly more, under-estimating would
  spend the tokens before the pipeline could see it.
- **Degradation is an explicit ladder, prose first, structure last**: detailed
  summaries fall back to brief (farthest first), then excerpts drop (lowest
  priority first), then the farthest brief summaries drop — never the nearest
  `MIN_SUMMARY_COUNT`, never the outline, the style, the constraints, the
  author's request or a fact (a dropped fact invites the contradiction the
  product exists to prevent). A ladder that ends still over budget fails the
  whole composition (`CONTEXT_BUDGET_EXCEEDED`) and nothing is sent.

## What exists (CAL-055)

- **An eleventh mission**, `summarize-part`, and the second level of the
  memory. A part summary is not a second call to `summarize-chapter`: §5.4
  admits no general-purpose prompt, and compressing a part's arc out of its
  chapters' summaries is a different instruction, a different input and a
  different budget. A deterministic concatenation was considered and rejected —
  twelve chapters at fifty words is longer than one detailed chapter summary
  and compresses nothing, so it could not do the one job the level exists for.
- `summarize-chapter` **V2**: it names the five kinds of material that carry
  consequence — conséquences, décisions, révélations, changements d'état,
  changements de relation — rather than leaving "what changes for the rest" to
  be interpreted, which is exactly what `low` effort will not do reliably. The
  two lengths arrive as variables, so the target the prompt states and the bound
  the schema enforces are one number owned by `@calepin/manuscript`. V1 stays
  beside it: an attempt that recorded version 1 must still resolve to the text
  that produced it.
- `write-scene` **V2**, one hole wider: `partSummaries`, rendered before the
  chapter summaries and labelled as a coarser resolution of the same past —
  read the other way round, a model treats the coarse list as a repetition of
  the fine one and re-narrates it.
- **Part summaries are never degraded.** The ladder still sheds detail, then
  excerpts, then the farthest brief summaries; `DEGRADABLE_ITEM_KINDS` names
  those three and says why the fourth is not among them. A part summary costs
  about what one detailed chapter summary costs and stands for a whole part, so
  dropping one is the worst trade on the board — and it is precisely the span
  the third rung has already stopped covering chapter by chapter. Enough parts
  to exceed the budget fails the composition rather than shedding one.
- `context/summarize.ts` — the two summarising assemblies, and the place where
  this engine's usual answer does not apply. A writing context is a _selection_
  from a memory, so when it does not fit there is always something less
  necessary to shed; a summarising context **is** its subject, and a summary of
  half a chapter reads exactly like a summary of the chapter. So
  `composeChapterSummaryContext` has no ladder at all, and
  `composePartSummaryContext` has exactly one rung — detail falling back to
  brief for every chapter, which loses resolution and never loses a chapter.

## What exists (CAL-056)

- `pricing.ts` — the configurable tariff table: one entry per `ModelId`, USD
  per million input/output tokens, and `estimateCostUsd(model, usage)`, the
  one function that turns a measured `TokenUsage` into money. A decimal
  string at `GenerationAttempt.estimatedCostUsd`'s own precision, never a
  float. Reading and aggregating the cost this produces is
  `@calepin/shared/repository`'s `readProjectCostSummary` — this layer prices
  a call, it does not persist or sum one.

## What exists (CAL-057)

- `operations.ts` — what a costly operation is made of: a **consumption
  profile**, one entry per operation the specification calls costly, declaring
  how many calls of which mission it bills as one action, each marked
  `production`, `analysis` or `control`. It says nothing about when those calls
  run or what is done with their answers — that is the domains' business, in
  the epics that own it. Writing a chapter is five calls, and the four that
  produce no prose carry more than half its price; `operation-estimate.test.ts`
  asserts that against the tariff table rather than claiming it.
- `mission-registry.ts` — `expectedDurationMs` beside `expectedUsage`: how long
  a typical call is expected to take, which is the estimate's fallback and is
  not `timeoutMs` (that is the deadline, and quoting it would forecast the
  worst case as the normal one).
- `pricing.ts` — `sumCostUsd`, exact addition over the six-decimal strings
  `estimateCostUsd` returns, in integer micro-dollars. An operation whose
  phases ran on two models at two rates still totals to the sum of its lines.
- `operation-estimate.ts` — `estimateOperation`, which prefers a measurement of
  the same mission on the same project and falls back per phase on the
  registry's expectation, carrying the `basis` and the sample count of each; and
  `acceptOperationEstimate`, the only way to mint an `AcceptedOperationEstimate`.
  That value is branded, refuses an acknowledgement that no longer matches, and
  is what the task that launches a generation will take — so "nothing costly
  starts without an estimate shown and confirmed" is a property of the type
  rather than a rule to remember.

The measured half is `@calepin/shared/repository`'s `readMissionMeasurements`
and is handed in: this layer never reads a database. Money is derived from the
measured tokens at today's tariff, never replayed from a recorded price.

## What exists (CAL-075)

- **A twelfth mission**, `detect-cliche-risks` — the dedicated pass over the
  déjà-lu. The diagnostic's `CLICHE_RISKS` section names the slopes in one
  sentence each among sixteen other concerns of the diagnostic; §5.4 is why the deep hunt is a
  mission of its own: four fronts (situation, character, formula, reversal),
  and per finding a required verbatim passage, why it is conventional and what
  it forecloses. Its schema is `clicheRiskDetectionSchema` in
  `@calepin/analysis`, which also owns `verifyClicheRiskEvidence` — an unfound
  quotation deletes the finding whole, since evidence is required there.
- `prompts/missions/detect-cliche-risks.ts` **V1** — argue, never rate: the
  prompt forbids every numeric form a verdict could take (the specification's
  own prohibition, 1195–1199), asks for the text's own order rather than a
  severity ranking, states that an empty list is the honest answer for a
  singular text, and rules out flagging what the text merely evokes and
  displaces. Word targets and the findings ceiling arrive as variables owned
  by `@calepin/analysis` (the CAL-055 discipline). Exercised before shipping
  on conventional and singular trial texts (tasks/todo.md).

## What exists (CAL-076)

- **A thirteenth mission**, `assess-novel-potential` — the argued appraisal of
  what the source text can sustain at the project's target length, read off
  the validated analysis. Four axes plus a synthesis: elements that carry
  expansion (at least three), elements that would run dry, gaps the length
  will expose, fragilities to treat (at least two). Its schema is
  `novelPotentialAssessmentSchema` in `@calepin/analysis`, which also owns
  `verifyNovelPotentialEvidence` — evidence is nullable there, so an unfound
  quotation is cleared rather than costing the appraisal.
- `prompts/missions/assess-novel-potential.ts` **V1** — appraise, never rate:
  the same numeric-verdict prohibition as CAL-075; the minimums are stated as
  a prioritisation demand, not an invention licence (the appraisal says how
  far each element carries, which may be "not far"); the text that is there,
  not the novel one could dream onto it; gaps cite nothing, being absences.
  Word targets, minimums, the per-axis ceiling and the target word count
  arrive as variables (`@calepin/analysis`, `resolveNovelTargetWordCount`).
  Exercised before shipping on dense and thin trial texts (tasks/todo.md).

## What exists (CAL-083)

- **A fifteenth mission**, `replace-direction` — one written-off direction
  replaced by one new one, never three. Its answer is
  `directionReplacementSchema` in `@calepin/direction` (a single direction, of
  exactly the shape `propose-directions` returns three of), its ask is
  `directionReplacementInputSchema`, and its gate is
  `checkDirectionReplacement`: a candidate reproducing any excluded engine —
  the discarded direction's or either kept one's — is refused, on CAL-080's
  own axes and by CAL-080's own comparison.
- `prompts/missions/replace-direction.ts` **V1** — CAL-080's exclusion
  contract quoted rather than restated (`describeNarrativeEngine`,
  `describeNarrativeEngineAxes`, `NARRATIVE_ENGINE_DIVERGENCE_MINIMUM`), the
  discarded direction shown so the answer can differ from it deliberately, and
  the author's reason given authority over the _angle_ and never over the
  source text — the clause `regenerate-analysis-section` established. The safe
  middle between the two kept directions is refused out loud, because the
  exclusion check cannot see it.

## What exists (CAL-084)

- **A sixteenth mission**, `combine-directions` — elements selected from two
  or three directions fused into one, or the argued answer that they cannot
  be. Its answer is `directionCombinationSchema` in `@calepin/direction`: one
  strict object discriminated by `outcome`, its two branches (`direction`,
  `conflicts`) required-but-nullable and tied by a check — deliberately not a
  root union, whose JSON Schema is a `oneOf` the structured-outputs subset
  does not accept. Its ask is `directionCombinationInputSchema`; its gates
  are `checkDirectionCombinationSelection` (two selected engines that are
  distinct are refused before a call is paid for) and
  `checkDirectionCombinationAnswer` (one dominant source engine, never the
  blend between two; every named conflict verified against the selection).
  The one direction-stage mission at `xhigh` — the compromis mou is a
  judgement failure depth prevents, and the refusal has to be calibrated too.
- `prompts/missions/combine-directions.ts` **V1** — the selection quoted as
  the ask, each source direction rendered whole under its slot label; the
  dominant-engine doctrine and its mechanical re-read said out loud, the
  compromis mou and the foreign engine both named as refusals; irreducibility
  framed as a service that may name only selected elements; the two answer
  shapes spelled field by field with the branch the outcome does not own
  written null, never omitted.

## What exists (CAL-088)

- **A seventeenth mission**, `define-novel-identity` — the bible's identity
  section, transposed from the canonical direction and the validated analysis.
  Its answer is `tracedNovelIdentitySchema` in `@calepin/bible`: the nine
  fields `BibleIdentity` stores, each carrying a **required** basis — a source
  key from the ask, a verbatim quotation and the argument for it. The other
  two of the specification's eleven, _public_ and _longueur cible_, are absent
  by design: they are `Project` columns the author already set, and
  `resolveNovelIdentity` puts them back.
- Its ask is `novelIdentityInputSchema`, and the ask is what closes the
  citation vocabulary: `sources` carries the direction field by field and the
  analysis section by section, and `checkNovelIdentityBasis` refuses a key the
  ask never offered and a quotation that is not in the passage it names. A
  domain may not import a domain (§3.2), so the corpus travels in the ask
  rather than as `DIRECTION_ELEMENTS` and `ANALYSIS_SECTIONS` — which is also
  the stronger rule, since a model can then only cite what it was shown.
- The check is a **report, never a `Result`, and carries no brand**: nothing
  is rewritten, and an unverifiable basis refuses the answer whole rather than
  clearing a field, because a required basis has no nullable to clear.
- `prompts/missions/define-novel-identity.ts` **V1** — the corpus rendered
  once, as context and as citation vocabulary at the same time; the two
  project settings stated as constraints and explicitly not asked for; the
  mechanical re-read announced with its consequence and its honest way out;
  themes and counter-themes asked for in pairs. The freedom clauses quoted are
  the **bible** stage's, whose stage rule is this mission's requirement in the
  repository's own words.

## What exists (CAL-089)

- **An eighteenth mission**, `define-style` — the bible's style section,
  legislated as operational constraints. Its answer is
  `operationalStyleSchema` in `@calepin/bible`: the nine fields `BibleStyle`
  stores, every element a `StyleConstraint` — the rule stated of the novel's
  prose, paired with the observable breach of it, decidable on one passage
  alone. The pair is the acceptance criterion as a shape: a decorative
  adjective cannot fill the `violation` half.
- Its ask is `bibleStyleInputSchema` — content-addressed as the identity's,
  with the audience in (the register is derived from it, CAL-045) and the
  target word count deliberately out (no style field reads a length). The
  corpus adds `identity` to the source kinds: the style is written against
  the identity the bible opened with. No basis is asked of the answer —
  CAL-088's citation obligation answered traceability, and a style rule under
  an `extend` or `reinterpret` treatment has no verbatim antecedent to quote.
- `prompts/missions/define-style.ts` **V1** — the violation defined as the
  test of the rule (if the breach cannot be written, the rule is an adjective
  and must be rewritten); the register declined from the declared readership,
  never re-decided; the avoid-list asked as concrete patterns, with the
  specification's recurring defects of generated prose quoted as candidates
  kept only where they threaten this text; word targets and list bounds as
  variables (CAL-055).

## What exists (CAL-090)

- **The character-sheet mission filled in** — `create-character-sheet`
  existed as an id, a thin V1 prompt and a registry stub since CAL-051; its
  contract is now `conflictedCharacterSheetSchema` in `@calepin/bible`: the
  fifteen sheet columns `Character` stores plus `relationships`, the
  specification's seventeenth field. The four quality requirements are
  shapes — `deepNeed`, `contradiction` and `speechStyle` are pairs whose
  second half (divergence, dilemma, breach) cannot be filled when the first
  is fake, and each `heldKnowledge` entry types its statement with a stance
  the domain maps onto the canon model's two axes
  (`knowledgeStanceToBelief`), so CAL-094's derivation is a copy.
- Its ask is `characterSheetInputSchema` — content-addressed, with the name
  required-but-nullable (imposed, or proposed by the model), the importance
  the author's, the established cast as the closed vocabulary the answer's
  edges may name, and four source kinds (`style` added: the voice must live
  under the register the bible just legislated). `verifyCharacterSheet`
  reads the answer back: the name refuses whole, a bad edge drops with a
  report, and what survives is branded.
- `prompts/missions/create-character-sheet.ts` **V2** (V1 stays, append-only)
  — each second half defined as the test of the first, three times; the
  _personnage uniquement fonctionnel_ named as the enemy; the cast closed by
  exact names; the stance and relationship-type vocabularies rendered from
  the domain's own glosses; word targets and list bounds as variables
  (CAL-055). Registry retune: `high`, 240 s, alongside the other bible
  sections — the backlog's Fable/xhigh line describes the design session
  (the CAL-089 reading).

- **The relationship graph filled in** — `relate-characters` (CAL-091), the
  bible's fourth section and the one a sheet could not be: a sheet is asked
  of one character, so nothing in its contract has a place for *what the
  other side does not know*. `prompts/missions/relate-characters.ts` V1 asks
  the whole cast at once; `write-scene` **V3** and `check-coherence` **V2**
  read the graph, and the audit's V1 had already been asking for something
  nothing in its context could answer.

- **The world filled in** — `define-world` (CAL-092), the bible's fifth
  section. The contract (`@calepin/bible`) makes the forbidden answer
  unrepresentable rather than detectable: an out-of-norm capability carries
  three non-empty bound lists and there is no `isSupernatural` flag to
  lower, so the prompt spends its words on the one thing a shape cannot
  decide — which array an element belongs in — drawing the boundary by what
  a thing *does* rather than by whether it reads as supernatural, and naming
  plainly why the bounds are asked for.
- `context/` gained `worldBounds`, carried whole and outside the degradation
  ladder. `write-scene` **V4** and `check-coherence` **V3** read it: a power
  quoted without its bounds is an open offer to a scene short of an exit,
  and the audit can now ask of what a character *can do* what it already
  asked of what they know.

## What arrives in its own task

The credentials both adapters take, resolved from the validated config
module by the process shell (CAL-060) · context assemblies for the remaining
missions, in the epics that own them (`check-coherence` in E13,
`extract-facts` in E12), over the same `context/` engine · the screens that
show an estimate and take its confirmation, in the epics that own the
operations (E09, E11, E13); the panel and the gate are here and in
`apps/web/src/components/operation-estimate-panel.tsx`, but no screen can
start a costly operation yet.

## Hard rules

- Provider SDKs are importable only under `src/adapters/` — lint-enforced,
  and `provider-sdk-boundary.test.ts` proves the rule fires.
- This package depends on `@calepin/shared` only. A domain imports types,
  mission identifiers and error types from here — never an adapter; the
  concrete port is injected by `apps/web` or the worker.
