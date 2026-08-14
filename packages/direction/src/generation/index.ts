/**
 * `@calepin/direction/generation` — running the direction missions (CAL-210).
 *
 * **A second entry point, never the root barrel.** Everything here reaches
 * `@calepin/shared/repository` and `@calepin/shared/queue`, whose graphs end in
 * `node:async_hooks`, while `@calepin/direction` itself is imported by
 * `"use client"` components — the comparison grid reads the engine copy and the
 * discard-reason ceiling from it. Putting the executor on the root barrel would
 * fail `pnpm build` inside Turbopack, naming a page rather than this file.
 * `@calepin/bible`, `@calepin/outline` and `@calepin/analysis` each learned this
 * the expensive way; the layout is the one that came out of it.
 */

export { createProposeDirectionsExecutor } from "./executor";
export {
  proposeDirectionsAsk,
  type ProposeDirectionsInput,
  proposeDirectionsInputSchema,
} from "./input";
export {
  acceptDirectionCandidates,
  DIRECTION_REJECTION_REASONS,
  type DirectionAcceptance,
  type DirectionAcceptanceReport,
  type DirectionAskPlan,
  type DirectionRejectionReason,
  MAX_DIRECTION_PROPOSAL_ASKS,
  nextDirectionAsk,
  type RejectedDirection,
} from "./relaunch";
