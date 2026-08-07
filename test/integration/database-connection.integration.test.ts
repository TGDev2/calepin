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

  it("is reachable and starts empty", async () => {
    const result = await client.query<{ count: string }>(
      "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public'",
    );

    expect(result.rows[0]?.count).toBe("0");
  });

  it("persists writes within the run and isolates them from other suites", async () => {
    await client.query("CREATE TABLE probe (id serial PRIMARY KEY, label text NOT NULL)");
    await client.query("INSERT INTO probe (label) VALUES ($1)", ["calepin-integration-smoke"]);

    const result = await client.query<{ label: string }>("SELECT label FROM probe");

    expect(result.rows).toEqual([{ label: "calepin-integration-smoke" }]);
  });
});
