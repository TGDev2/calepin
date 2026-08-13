/**
 * CAL-027's acceptance criterion, against the real thing: **a user already
 * registered by email signs in with GitHub without creating a duplicate.**
 *
 * Structural mirror of `auth-google-signin.integration.test.ts` — same
 * reasoning applies here: a real OAuth code exchange with GitHub is
 * forbidden (CLAUDE.md §8), so this drives `resolveOAuthAccountLink`
 * directly against `createAuthAdapter()` and a real PostgreSQL. The
 * account/profile shape passed in is exactly what
 * `apps/web/src/lib/auth.ts`'s `signIn` callback would hand this function
 * once GitHub's real token and userinfo exchange (including
 * `github-provider.ts`'s own `/user/emails` lookup) has already happened.
 */

import { randomUUID } from "node:crypto";

import { createAuthAdapter, resolveOAuthAccountLink } from "@calepin/shared/auth";
import { configureDatabaseClient, resetDatabaseClient } from "@calepin/shared/database";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

process.env.AUTH_SECRET = "integration-secret-of-at-least-32-characters";
process.env.EMAIL_SERVER_HOST ??= "localhost";
process.env.EMAIL_SERVER_PORT ??= "1025";
process.env.EMAIL_SERVER_USER ??= "calepin";
process.env.EMAIL_SERVER_PASSWORD ??= "calepin_local";
process.env.EMAIL_FROM ??= "connexion@calepin.test";
process.env.GOOGLE_CLIENT_ID ??= "integration-google-client-id";
process.env.GOOGLE_CLIENT_SECRET ??= "integration-google-client-secret";
process.env.GITHUB_CLIENT_ID ??= "integration-github-client-id";
process.env.GITHUB_CLIENT_SECRET ??= "integration-github-client-secret";
process.env.ANTHROPIC_API_KEY ??= "integration-anthropic-api-key";
process.env.REDIS_URL ??= "redis://localhost:6379";
process.env.S3_ENDPOINT ??= "http://localhost:9000";
process.env.S3_REGION ??= "us-east-1";
process.env.S3_BUCKET ??= "calepin";
process.env.S3_ACCESS_KEY_ID ??= "calepin";
process.env.S3_SECRET_ACCESS_KEY ??= "calepin_local";

const prisma = new PrismaClient();

configureDatabaseClient(prisma);

/**
 * Derived from `resolveOAuthAccountLink` itself rather than imported from
 * `@auth/core/types` directly — this file is not inside a package that
 * declares that dependency, and a type-only import would still need it
 * resolvable.
 */
type OAuthAccount = Parameters<typeof resolveOAuthAccountLink>[1];

function uniqueAddress(): string {
  return `github-link-${randomUUID()}@example.test`;
}

/** What `apps/web/src/lib/auth.ts`'s `signIn` callback receives from GitHub. */
function githubAccount(): OAuthAccount {
  return {
    provider: "github",
    providerAccountId: randomUUID(),
    type: "oauth",
    access_token: "access-token",
    refresh_token: "refresh-token",
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    token_type: "bearer",
    scope: "read:user user:email",
  };
}

beforeAll(async () => {
  await prisma.$connect();
});

afterAll(async () => {
  await prisma.$disconnect();
  resetDatabaseClient();
});

beforeEach(async () => {
  await prisma.account.deleteMany({ where: { provider: "github" } });
  await prisma.user.deleteMany({ where: { email: { startsWith: "github-link-" } } });
});

describe("GitHub sign-in account linking (CAL-027)", () => {
  it("attaches the GitHub identity to the existing account, without a duplicate user", async () => {
    const email = uniqueAddress();
    const existingUser = await prisma.user.create({
      data: { email, name: "Autrice", emailVerified: new Date() },
    });
    const account = githubAccount();

    await resolveOAuthAccountLink(createAuthAdapter(), account, { email, emailVerified: true });

    expect(await prisma.user.count({ where: { email } })).toBe(1);
    const linked = await prisma.account.findUniqueOrThrow({
      where: { provider_providerAccountId: { provider: "github", providerAccountId: account.providerAccountId } },
    });
    expect(linked.userId).toBe(existingUser.id);
  });

  it("does not link when the existing account's email was never verified", async () => {
    const email = uniqueAddress();
    await prisma.user.create({ data: { email, name: "Autrice", emailVerified: null } });
    const account = githubAccount();

    await resolveOAuthAccountLink(createAuthAdapter(), account, { email, emailVerified: true });

    expect(await prisma.account.count({ where: { provider: "github" } })).toBe(0);
  });

  it("does not link when GitHub reports the incoming email as unverified", async () => {
    const email = uniqueAddress();
    await prisma.user.create({ data: { email, name: "Autrice", emailVerified: new Date() } });
    const account = githubAccount();

    await resolveOAuthAccountLink(createAuthAdapter(), account, { email, emailVerified: false });

    expect(await prisma.account.count({ where: { provider: "github" } })).toBe(0);
  });

  it("does nothing when no existing account matches the email", async () => {
    const email = uniqueAddress();
    const account = githubAccount();

    await resolveOAuthAccountLink(createAuthAdapter(), account, { email, emailVerified: true });

    expect(await prisma.user.count({ where: { email } })).toBe(0);
    expect(await prisma.account.count({ where: { provider: "github" } })).toBe(0);
  });
});
