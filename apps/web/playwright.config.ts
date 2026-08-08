import { defineConfig } from "@playwright/test";
import { config as loadEnvFile } from "dotenv";

/**
 * Next loads `.env` for the server it starts; this process is not that server.
 * The session fixture of CAL-024 writes to the same database the app reads, so
 * it needs the same `DATABASE_URL` — loaded here rather than in the fixture, so
 * a spec that never touches the database pays nothing for it.
 *
 * No path: dotenv reads `.env` from the working directory, and `pnpm test:e2e`
 * runs Playwright from `apps/web`. In CI there is no file to read and the
 * variables come from the job's environment, which dotenv leaves alone.
 */
loadEnvFile({ quiet: true });

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: "list",
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
  },
  webServer: {
    command: "pnpm dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
