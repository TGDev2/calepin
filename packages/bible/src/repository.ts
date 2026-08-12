/**
 * `@calepin/bible/repository` — the bible's own server-side half (CAL-099).
 *
 * A second entry point, and it exists for a reason a type system never
 * mentions. `packages/*` are consumed as source (§3.4), so importing anything
 * from a package's barrel pulls that barrel's whole import graph into whatever
 * chunk asked for it. Three client components already import `@calepin/bible`
 * for a ceiling or a label; re-exporting a repository module from the root
 * barrel therefore dragged `@calepin/shared/audit` — and `node:async_hooks`
 * behind it — into a browser bundle, and the build failed inside Turbopack with
 * a message naming the bible *page* rather than anything to do with this file.
 *
 * So the root barrel stays pure — schemas, checks, resolvers, copy, nothing
 * that touches a database — and everything that opens a transaction lives here.
 * That is `@calepin/shared`'s own layout, one package over, for the same
 * reason: `./repository` is a subpath there too, and `apps/web` may not import
 * it from a component.
 */

export {
  BIBLE_COHERENCE_CHECK_IDS,
  type BibleCoherenceReport,
  readBibleCoherenceIssues,
  runBibleCoherenceCheck,
  runBibleCoherenceCheckWithin,
} from "./coherence/repository";
export { type BibleValidated, validateBible } from "./coherence/validate";
export { getReferenceBible, type ReferenceBible } from "./version/reference";
