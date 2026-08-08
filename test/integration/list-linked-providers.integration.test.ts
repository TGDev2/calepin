/**
 * `listLinkedProviders` (CAL-029), against a real PostgreSQL: **the account
 * page shows exactly the OAuth providers a user has actually linked, and
 * nothing belonging to anyone else.**
 *
 * Same shape as `owner-access.integration.test.ts`: `configureDatabaseClient`
 * over a real `PrismaClient`, no HTTP layer, no Auth.js env bootstrap — this
 * function reaches only `@calepin/shared/database`, never
 * `@calepin/shared/config`.
 */

import { randomUUID } from "node:crypto";

import { listLinkedProviders } from "@calepin/shared/auth";
import { configureDatabaseClient, resetDatabaseClient } from "@calepin/shared/database";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const prisma = new PrismaClient();

configureDatabaseClient(prisma);

beforeAll(async () => {
  await prisma.$connect();
});

afterAll(async () => {
  await prisma.$disconnect();
  resetDatabaseClient();
});

async function createUser(): Promise<string> {
  const user = await prisma.user.create({
    data: { email: `linked-providers-${randomUUID()}@example.test` },
  });

  return user.id;
}

async function linkAccount(userId: string, provider: string): Promise<void> {
  await prisma.account.create({
    data: { userId, provider, providerAccountId: randomUUID(), type: "oauth" },
  });
}

describe("listLinkedProviders (CAL-029)", () => {
  it("answers nothing for an email-only account", async () => {
    const userId = await createUser();

    await expect(listLinkedProviders(userId)).resolves.toEqual([]);
  });

  it("names a single linked provider", async () => {
    const userId = await createUser();
    await linkAccount(userId, "google");

    await expect(listLinkedProviders(userId)).resolves.toEqual(["google"]);
  });

  it("names every linked provider, once each", async () => {
    const userId = await createUser();
    await linkAccount(userId, "google");
    await linkAccount(userId, "github");

    const providers = await listLinkedProviders(userId);

    expect(providers.sort()).toEqual(["github", "google"]);
  });

  it("never shows another user's linked provider", async () => {
    const owner = await createUser();
    const other = await createUser();
    await linkAccount(other, "google");

    await expect(listLinkedProviders(owner)).resolves.toEqual([]);
  });
});
