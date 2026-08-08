import { type BrowserContext, expect, test } from "@playwright/test";

import {
  closeSignedInSession,
  openSignedInSession,
  SESSION_COOKIE,
  sessionExists,
  type SignedInSession,
  userExists,
} from "../../../../test/e2e/session-fixture";

/**
 * CAL-031's acceptance criterion, in a browser: the confirmation is explicit
 * and typed, and once it is given nothing of the account is readable through
 * the application or present in the database.
 *
 * The database assertions are the ones that matter. A suite that only checked
 * the screen would pass just as happily against a sign-out — which is exactly
 * the bug this feature must not ship as.
 */

async function signInAs(context: BrowserContext, session: SignedInSession): Promise<void> {
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
}

test.describe("the account deletion screen", () => {
  test("shows the census and asks for the address before it will delete anything", async ({
    page,
    context,
  }) => {
    const session = await openSignedInSession();

    try {
      await signInAs(context, session);
      await page.goto("/account/delete");

      const main = page.getByRole("main");
      await expect(main.getByRole("heading", { name: "Supprimer mon compte" })).toBeVisible();
      await expect(main.getByText("Cette action est définitive.")).toBeVisible();

      // A fresh account owns nothing, and the census says so rather than
      // showing an empty region: "0 projet", singular, as French wants it.
      await expect(main.getByRole("listitem").filter({ hasText: "projet" })).toContainText("0");

      await expect(page.getByLabel(/saisissez votre adresse électronique/)).toBeVisible();
      await expect(main.getByText(session.email)).toBeVisible();
      await expect(
        page.getByRole("button", { name: "Supprimer définitivement mon compte" }),
      ).toBeEnabled();
    } finally {
      await closeSignedInSession(session);
    }
  });

  test("refuses a mismatched address and deletes nothing", async ({ page, context }) => {
    const session = await openSignedInSession();

    try {
      await signInAs(context, session);
      await page.goto("/account/delete");

      await page.getByLabel(/saisissez votre adresse électronique/).fill("quelquun@example.test");
      await page.getByRole("button", { name: "Supprimer définitivement mon compte" }).click();

      await page.waitForURL(/\/account\/delete\?error=confirmation/);
      // Scoped to `main`: once client JavaScript has run, Next.js injects its
      // own route announcer, which also carries `role="alert"` — an unscoped
      // locator is a strict-mode violation before any text ever gets compared
      // (the CAL-028 lesson, and this suite walked straight into it).
      await expect(page.getByRole("main").getByRole("alert")).toContainText(
        "Aucune donnée n'a été supprimée",
      );

      // The account, its session and the visitor's access to both: untouched.
      await expect(userExists(session.userId)).resolves.toBe(true);
      await expect(sessionExists(session.sessionToken)).resolves.toBe(true);
      await page.goto("/account");
      await expect(page.getByRole("main").getByText(session.email)).toBeVisible();
    } finally {
      await closeSignedInSession(session);
    }
  });

  test("deletes the account when the address matches, and leaves nothing behind", async ({
    page,
    context,
  }) => {
    const session = await openSignedInSession();

    try {
      await signInAs(context, session);
      await page.goto("/account/delete");

      await expect(userExists(session.userId)).resolves.toBe(true);

      await page.getByLabel(/saisissez votre adresse électronique/).fill(session.email);
      await page.getByRole("button", { name: "Supprimer définitivement mon compte" }).click();

      await page.waitForURL("http://localhost:3000/account/deleted");
      await expect(
        page.getByRole("heading", { name: "Votre compte a été supprimé" }),
      ).toBeVisible();

      // In the database, not only on the screen.
      await expect(userExists(session.userId)).resolves.toBe(false);
      await expect(sessionExists(session.sessionToken)).resolves.toBe(false);

      // And through the application: the cookie was cleared, so the account
      // page is not merely empty — it is unreachable, the same as for a
      // visitor who never signed in.
      await page.goto("/account");
      await page.waitForURL((url) => url.pathname === "/sign-in");
      expect(new URL(page.url()).searchParams.get("callbackUrl")).toBe("/account");
    } finally {
      await closeSignedInSession(session);
    }
  });

  test("is reachable from the account page, and cancelling returns there", async ({
    page,
    context,
  }) => {
    const session = await openSignedInSession();

    try {
      await signInAs(context, session);
      await page.goto("/account");

      await page.getByRole("link", { name: "Supprimer mon compte" }).click();
      await page.waitForURL("http://localhost:3000/account/delete");

      await page.getByRole("link", { name: "Annuler et revenir à mon compte" }).click();
      await page.waitForURL("http://localhost:3000/account");
      await expect(userExists(session.userId)).resolves.toBe(true);
    } finally {
      await closeSignedInSession(session);
    }
  });

  test("turns an anonymous visitor away, preserving the destination", async ({ page }) => {
    await page.goto("/account/delete");

    await page.waitForURL((url) => url.pathname === "/sign-in");
    expect(new URL(page.url()).searchParams.get("callbackUrl")).toBe("/account/delete");
  });

  // The account it acknowledges no longer exists, so nobody reaching it can
  // hold a session. A protected page would answer a completed deletion with a
  // redirect to the sign-in screen.
  test("leaves the acknowledgement reachable without a session", async ({ page }) => {
    await page.goto("/account/deleted");

    expect(new URL(page.url()).pathname).toBe("/account/deleted");
    await expect(page.getByRole("heading", { name: "Votre compte a été supprimé" })).toBeVisible();
  });
});

/**
 * The screen has to work with JavaScript off: it is a plain form posting to a
 * server action, and the only client component on it is the submit button's
 * pending label. A deletion that silently required JavaScript would be a
 * regulatory obligation behind a bundle that failed to load.
 */
test.describe("the account deletion screen without JavaScript", () => {
  test.use({ javaScriptEnabled: false });

  test("still deletes the account", async ({ page, context }) => {
    const session = await openSignedInSession();

    try {
      await signInAs(context, session);
      await page.goto("/account/delete");

      await page.getByLabel(/saisissez votre adresse électronique/).fill(session.email);
      await page.getByRole("button", { name: "Supprimer définitivement mon compte" }).click();

      await page.waitForURL("http://localhost:3000/account/deleted");
      await expect(userExists(session.userId)).resolves.toBe(false);
    } finally {
      await closeSignedInSession(session);
    }
  });
});
