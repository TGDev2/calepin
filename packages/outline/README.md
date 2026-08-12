# @calepin/outline

The plan: parts (dramatic objective, initial state, tipping point, final state)
and chapter outlines (sixteen attributes each), chapter-count calibration,
reordering, merging and splitting with stable ordering, narrative threads,
repercussion analysis and the dramatic-function audit.

Backlog: E10 — CAL-101 to CAL-111. Schemas: CAL-019, CAL-020.

## What is here today

`order/` — the ordering the plan rests on (CAL-019).

- `orderKeyBetween`, `orderKeysBetween` — a fractional index between two keys,
  so inserting a chapter writes one row instead of renumbering the rest.
- `orderKeyAt`, `moveOrderKey` — the same, addressed by position: insert at 3,
  drag 7 to 2. `moveOrderKey`'s `to` is the position the row ends up at.
- `resolveOutline` — the plan in reading order, with the chapter number derived
  from the keys. Nothing stores that number.
- `isOrderKey`, `compareOrderKeys`, `ORDER_KEY_ALPHABET` — the key's shape and
  its order, the same ones `parts_order_key_check` and `chapters_order_key_check`
  hold in the database.

`thread/` — which narrative threads are still open (CAL-020).

- `isThreadOpen`, `listOpenThreads` — "still open" is every status but
  `CLOSED`, not `OPEN` alone: a thread being carried by a continuation has not
  been paid off either. Structural, database-free, the same reasoning
  `order/types.ts` states in full: the repository layer that will read a
  `Thread` row does not exist yet (CAL-023), so this package reasons about the
  status alone rather than a Prisma type. The actual query —
  `prisma/queries/open-threads.ts` — expresses the same "not `CLOSED`"
  condition as a `where` clause, for whichever caller runs it today.

`target-length/` — the target novel length interpreted into a chapter count
and a per-chapter target (CAL-043). `prisma/schema.prisma` stores the choice
(`SHORT`/`STANDARD`/`LONG`/`CUSTOM`); this is where the word ranges behind it
and the chapter-count derivation live.

- `TARGET_LENGTH_RANGES`, `CUSTOM_TARGET_WORD_COUNT_RANGE` — the three preset
  word ranges and the bounds a custom choice must fall inside.
- `resolveNovelTargetWordCount`, `estimateChapterCalibration` — a choice
  resolved to one number (a preset's midpoint, or the custom value), then to
  a chapter count and a per-chapter target derived from it. Pure, no database.
- `partCalibrationForWordCount`, `estimatePartCalibration`, `PART_COUNT_RANGE`
  — the same interpretation one level up (CAL-101): the admissible part-count
  range for a target, ±1 around round(target ÷ 18 000), clamped to 2–12. One
  function serves the schema's envelope, the prompt's variables and
  `checkPartStructure`'s gate, so the ask and the refusal cannot disagree.
- `chapterCalibrationForPartWordCount`, `PART_CHAPTER_COUNT_RANGE`,
  `CHAPTER_TARGET_WORD_COUNT_RANGE` — the same arithmetic one level down
  (CAL-102): the admissible chapter-count range for one part's word target,
  ±1 around round(part ÷ 3 000), clamped to 2–20, plus the envelope one
  chapter's declared target stays inside. The same three readers.
- `getPlanGenerationContext` — `@calepin/shared`'s `GenerationContext`
  (CAL-042), extended with both calibrations. Built ahead of its producer, the
  same way `getGenerationContextForProject` is: no executor calls this yet
  (§13).

`parts/` — the `split-into-parts` mission's contract (CAL-101).

- `partStructureSchema` — the answer: the declared threads (`Thread`'s own
  columns, ahead of the row — `Thread.openingChapterId` is NOT NULL and no
  chapter exists yet) and the parts, fields spelled as the `Part` columns,
  each part citing its threads by index into the answer's own list (§6). The
  basculement is the pair `{ event, irreversibility }` — unfillable when the
  event changes nothing — and the irreversibility is what separates the final
  state from the initial one.
- `partStructureInputSchema` — the ask `Generation.input` stores: the
  direction and identity corpus, the cast's arcs, the planned events, the
  resolved target word count the gate re-derives its range from.
- `checkPartStructure` — pure, index-keyed, row-capable: seven defect kinds
  refuse whole (count out of calibrated range, duplicate titles/labels,
  unresolvable or duplicate references, orphan threads, echoed states); two
  advisories report and never refuse (`similar-stakes`, `single-part-thread`).
- `verifyPartStructure`, `resolvePartStructure` — the brand and the flattening
  (`PART_TIPPING_POINT_CONNECTOR`, indexes resolved to labels). No
  persistence: `Part` rows and order keys belong to the executor task.

`stake/` — the stake-overlap comparison both contracts share (CAL-101,
extracted by CAL-102 when the chapter batch gave it a second reader).

- `STAKE_OVERLAP_RATIO`, `STAKE_STOP_WORDS`, `contentWordsOf`, `stakeOverlap`
  — content words compared over the larger set, accents significant, elisions
  split. A lexical approximation: every consumer reports it as an advisory,
  never a refusal.

`chapters/` — the `build-chapter-outline` mission's contract (CAL-102).

- `chapterOutlineBatchSchema` — the answer: **one part's chapter plans, in
  reading order** (the batch the backlog demands; order is the answer, the
  numéro derived, CAL-019). Each chapter carries the `ChapterOutline` columns'
  own spellings — `dramaticFunction` and `consequence` required where the
  columns are nullable, the MVP bar as shape — a day-resolved period over the
  pinned `TimelinePrecision` mirror, a required-but-nullable revelation whose
  preparing chapter is named by number (check-only; resolve stores no
  position), three thread-action index lists (disjoint, so opened-and-closed-
  in-one-chapter is unrepresentable) and fact indexes into the ask.
- `chapterOutlineBatchInputSchema` — the ask `Generation.input` stores: the
  part's resolved frame, each thread with its state and its **assignment
  plan** (`assignedPartIndexes` — the duties are derived: assigned when
  listed, to close when last listed), the cast, the places, the facts with
  caller-supplied ids (§6), the preceding parts' chapter digests. An ask
  assigning a closed thread is refused at composition.
- `checkChapterOutlineBatch` — pure, index-keyed, row-capable: twenty-one
  defect kinds refuse whole (count gate, references, the thread choreography
  walked under the assignment plan — a thread closes at its last assigned
  part, neither before nor after, and the final part closes everything — the
  preparation references, the target envelope, the ±10 % word budget); three
  advisories report and never refuse (`similar-stakes`,
  `similar-preceding-stake`, `threadless-chapter`).
- `verifyChapterOutlineBatch`, `resolveChapterOutlineBatch` — the brand and
  the flattening (`CHAPTER_REVELATION_CONNECTOR`, names written back in the
  ask's spelling, indexes resolved to labels and fact ids). No persistence:
  `Chapter`/`ChapterOutline`/`Thread` rows and order keys belong to the
  executor task.

**Two entry points, and the split is load-bearing.** `@calepin/outline` is the
whole surface; `@calepin/outline/calibration` is the pure half — the ranges,
the chapter maths and their types, with no database read anywhere in its module
graph. A browser bundle must import the second: the root barrel re-exports
`getPlanGenerationContext`, which reaches `@calepin/shared/repository` and
through it `node:async_hooks`, and Turbopack answers a server-only module in a
client chunk by refusing to build the page rather than shaking the unused
branch out. `apps/web`'s creation wizard is the caller this exists for.
