import { execFileSync } from "node:child_process";

import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";

let container: StartedPostgreSqlContainer | undefined;

export async function setup() {
  container = await new PostgreSqlContainer("postgres:16-alpine").start();
  const connectionUri = container.getConnectionUri();
  process.env.DATABASE_URL = connectionUri;

  // Apply the committed migrations rather than letting each suite build the
  // schema it expects. A hand-written CREATE TABLE in a test file drifts from
  // the migration silently: the suite keeps passing against a schema that no
  // longer exists, which is the failure mode `migrate deploy` removes here.
  execFileSync("pnpm", ["exec", "prisma", "migrate", "deploy"], {
    env: { ...process.env, DATABASE_URL: connectionUri },
    stdio: "inherit",
    shell: process.platform === "win32",
  });
}

export async function teardown() {
  await container?.stop();
}
