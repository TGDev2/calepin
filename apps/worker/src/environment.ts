/**
 * Loading the worker's environment, before anything reads it (CAL-060).
 *
 * `apps/web` gets this for free — Next reads `apps/web/.env` itself. A plain
 * Node process does not, so the worker loads its own file here, and this module
 * has to be evaluated before `@calepin/shared/config`, which validates
 * `process.env` the moment it is imported.
 *
 * **That ordering is why every later import is dynamic.** A static
 * `import { env } from "@calepin/shared/config"` would be hoisted and evaluated
 * with the file not yet read, and `simple-import-sort` would happily reorder a
 * side-effect import to make it worse. `apps/web/src/instrumentation.ts` solves
 * the same problem the same way.
 *
 * A missing `.env` is not an error: in production the variables come from the
 * process manager, and dotenv leaves them alone.
 */

import { fileURLToPath } from "node:url";

import type { Env } from "@calepin/shared/config";
import { config } from "dotenv";

config({
  path: fileURLToPath(new URL("../.env", import.meta.url)),
  // dotenv 17 advertises a hosted product on stdout otherwise, which would be
  // the first line of every worker's log.
  quiet: true,
});

/**
 * The validated environment. Dynamic on purpose — see above — and awaited once
 * by each entry point before anything else is imported.
 */
export async function loadEnv(): Promise<Env> {
  const { env } = await import("@calepin/shared/config");

  return env;
}
