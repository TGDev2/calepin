/**
 * The end-to-end fixture that puts a signed-in browser in front of the app
 * (CAL-024).
 *
 * **Why it lives at the repository root rather than in `apps/web/tests/`.**
 * §3.5 forbids anything under `apps/web` from naming the database, and the rule
 * is a lint glob over the whole app, tests included. Seeding a session is not
 * an entry point and never ships, but bending the glob to say so would reopen
 * the boundary for everything else beneath it. This directory is where CAL-004
 * already put test wiring that no domain owns, so it is where the fixture goes.
 *
 * It writes the session directly, for the reason the integration suite does:
 * no provider exists until CAL-025, so there is no sign-in form to drive.
 * `createSession` is the call a provider callback makes once it has verified an
 * identity, and the row it writes is the one a browser's cookie points at.
 *
 * **The `package.json` beside this file says `"type": "commonjs"`, and it has
 * to.** Playwright compiles specs to the module format of the config's own
 * package (`apps/web`, which is CommonJS), while the repository root declares
 * `"type": "module"` — so without it Node loads this file's CommonJS output as
 * an ES module and fails on `exports is not defined`. Four lines of manifest
 * rather than a hole in the boundary above.
 *
 * `DATABASE_URL` is loaded by `apps/web/playwright.config.ts`, which is the
 * process that starts everything here; Prisma reads it from the environment.
 */

import { randomUUID } from "node:crypto";

import { PrismaClient } from "@prisma/client";

/** The name Auth.js gives its session cookie over plain HTTP. */
export const SESSION_COOKIE = "authjs.session-token";

export interface SignedInSession {
  readonly userId: string;
  readonly email: string;
  readonly sessionToken: string;
}

/**
 * Creates an account and a live session for it, and returns what the browser
 * needs to present. The address is unique per call so parallel specs never
 * collide on `User.email`.
 */
export async function openSignedInSession(): Promise<SignedInSession> {
  const prisma = new PrismaClient();

  try {
    const email = `e2e-${randomUUID()}@example.test`;
    const user = await prisma.user.create({ data: { email, name: "Autrice de test" } });
    const sessionToken = randomUUID();

    await prisma.session.create({
      data: {
        sessionToken,
        userId: user.id,
        expires: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });

    return { userId: user.id, email, sessionToken };
  } finally {
    await prisma.$disconnect();
  }
}

/**
 * Removes the account the fixture created, and its session with it.
 *
 * `deleteMany`, not `delete`: since CAL-031 a spec can legitimately have
 * deleted the account already, and a `finally` block that threw `P2025` would
 * fail the test that just proved the feature works.
 */
export async function closeSignedInSession(session: SignedInSession): Promise<void> {
  const prisma = new PrismaClient();

  try {
    await prisma.user.deleteMany({ where: { id: session.userId } });
  } finally {
    await prisma.$disconnect();
  }
}

/**
 * Links an OAuth provider to a fixture user (CAL-029), the way
 * `resolveOAuthAccountLink` (CAL-026/027) would after a real sign-in. Only
 * the fields the account page reads matter here — `provider` — so the rest
 * is filled with the minimum the schema requires.
 */
export async function linkAccount(userId: string, provider: string): Promise<void> {
  const prisma = new PrismaClient();

  try {
    await prisma.account.create({
      data: { userId, provider, providerAccountId: randomUUID(), type: "oauth" },
    });
  } finally {
    await prisma.$disconnect();
  }
}

/** Whether a session row is still live — CAL-029's proof that sign-out invalidates it. */
export async function sessionExists(sessionToken: string): Promise<boolean> {
  const prisma = new PrismaClient();

  try {
    const session = await prisma.session.findUnique({ where: { sessionToken } });
    return session !== null;
  } finally {
    await prisma.$disconnect();
  }
}

/**
 * Whether the account row is still there — CAL-031's proof, in the database
 * rather than in the browser.
 *
 * The screen saying "votre compte a été supprimé" is what the visitor sees;
 * this is what says it is true. A deletion asserted only through the interface
 * would pass just as happily against a sign-out.
 */
export async function userExists(userId: string): Promise<boolean> {
  const prisma = new PrismaClient();

  try {
    return (await prisma.user.count({ where: { id: userId } })) > 0;
  } finally {
    await prisma.$disconnect();
  }
}
