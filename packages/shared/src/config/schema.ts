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
  REDIS_URL: z.string().url(),
  S3_ENDPOINT: z.string().url(),
  S3_REGION: z.string().min(1),
  S3_BUCKET: z.string().min(1),
  S3_ACCESS_KEY_ID: z.string().min(1),
  S3_SECRET_ACCESS_KEY: z.string().min(1),
});

export type Env = z.infer<typeof envSchema>;
