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
- `getPlanGenerationContext` — `@calepin/shared`'s `GenerationContext`
  (CAL-042), extended with the calibration. Built ahead of its producer, the
  same way `getGenerationContextForProject` is: no mission calls this yet
  (CAL-048, CAL-060 still to come).
