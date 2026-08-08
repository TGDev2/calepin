import { expect, test } from "@playwright/test";

import {
  closeSignedInSession,
  linkAccount,
  openSignedInSession,
  SESSION_COOKIE,
  sessionExists,
  type SignedInSession,
} from "../../../../test/e2e/session-fixture";

/**
 * CAL-029's acceptance criterion, in a browser: the account page shows real
 * data, and signing out actually invalidates the session — not just
 * navigates away from it.
 */

async function signInAs(
  context: import("@playwright/test").BrowserContext,
  session: SignedInSession,
): Promise<void> {
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

test.describe("the account page", () => {
  test("shows the address and the email method for an email-only account", async ({
    page,
    context,
  }) => {
    const session = await openSignedInSession();

    try {
      await signInAs(context, session);
      await page.goto("/account");

      // Scoped to `main`: the email also appears in the persistent
      // `AccountBar` header on every page.
      const main = page.getByRole("main");
      await expect(main.getByText(session.email)).toBeVisible();
      // "Adresse électronique" also labels the address row itself, so the
      // method list is what's asserted on specifically here.
      await expect(page.getByRole("listitem").getByText("Adresse électronique")).toBeVisible();
      await expect(page.getByRole("listitem").getByText("Google")).toHaveCount(0);
    } finally {
      await closeSignedInSession(session);
    }
  });

  test("also shows a linked OAuth provider", async ({ page, context }) => {
    const session = await openSignedInSession();

    try {
      await linkAccount(session.userId, "google");
      await signInAs(context, session);
      await page.goto("/account");

      await expect(page.getByText("Google")).toBeVisible();
    } finally {
      await closeSignedInSession(session);
    }
  });

  test("offers an entry point toward account deletion", async ({ page, context }) => {
    const session = await openSignedInSession();

    try {
      await signInAs(context, session);
      await page.goto("/account");

      await expect(page.getByRole("link", { name: "Supprimer mon compte" })).toHaveAttribute(
        "href",
        "/account/delete",
      );
    } finally {
      await closeSignedInSession(session);
    }
  });

  test("redirects a signed-out visitor to the sign-in screen, preserving the destination", async ({
    page,
  }) => {
    await page.goto("/account");
    await page.waitForURL((url) => url.pathname === "/sign-in");
    expect(new URL(page.url()).searchParams.get("callbackUrl")).toBe("/account");
  });

  test("signing out shows a pending state and actually invalidates the session", async ({
    page,
    context,
  }) => {
    const session = await openSignedInSession();

    try {
      await signInAs(context, session);
      await page.goto("/account");

      await expect(sessionExists(session.sessionToken)).resolves.toBe(true);

      await page.getByRole("button", { name: "Se déconnecter" }).click();
      await expect(page.getByRole("button", { name: "Déconnexion…" })).toBeVisible();

      await page.waitForURL((url) => url.pathname === "/sign-in");
      await expect(sessionExists(session.sessionToken)).resolves.toBe(false);
    } finally {
      await closeSignedInSession(session);
    }
  });
});

test.describe("the home page", () => {
  test("offers a way to reach the account page when signed in", async ({ page, context }) => {
    const session = await openSignedInSession();

    try {
      await signInAs(context, session);
      await page.goto("/");

      await expect(page.getByRole("link", { name: "Mon compte" })).toHaveAttribute(
        "href",
        "/account",
      );
    } finally {
      await closeSignedInSession(session);
    }
  });
});
