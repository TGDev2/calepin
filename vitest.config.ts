import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          environment: "node",
          include: ["packages/**/*.test.ts", "apps/web/**/*.test.ts"],
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
