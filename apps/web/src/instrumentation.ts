/**
 * Runs once when the Next.js server process boots (`next dev` / `next start`,
 * not `next build`). Importing the config module here is what makes an
 * invalid or missing environment variable fail the startup, instead of only
 * surfacing once something happens to read it later.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("@calepin/shared/config");
  }
}
