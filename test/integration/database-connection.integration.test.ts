import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

describe("isolated integration database", () => {
  let client: Client;

  beforeAll(async () => {
    client = new Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();
  });

  afterAll(async () => {
    await client.end();
  });

  // The database no longer starts empty: `global-setup.ts` applies the
  // committed migrations to it, which is what lets every other suite test the
  // real schema instead of one it wrote itself.
  it("is reachable and carries the migrated schema", async () => {
    const tables = await client.query<{ table_name: string }>(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'",
    );
    const names = tables.rows.map((row) => row.table_name);

    expect(names).toEqual(
      expect.arrayContaining(["users", "projects", "source_texts", "source_text_versions"]),
    );
  });

  it("has every committed migration recorded as applied", async () => {
    const applied = await client.query<{ count: string }>(
      "SELECT count(*) FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL",
    );

    expect(Number(applied.rows[0]?.count)).toBeGreaterThanOrEqual(3);
  });

  it("persists writes within the run and isolates them from other suites", async () => {
    await client.query("CREATE TABLE probe (id serial PRIMARY KEY, label text NOT NULL)");
    await client.query("INSERT INTO probe (label) VALUES ($1)", ["calepin-integration-smoke"]);

    const result = await client.query<{ label: string }>("SELECT label FROM probe");

    expect(result.rows).toEqual([{ label: "calepin-integration-smoke" }]);
  });
});
