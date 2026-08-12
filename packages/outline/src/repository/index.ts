/**
 * `@calepin/outline/repository` — everything of this domain that opens a
 * transaction.
 *
 * A second entry point, deliberately, and the root barrel stays pure. Packages
 * are consumed as source (§3.4), so an import from `@calepin/outline` pulls the
 * whole import graph behind it into whichever chunk asked — and `outline-tree`
 * is a **client** component that imports this package for a label. Putting a
 * database write on the root barrel therefore drags `@calepin/shared/audit` and
 * `node:async_hooks` into a browser bundle, and `pnpm build` fails inside
 * Turbopack naming a page that has nothing to do with the change
 * (`tasks/lessons.md`, CAL-099). `@calepin/bible/repository` is the same
 * layout, one epic earlier.
 */

export { type ChaptersMerged, mergeChapters } from "./chapter-merge";
export { type ChapterMoved, moveChapter } from "./chapter-move";
export { type ChapterSplit, splitChapter } from "./chapter-split";
