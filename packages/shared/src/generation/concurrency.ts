/**
 * How many generations may run at once, per project and per user (CAL-065).
 *
 * The backlog asks for this "using BullMQ limiters"; BullMQ OSS has no such
 * primitive — its `limiter` option and `Worker.rateLimit()` both throttle a
 * whole queue, never a subset of jobs grouped by user or project, which is a
 * BullMQ Pro feature this repository does not have. The cap is enforced
 * instead where every other admission decision in this lifecycle already is:
 * `claimGenerationAttempt`, under the row's own lock (`../repository`).
 *
 * Two limits, and the shape is `Generation.attemptCeiling`'s (CAL-063): a
 * nullable override on the row it concerns — `User.generationConcurrencyLimit`,
 * `Project.generationConcurrencyLimit` — with null meaning "use the default
 * below." A project is bound by the tighter of its own limit and its owner's,
 * so one author cannot bypass their own cap by spreading generations across
 * projects.
 */

/** The default ceiling on one project's own running generations. */
export const DEFAULT_PROJECT_GENERATION_CONCURRENCY_LIMIT = 3;

/** The default ceiling on one user's running generations, across every project. */
export const DEFAULT_USER_GENERATION_CONCURRENCY_LIMIT = 5;

/**
 * How soon a generation refused for being over capacity is offered to the
 * reconciliation sweep again.
 *
 * A capacity refusal writes no failure and opens no attempt — nothing else
 * schedules it a deadline — so without one the row would wait out the sweep's
 * full staleness window (`GENERATION_STALE_AFTER_MS`, two minutes) before
 * being reconsidered. `@calepin/shared/generation` may not import
 * `@calepin/shared/queue` (§3.2 — the dependency runs the other way), so this
 * is its own short number rather than a fraction of one it cannot see. It
 * only has to be shorter than that staleness window to matter: the sweep
 * itself still runs once a minute, whatever this says.
 */
export const CAPACITY_RETRY_DELAY_MS = 15_000;
