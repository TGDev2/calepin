/**
 * `@calepin/outline/repository` — the plan's own server-side half (CAL-105).
 *
 * A second entry point, for the reason `@calepin/bible/repository` records one
 * epic earlier. `packages/*` are consumed as source (§3.4), so importing from a
 * package's barrel drags that barrel's whole import graph into whichever chunk
 * asked for it — and `outline-tree.tsx`, the plan screen's tree, is a client
 * component that imports `@calepin/outline`. Re-exporting anything that opens a
 * transaction from the root barrel would therefore pull `@calepin/shared/audit`
 * and `node:async_hooks` behind it into a browser bundle, and the build would
 * fail inside Turbopack naming the *page* rather than this file. `pnpm
 * typecheck` cannot see it; only `pnpm build` can.
 *
 * So the root barrel stays pure — schemas, checks, resolvers, the ordering
 * arithmetic — and everything that reaches the database lives here.
 */

export { type ChapterMoved, moveChapter } from "./chapter-move";
