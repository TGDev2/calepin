import { z } from "zod";

/**
 * Every environment variable the application reads, in one place. A domain
 * package must never read `process.env` directly (CLAUDE.md §3.3) — it is
 * either injected or, for apps/web and the future worker, imported from
 * `@calepin/shared/config`.
 *
 * Scoped to what already exists: the local stack `docker-compose.yml`
 * (CAL-005) stands up. AI provider keys, auth secrets and similar belong to
 * the tasks that build those layers (CAL-048, CAL-174, ...).
 */
export const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  /**
   * Level of the process-wide logger (CAL-009). The logger itself never reads
   * this — `apps/web/src/instrumentation.ts` passes it to `configureLogger`
   * at startup, so importing a logger never requires a full environment.
   */
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  DATABASE_URL: z.string().url(),
  /**
   * The key Auth.js signs and encrypts with (CAL-024). Auth.js would read
   * `AUTH_SECRET` from the environment on its own; it is declared here and
   * passed explicitly instead, so a missing key fails at startup with every
   * other missing variable rather than at the first sign-in attempt.
   *
   * Thirty-two characters is the floor `openssl rand -base64 32` clears.
   */
  AUTH_SECRET: z.string().min(32),
  /**
   * The SMTP server the email sign-in link is sent through (CAL-025), and the
   * address it is sent from. Read here rather than left to Auth.js's own
   * `process.env` lookup, for the same reason as `AUTH_SECRET`.
   */
  EMAIL_SERVER_HOST: z.string().min(1),
  EMAIL_SERVER_PORT: z.coerce.number().int().positive(),
  EMAIL_SERVER_USER: z.string().min(1),
  EMAIL_SERVER_PASSWORD: z.string().min(1),
  EMAIL_FROM: z.email(),
  /**
   * The OAuth client Google issues for the app (CAL-026). Read here rather
   * than left to Auth.js's own `process.env` lookup, for the same reason as
   * `AUTH_SECRET`.
   */
  GOOGLE_CLIENT_ID: z.string().min(1),
  GOOGLE_CLIENT_SECRET: z.string().min(1),
  /**
   * The OAuth client GitHub issues for the app (CAL-027). Same reasoning as
   * `GOOGLE_CLIENT_ID`.
   */
  GITHUB_CLIENT_ID: z.string().min(1),
  GITHUB_CLIENT_SECRET: z.string().min(1),
  REDIS_URL: z.string().url(),
  /**
   * How many generation jobs each of the three generation-queue workers runs
   * at once (CAL-065, split per queue by CAL-066's mission-profile split).
   * Optional, with a default, so an existing `.env` is not forced to gain a
   * required line the way a variable with no default would (`tasks/lessons.md`
   * already records that trap). The per-user and per-project caps enforced at
   * the claim (`@calepin/shared/repository`) are the real policy on how many
   * generations may run at once; these are the process-level ceiling above
   * each queue that has to be raised above the historical `1`
   * (`DEFAULT_WORKER_CONCURRENCY`, `@calepin/shared/queue`) for those caps to
   * mean anything at all — with a single worker slot, only one generation
   * could ever run regardless of what either cap allowed.
   *
   * The three defaults follow the same profile `@calepin/ai/mission-registry`
   * already gives each mission: `generation-fast`'s three missions are cheap
   * and short (Sonnet, `low` effort, ≤60s), so more can run in parallel
   * without much cost or rate-limit exposure; `generation-slow`'s seven are
   * expensive and long (Opus, medium-to-high effort, up to 600s), so the
   * ceiling is kept low to bound simultaneous spend; `generation-audit`'s one
   * mission is the single most demanding call of the thirteen (`xhigh` effort)
   * and is isolated with its own modest ceiling so an audit backlog never
   * competes with authoring generations for the same slots.
   */
  GENERATION_FAST_WORKER_CONCURRENCY: z.coerce.number().int().positive().default(12),
  GENERATION_SLOW_WORKER_CONCURRENCY: z.coerce.number().int().positive().default(6),
  GENERATION_AUDIT_WORKER_CONCURRENCY: z.coerce.number().int().positive().default(3),
  /**
   * How long a finished BullMQ job is kept before the cleanup sweep purges it
   * (CAL-069) — the configurable threshold the retention policy is tuned by.
   * `Generation` and `GenerationAttempt` stay in PostgreSQL regardless, since
   * they are the source of history a queue job never was (§9); this only
   * bounds how long the transport envelope itself lingers in Redis. Optional,
   * for the same reason as the concurrency variables above: an existing
   * `.env` should not be forced to gain a required line. The defaults match
   * `DEFAULT_JOB_OPTIONS`'s own split — a completed job is evidence for a
   * day, a failed one for a week, because the failed one is the one someone
   * comes looking for.
   */
  QUEUE_CLEANUP_COMPLETED_JOB_TTL_MS: z.coerce.number().int().positive().default(86_400_000),
  QUEUE_CLEANUP_FAILED_JOB_TTL_MS: z.coerce.number().int().positive().default(604_800_000),
  S3_ENDPOINT: z.string().url(),
  S3_REGION: z.string().min(1),
  S3_BUCKET: z.string().min(1),
  S3_ACCESS_KEY_ID: z.string().min(1),
  S3_SECRET_ACCESS_KEY: z.string().min(1),
});

export type Env = z.infer<typeof envSchema>;
