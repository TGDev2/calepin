/**
 * CAL-024's acceptance criterion, against the real thing: **a session persists
 * across two reloads**, and it expires and refreshes the way the configuration
 * says it does.
 *
 * Three properties make this a proof rather than a rehearsal.
 *
 * 1. **The real configuration.** The module under test is
 *    `apps/web/src/lib/auth.ts` itself — the same adapter, the same session
 *    strategy, the same callbacks the application serves. A test that rebuilt
 *    an equivalent config would keep passing after someone changed the real one.
 * 2. **The real endpoint.** A reload is an HTTP request that presents a cookie
 *    and gets a session back, so that is what is issued here: `handlers.GET`
 *    against `/api/auth/session`, twice, with the cookie a browser would send.
 * 3. **The real database.** The session is a row (see `lib/auth.ts` for why),
 *    and what "persists" means is that the row is still there and still
 *    resolves. Both are asserted from outside Auth.js.
 *
 * With no provider configured yet — the email link is CAL-025, Google CAL-026,
 * GitHub CAL-027 — a session is opened through the adapter's own
 * `createSession`, which is exactly the call a provider callback makes once it
 * has verified an identity.
 */

import { randomUUID } from "node:crypto";

import { createAuthAdapter, SESSION_MAX_AGE_SECONDS } from "@calepin/shared/auth";
import { configureDatabaseClient, resetDatabaseClient } from "@calepin/shared/database";
import { PrismaClient } from "@prisma/client";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

/**
 * The application validates its whole environment at import
 * (`@calepin/shared/config`), so the variables that have nothing to do with
 * authentication are given shape-valid local values. `DATABASE_URL` is not
 * among them: `global-setup.ts` points it at this run's own container.
 */
process.env.AUTH_SECRET = "integration-secret-of-at-least-32-characters";
process.env.EMAIL_SERVER_HOST ??= "localhost";
process.env.EMAIL_SERVER_PORT ??= "1025";
process.env.EMAIL_SERVER_USER ??= "calepin";
process.env.EMAIL_SERVER_PASSWORD ??= "calepin_local";
process.env.EMAIL_FROM ??= "connexion@calepin.test";
process.env.REDIS_URL ??= "redis://localhost:6379";
process.env.S3_ENDPOINT ??= "http://localhost:9000";
process.env.S3_REGION ??= "us-east-1";
process.env.S3_BUCKET ??= "calepin";
process.env.S3_ACCESS_KEY_ID ??= "calepin";
process.env.S3_SECRET_ACCESS_KEY ??= "calepin_local";

const prisma = new PrismaClient();

/**
 * The client the adapter reads, registered the way the process shell registers
 * it (`apps/web/src/lib/database.ts`). Done before the app module is imported,
 * because `createAuthAdapter` refuses to build over an unregistered client.
 */
configureDatabaseClient(prisma);

const { handlers } = await import("../../apps/web/src/lib/auth");

/**
 * The name Auth.js gives its session cookie over plain HTTP. The secure variant
 * (`__Secure-authjs.session-token`) is chosen from the request URL's protocol,
 * so an http origin here is what keeps the two in step.
 */
const SESSION_COOKIE = "authjs.session-token";
const SESSION_ENDPOINT = "http://localhost:3000/api/auth/session";

interface SessionResponse {
  user?: { id?: string; email?: string; name?: string | null };
  expires?: string;
}

/**
 * One reload: a GET carrying the session cookie, and the JSON it answers.
 *
 * `null` is the endpoint's own answer for "no live session" — not an empty
 * object — which is why the type says so rather than being narrowed away.
 */
async function loadSession(token: string): Promise<{
  status: number;
  body: SessionResponse | null;
}> {
  const response = await handlers.GET(
    new NextRequest(SESSION_ENDPOINT, { headers: { cookie: `${SESSION_COOKIE}=${token}` } }),
  );

  return { status: response.status, body: (await response.json()) as SessionResponse | null };
}

function inSeconds(seconds: number): Date {
  return new Date(Date.now() + seconds * 1000);
}

let userId: string;

beforeAll(async () => {
  await prisma.$connect();
});

afterAll(async () => {
  await prisma.$disconnect();
  resetDatabaseClient();
});

beforeEach(async () => {
  await prisma.session.deleteMany();
  await prisma.user.deleteMany({ where: { email: { startsWith: "session-" } } });

  const user = await prisma.user.create({
    data: { email: `session-${randomUUID()}@example.test`, name: "Autrice" },
  });
  userId = user.id;
});

/** Opens a session the way a provider callback would, and returns its token. */
async function openSession(expires: Date): Promise<string> {
  const sessionToken = randomUUID();

  await createAuthAdapter().createSession?.({ sessionToken, userId, expires });

  return sessionToken;
}

describe("a signed-in session (CAL-024)", () => {
  it("persists across two reloads", async () => {
    const token = await openSession(inSeconds(SESSION_MAX_AGE_SECONDS));

    const first = await loadSession(token);
    const second = await loadSession(token);

    expect(first.status).toBe(200);
    expect(first.body?.user?.id).toBe(userId);
    expect(second.body?.user?.id).toBe(userId);
    expect(second.body?.user?.email).toBe(first.body?.user?.email);

    // The criterion is about the session, not about two lucky reads: the row
    // the second reload resolved is the row the first one did.
    expect(await prisma.session.count({ where: { sessionToken: token } })).toBe(1);
  });

  it("carries the owner id, which is what every scoped read needs", async () => {
    // `openProjectScope` takes the owner id and nothing else, so the whole
    // access policy of CAL-023 rests on this field being there. Auth.js sends
    // it for a database session today; this is what makes that a checked fact
    // rather than an assumption, and what would catch a version that stopped.
    const token = await openSession(inSeconds(SESSION_MAX_AGE_SECONDS));

    const { body } = await loadSession(token);

    expect(body?.user?.id).toBe(userId);
    expect(body?.user?.email).toMatch(/^session-.+@example\.test$/);
  });

  it("is refused, and swept, once it has expired", async () => {
    const token = await openSession(inSeconds(-60));

    const { body } = await loadSession(token);

    // `null`, the endpoint's answer for "no live session" — the same one an
    // anonymous request gets, so an expired token tells a client nothing.
    expect(body).toBeNull();
    // Not merely ignored: the row is deleted on the request that finds it
    // stale, so an expired token cannot come back if the clock is wound back.
    expect(await prisma.session.count({ where: { sessionToken: token } })).toBe(0);
  });

  it("pushes an ageing session back to its full lifetime when it is read", async () => {
    // Older than `SESSION_UPDATE_AGE_SECONDS`, so the read is due to refresh
    // it: a reader who keeps coming back is never signed out mid-chapter.
    const stale = inSeconds(SESSION_MAX_AGE_SECONDS - 3 * 24 * 60 * 60);
    const token = await openSession(stale);

    await loadSession(token);

    const refreshed = await prisma.session.findUniqueOrThrow({ where: { sessionToken: token } });
    expect(refreshed.expires.getTime()).toBeGreaterThan(stale.getTime());
  });

  it("leaves a session that was just refreshed alone", async () => {
    // The other half of the pair: an active reader writes one row a day, not
    // one row a request. Without this the update interval would be decoration.
    const fresh = inSeconds(SESSION_MAX_AGE_SECONDS);
    const token = await openSession(fresh);

    await loadSession(token);

    const unchanged = await prisma.session.findUniqueOrThrow({ where: { sessionToken: token } });
    expect(unchanged.expires.getTime()).toBe(fresh.getTime());
  });

  it("answers an empty session to a request carrying no cookie", async () => {
    const response = await handlers.GET(new NextRequest(SESSION_ENDPOINT));

    expect(response.status).toBe(200);
    expect((await response.json()) as SessionResponse | null).toBeNull();
  });

  it("answers an empty session to a forged token, without creating one", async () => {
    const { body } = await loadSession(randomUUID());

    expect(body).toBeNull();
    expect(await prisma.session.count()).toBe(0);
  });

  it("ends every session of an account when the account is deleted", async () => {
    // The cascade is what makes account deletion (CAL-030) a real sign-out
    // rather than a row left resolving to a user that no longer exists.
    const token = await openSession(inSeconds(SESSION_MAX_AGE_SECONDS));

    await prisma.user.delete({ where: { id: userId } });

    expect(await prisma.session.count({ where: { sessionToken: token } })).toBe(0);
  });
});
