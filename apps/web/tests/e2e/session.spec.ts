import { expect, test } from "@playwright/test";

import {
  closeSignedInSession,
  openSignedInSession,
  SESSION_COOKIE,
  type SignedInSession,
} from "../../../../test/e2e/session-fixture";

/**
 * CAL-024's acceptance criterion, in a browser: **a session persists across two
 * reloads and is readable server-side and client-side.**
 *
 * `test/integration/auth-session.integration.test.ts` proves the same thing at
 * the HTTP layer, where refresh and expiry can be driven by moving a date. This
 * spec proves what that one cannot: that a real Next server sets the session on
 * the server-rendered markup, that a real browser keeps the cookie across a
 * navigation and a reload, and that the client half sees the same account.
 */

const serverLine = "Session serveur";
const clientLine = "Session client";

test.describe("an anonymous visitor", () => {
  test("is shown as signed out on both halves of the page", async ({ page }) => {
    // `/` is protected since CAL-032; `AccountBar` (the chrome under test
    // here) renders identically, anonymous, on any public page.
    await page.goto("/sign-in");

    await expect(page.getByText(`${serverLine} : aucune`)).toBeVisible();
    // The client half starts at "chargement…" and settles once
    // `/api/auth/session` answers, so this also proves the endpoint is served.
    await expect(page.getByText(`${clientLine} : aucune`)).toBeVisible();
  });
});

test.describe("a signed-in visitor", () => {
  let session: SignedInSession;

  test.beforeEach(async ({ context }) => {
    session = await openSignedInSession();

    await context.addCookies([
      {
        name: SESSION_COOKIE,
        value: session.sessionToken,
        domain: "localhost",
        path: "/",
        httpOnly: true,
        sameSite: "Lax",
      },
    ]);
  });

  test.afterEach(async () => {
    await closeSignedInSession(session);
  });

  test("keeps the session across two reloads, server-side and client-side", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText(`${serverLine} : ${session.email}`)).toBeVisible();
    await expect(page.getByText(`${clientLine} : ${session.email}`)).toBeVisible();

    await page.reload();
    await expect(page.getByText(`${serverLine} : ${session.email}`)).toBeVisible();
    await expect(page.getByText(`${clientLine} : ${session.email}`)).toBeVisible();

    // Two, as the criterion says — the second is what would catch a session
    // that survives one round trip because it was still in a cache.
    await page.reload();
    await expect(page.getByText(`${serverLine} : ${session.email}`)).toBeVisible();
    await expect(page.getByText(`${clientLine} : ${session.email}`)).toBeVisible();
  });

  test("is signed in on the server before any client JavaScript runs", async ({ browser }) => {
    // The server half must be in the HTML itself. With JavaScript disabled the
    // client half can never settle, so anything still shown is server-rendered.
    const context = await browser.newContext({ javaScriptEnabled: false });
    await context.addCookies([
      {
        name: SESSION_COOKIE,
        value: session.sessionToken,
        domain: "localhost",
        path: "/",
        httpOnly: true,
        sameSite: "Lax",
      },
    ]);

    const page = await context.newPage();
    await page.goto("/");

    await expect(page.getByText(`${serverLine} : ${session.email}`)).toBeVisible();

    await context.close();
  });

  test("answers the same account at the session endpoint", async ({ page }) => {
    const response = await page.request.get("/api/auth/session");

    expect(response.status()).toBe(200);
    expect(await response.json()).toMatchObject({
      user: { id: session.userId, email: session.email },
    });
  });
});
