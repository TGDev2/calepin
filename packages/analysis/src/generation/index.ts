/**
 * `@calepin/analysis/generation` — the analysis stage's executors (CAL-208).
 *
 * A second entry point rather than part of the root barrel, and the split is
 * load-bearing rather than tidy: everything here reaches
 * `@calepin/shared/repository` and `@calepin/shared/queue`, whose import graphs
 * end in `node:async_hooks`, while `@calepin/analysis` itself is imported by a
 * `"use client"` component. A barrel is a browser dependency the moment a
 * client component names it, so the impure half gets its own door — the layout
 * `@calepin/shared`, `@calepin/bible` and `@calepin/outline` already use.
 */

export { createAnalyzeSourceTextExecutor } from "./executor";
export {
  analyzeSourceTextAsk,
  type AnalyzeSourceTextInput,
  analyzeSourceTextInputSchema,
} from "./input";
