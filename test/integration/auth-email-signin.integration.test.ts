/**
 * CAL-025's acceptance criterion, against the real thing: **a link received
 * by email signs the user in, expires after one use and after fifteen
 * minutes, and cannot be requested more than five times per hour per
 * address.**
 *
 * Same structure as `auth-session.integration.test.ts`: the real environment
 * bootstrap, the real `apps/web/src/lib/auth.ts`, a real PostgreSQL.
 *
 * Two things are proven through different seams, deliberately.
 *
 * 1. **A link signs the user in, once, before it expires.** Driven through
 *    the real callback route (`handlers.GET` on
 *    `/api/auth/callback/email`), the same way the session suite drives
 *    `/api/auth/session` — this is `@auth/prisma-adapter`'s
 *    `createVerificationToken`/`useVerificationToken` pair, hashed the way
 *    `@auth/core`'s callback action hashes an incoming token
 *    (`sha256(token + secret)`), so the request looks exactly like a click on
 *    the real link would.
 * 2. **The rate limit and the template.** `createEmailProvider` is imported
 *    directly, with a fake transport standing in for SMTP — the same
 *    reasoning CLAUDE.md §8 gives for never calling a real provider in a
 *    test, applied to email. Driving this one through the HTTP layer would
 *    need `apps/web/src/lib/auth.ts` to build a fake transport from `env`,
 *    which would mean test-only branching in production wiring; calling the
 *    exported function directly avoids that while still exercising the real
 *    code `apps/web/src/lib/auth.ts` wires up.
 */

import { createHash, randomUUID } from "node:crypto";

import {
  createAuthAdapter,
  createEmailProvider,
  EMAIL_SIGN_IN_LIMIT,
  EMAIL_SIGN_IN_MAX_AGE_SECONDS,
} from "@calepin/shared/auth";
import { configureDatabaseClient, resetDatabaseClient } from "@calepin/shared/database";
import { isAppError } from "@calepin/shared/errors";
import { PrismaClient } from "@prisma/client";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

const AUTH_SECRET = "integration-secret-of-at-least-32-characters";

process.env.AUTH_SECRET = AUTH_SECRET;
process.env.EMAIL_SERVER_HOST ??= "localhost";
process.env.EMAIL_SERVER_PORT ??= "1025";
process.env.EMAIL_SERVER_USER ??= "calepin";
process.env.EMAIL_SERVER_PASSWORD ??= "calepin_local";
process.env.EMAIL_FROM ??= "connexion@calepin.test";
process.env.GOOGLE_CLIENT_ID ??= "integration-google-client-id";
process.env.GOOGLE_CLIENT_SECRET ??= "integration-google-client-secret";
process.env.REDIS_URL ??= "redis://localhost:6379";
process.env.S3_ENDPOINT ??= "http://localhost:9000";
process.env.S3_REGION ??= "us-east-1";
process.env.S3_BUCKET ??= "calepin";
process.env.S3_ACCESS_KEY_ID ??= "calepin";
process.env.S3_SECRET_ACCESS_KEY ??= "calepin_local";

const prisma = new PrismaClient();

configureDatabaseClient(prisma);

const { handlers } = await import("../../apps/web/src/lib/auth");

const CALLBACK_ENDPOINT = "http://localhost:3000/api/auth/callback/email";

/**
 * Derived from `createEmailProvider` itself rather than imported from
 * `nodemailer` directly — this file is not inside a package that declares
 * that dependency, and a type-only import would still need it resolvable.
 */
type EmailTransport = NonNullable<Parameters<typeof createEmailProvider>[0]["transport"]>;

/** The hash `@auth/core`'s callback action applies to an incoming token. */
function hashToken(token: string): string {
  return createHash("sha256").update(`${token}${AUTH_SECRET}`).digest("hex");
}

function inSeconds(seconds: number): Date {
  return new Date(Date.now() + seconds * 1000);
}

function uniqueAddress(): string {
  return `signin-${randomUUID()}@example.test`;
}

/** Stores a token the way `adapter.createVerificationToken` would, hashed. */
async function issueToken(identifier: string, expires: Date): Promise<string> {
  const token = randomUUID();

  await createAuthAdapter().createVerificationToken?.({
    identifier,
    token: hashToken(token),
    expires,
  });

  return token;
}

/** A GET on the callback route — what clicking the link in the email does. */
async function clickLink(token: string, identifier: string) {
  const url = `${CALLBACK_ENDPOINT}?${new URLSearchParams({
    token,
    email: identifier,
    callbackUrl: "http://localhost:3000/",
  })}`;

  return handlers.GET(new NextRequest(url));
}

/** A `Transporter`-shaped fake that records every call instead of sending. */
interface FakeTransport {
  sentMessages: Array<{ to: string; from: string; subject: string; text: string; html: string }>;
  sendMail(message: {
    to: string;
    from: string;
    subject: string;
    text: string;
    html: string;
  }): Promise<{ rejected: string[]; pending: string[] }>;
}

function fakeTransport(): FakeTransport {
  return {
    sentMessages: [],
    async sendMail(message) {
      this.sentMessages.push(message);
      return { rejected: [], pending: [] };
    },
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
  await prisma.session.deleteMany();
  await prisma.verificationToken.deleteMany();
  await prisma.emailSignInRequest.deleteMany();
  await prisma.user.deleteMany({ where: { email: { startsWith: "signin-" } } });
});

describe("a link received by email (CAL-025)", () => {
  it("signs the user in", async () => {
    const identifier = uniqueAddress();
    const token = await issueToken(identifier, inSeconds(EMAIL_SIGN_IN_MAX_AGE_SECONDS));

    const response = await clickLink(token, identifier);

    expect(response.status).toBe(302);
    expect(response.headers.get("set-cookie")).toContain("authjs.session-token");

    const user = await prisma.user.findUniqueOrThrow({ where: { email: identifier } });
    expect(await prisma.session.count({ where: { userId: user.id } })).toBe(1);
  });

  it("is refused the second time — single use", async () => {
    const identifier = uniqueAddress();
    const token = await issueToken(identifier, inSeconds(EMAIL_SIGN_IN_MAX_AGE_SECONDS));

    await clickLink(token, identifier);
    const sessionsAfterFirstClick = await prisma.session.count();

    const second = await clickLink(token, identifier);

    expect(second.headers.get("location")).toContain("error");
    expect(await prisma.session.count()).toBe(sessionsAfterFirstClick);
    // The row itself is gone, not merely ignored — the first click consumed
    // it, so a forged replay of the same URL cannot come back either.
    expect(await prisma.verificationToken.count({ where: { identifier } })).toBe(0);
  });

  it("is refused once the fifteen minutes have passed", async () => {
    const identifier = uniqueAddress();
    const token = await issueToken(identifier, inSeconds(-60));

    const response = await clickLink(token, identifier);

    expect(response.headers.get("location")).toContain("error");
    expect(await prisma.session.count()).toBe(0);
  });

  it("carries a fifteen-minute lifetime on the provider Auth.js reads", () => {
    // `@auth/core`'s `sendToken` computes `expires` from `provider.maxAge`
    // directly (`node_modules/.pnpm/@auth+core.../src/lib/actions/signin/
    // send-token.ts`) — this is the value the real sign-in request uses.
    expect(EMAIL_SIGN_IN_MAX_AGE_SECONDS).toBe(15 * 60);
  });
});

describe("the email sign-in request (CAL-025)", () => {
  it("sends a sober French message and gates it on the rate limit", async () => {
    const identifier = uniqueAddress();
    const transport = fakeTransport();
    const provider = createEmailProvider({
      from: "connexion@calepin.test",
      server: { host: "unused", port: 0 },
      transport: transport as unknown as EmailTransport,
    });

    await provider.sendVerificationRequest({
      identifier,
      url: "http://localhost:3000/api/auth/callback/email?token=abc&email=" + identifier,
      expires: inSeconds(EMAIL_SIGN_IN_MAX_AGE_SECONDS),
      token: "abc",
      provider,
      theme: {},
      request: new Request("http://localhost:3000/api/auth/signin/email"),
    });

    expect(transport.sentMessages).toHaveLength(1);
    const [message] = transport.sentMessages;
    expect(message?.to).toBe(identifier);
    expect(message?.subject).toBe("Connexion à Calepin");
    expect(message?.text).toContain("usage unique");
    expect(message?.text).toContain("15 minutes");
    expect(message?.html).not.toContain("<img");
  });

  it("refuses the sixth request for the same address within the hour", async () => {
    const identifier = uniqueAddress();
    const transport = fakeTransport();
    const provider = createEmailProvider({
      from: "connexion@calepin.test",
      server: { host: "unused", port: 0 },
      transport: transport as unknown as EmailTransport,
    });

    async function request() {
      return provider.sendVerificationRequest({
        identifier,
        url: "http://localhost:3000/api/auth/callback/email?token=abc&email=" + identifier,
        expires: inSeconds(EMAIL_SIGN_IN_MAX_AGE_SECONDS),
        token: "abc",
        provider,
        theme: {},
        request: new Request("http://localhost:3000/api/auth/signin/email"),
      });
    }

    for (let attempt = 0; attempt < EMAIL_SIGN_IN_LIMIT; attempt++) {
      await request();
    }

    await expect(request()).rejects.toSatisfy(
      (error: unknown) => isAppError(error) && error.code === "RATE_LIMITED",
    );

    // The gate stopped the send itself, not merely the count.
    expect(transport.sentMessages).toHaveLength(EMAIL_SIGN_IN_LIMIT);
  });

  it("keeps two addresses independent", async () => {
    const first = uniqueAddress();
    const second = uniqueAddress();
    const transport = fakeTransport();
    const provider = createEmailProvider({
      from: "connexion@calepin.test",
      server: { host: "unused", port: 0 },
      transport: transport as unknown as EmailTransport,
    });

    async function request(identifier: string) {
      return provider.sendVerificationRequest({
        identifier,
        url: "http://localhost:3000/api/auth/callback/email?token=abc&email=" + identifier,
        expires: inSeconds(EMAIL_SIGN_IN_MAX_AGE_SECONDS),
        token: "abc",
        provider,
        theme: {},
        request: new Request("http://localhost:3000/api/auth/signin/email"),
      });
    }

    for (let attempt = 0; attempt < EMAIL_SIGN_IN_LIMIT; attempt++) {
      await request(first);
    }

    await expect(request(second)).resolves.toBeUndefined();
    expect(transport.sentMessages).toHaveLength(EMAIL_SIGN_IN_LIMIT + 1);
  });
});
