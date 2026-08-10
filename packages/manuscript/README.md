# @calepin/manuscript

Chapter writing and everything around it: generation parameters, streaming, the
rich editor, autosave and overwrite protection, targeted rewrites on a selection
(each its own generation mission), non-destructive regeneration, version
comparison, author comments and chapter validation.

Backlog: E11 — CAL-112 to CAL-125. Versioning: E14 — CAL-146 to CAL-153.

## What exists (CAL-033)

`chapter/revision.ts` — the four write paths that move a manuscript, and
therefore a project's aggregates: appending a generated revision, appending an
edited one, restoring an earlier one, and deleting a chapter. Each takes a
`ProjectScope`, composes `scopedWhere`, and runs inside `withProjectAggregates`
so the counters are rewritten by the same transaction as the rows they count.

## What exists (CAL-055) — the hierarchical summaries

The memory every later chapter is written against. Two levels, both append-only:
a chapter yields a brief summary (~50 words) and a detailed one (~200), and the
part holding it yields a summary of its own, rebuilt from its chapters'.

- `summary/schema.ts` — the two Zod schemas the AI layer validates against, and
  the word targets the prompts render. **One number, not two**: the target the
  instruction states and the bound the schema enforces come from
  `SUMMARY_WORD_TARGETS`, because a length stated twice is a length that will
  disagree with itself. The bounds are in characters (a `too_big` issue is one
  CAL-052's repair pass can phrase; a `.refine` would come back `custom` and the
  targeted re-ask would have nothing to say) and generous — they exist to refuse
  the answer that is *not a summary at all*, not to police a word count. A model
  handed a chapter and asked to compress it can return the chapter, and that
  answer would then be stored as memory and replayed into every later context.
  Every bound sits strictly under `@calepin/ai`'s own `CONTEXT_ITEM_CEILINGS`,
  derived from them rather than restated, so a summary this schema accepts can
  never be one the composer refuses — pinned by `schema.test.ts`.
- `summary/repository.ts` — the reads and writes. `withProjectTransaction`
  rather than `withProjectAggregates`: a summary moves no derived column, so
  taking the project's row lock and rewriting two counters to the values they
  already held would be work with no result. `appendPartSummaryRevision` is the
  first place in a domain package to use `requireOwnedRow` — a `where` protects
  a read, an update and a delete, and the parent id of a new child row is a
  value the caller supplied that nothing constrains.
- `summary/summarize.ts` — the pass CAL-125's validation action will call:
  the chapter's two summaries, then its part's, in that order and never
  concurrently, since the part is built from the summaries the first step just
  changed. The chapter's failure stops the pass; the part's does not undo the
  chapter's — the summaries are stored, they are already usable by the context
  composer, and the part is one rerun away. That is the specification's *"the
  failure of one of these steps must not invalidate the validation"*, and the
  reason this is two appends rather than one transaction.
- **The status gate is here, not in the AI layer.** A summary is settled fact
  for everything written afterwards, so summarising a first draft would publish
  something the author has not accepted. `SUMMARIZABLE_CHAPTER_STATUSES` is
  `VALIDATED` and `LOCKED` — locked included, because a locked chapter is
  validated *and* frozen, and refusing it would make re-deriving a lost summary
  impossible on exactly the chapters most worth keeping.

The port is injected and never imported (§5.3), which is what lets every rule
above run without a network call. Behaviour against real rows is asserted in
`test/integration/chapter-summaries.integration.test.ts`.
