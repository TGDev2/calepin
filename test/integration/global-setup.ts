import { execFileSync } from "node:child_process";

import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { RedisContainer, type StartedRedisContainer } from "@testcontainers/redis";

let postgres: StartedPostgreSqlContainer | undefined;
let redis: StartedRedisContainer | undefined;

export async function setup() {
  // Started together: neither depends on the other, and the Redis image is
  // small enough that serialising them would only add to a cold run.
  [postgres, redis] = await Promise.all([
    new PostgreSqlContainer("postgres:16-alpine").start(),
    new RedisContainer("redis:7-alpine").start(),
  ]);

  const connectionUri = postgres.getConnectionUri();
  process.env.DATABASE_URL = connectionUri;

  // The queue gets its own ephemeral instance for the same reason the database
  // does: a suite that drained a shared Redis would take the developer's local
  // queue with it, and one that left keys behind would be read by the next run.
  // It also means `pnpm test:integration` needs no `pnpm dev:services`.
  process.env.REDIS_URL = redis.getConnectionUrl();

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
  await Promise.all([postgres?.stop(), redis?.stop()]);
}
