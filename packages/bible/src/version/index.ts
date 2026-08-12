/**
 * The bible savepoint's pure half (CAL-100) — the root barrel's own bar.
 *
 * `./reference.ts` touches the database and is deliberately absent here; it is
 * exported from `@calepin/bible/repository` instead, `./coherence`'s own
 * arrangement one section over (CLAUDE.md §12 — a repository module reachable
 * from a domain's root barrel drags `node:async_hooks` into a browser bundle).
 */

export {
  type BibleVersionContent,
  buildBibleVersionContent,
  type ReferenceBibleCharacter,
  type ReferenceBibleIdentity,
  type ReferenceBiblePlace,
  type ReferenceBibleRelationship,
  type ReferenceBibleStyle,
  type ReferenceBibleTimelineEvent,
  type ReferenceBibleWorld,
  type ReferenceBibleWorldRule,
  type ReferenceCanonFact,
} from "./content";
