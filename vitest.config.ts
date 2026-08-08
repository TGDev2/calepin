import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          environment: "node",
          // `.tsx` is matched too: the React error boundaries are tested by
          // rendering them to static markup (CAL-010), and a pattern that
          // missed those files would report success while running nothing.
          // `prisma/**` is included for the schema conformance suite: it reads
          // schema.prisma as a file, so it needs neither a database nor a
          // generated client and belongs in the fast project.
          include: [
            "packages/**/*.test.{ts,tsx}",
            "apps/web/**/*.test.{ts,tsx}",
            "prisma/**/*.test.ts",
          ],
          exclude: ["**/node_modules/**", "**/.next/**", "**/*.integration.test.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "integration",
          environment: "node",
          include: ["test/integration/**/*.integration.test.ts"],
          exclude: ["**/node_modules/**"],
          globalSetup: ["./test/integration/global-setup.ts"],
          testTimeout: 30_000,
          hookTimeout: 60_000,
          fileParallelism: false,
        },
      },
    ],
  },
});
