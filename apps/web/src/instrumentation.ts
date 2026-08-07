/**
 * Runs once when the Next.js server process boots (`next dev` / `next start`,
 * not `next build`). Importing the config module here is what makes an
 * invalid or missing environment variable fail the startup, instead of only
 * surfacing once something happens to read it later.
 *
 * It is also the composition root for the logger: `createLogger` is pure and
 * reads no environment, so the level has to be handed to it by the process
 * shell. `apps/worker` will do exactly the same thing (CAL-060).
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { env } = await import("@calepin/shared/config");
    const { configureLogger, logger } = await import("@calepin/shared/logging");

    configureLogger({ level: env.LOG_LEVEL });
    logger.info("app.started");
  }
}
