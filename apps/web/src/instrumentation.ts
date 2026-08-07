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
import type { Instrumentation } from "next";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { env } = await import("@calepin/shared/config");
    const { configureLogger, logger } = await import("@calepin/shared/logging");

    configureLogger({ level: env.LOG_LEVEL });
    logger.info("app.started");
  }
}

/**
 * Every unhandled error on the server passes here: page renders, route
 * handlers, server actions and proxy failures. It is what makes CLAUDE.md §7's
 * *"the full technical trace stays in the log, correlated by request id"* true
 * for errors nobody caught — the ones that most need it.
 *
 * Guarded on the runtime and imported dynamically for the same reason
 * `register()` is: Next calls this hook on the Edge runtime for a
 * `routeType: "proxy"` failure, and neither pino nor `node:async_hooks` exists
 * there. CAL-174 adds error tracking alongside this call, not instead of it.
 */
export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  if (process.env.NEXT_RUNTIME !== "nodejs") {
    return;
  }

  const { reportRequestError } = await import("./lib/report-request-error");

  reportRequestError(error, request, context);
};
