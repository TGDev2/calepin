import { expect, test } from "@playwright/test";

import {
  closeSignedInSession,
  openSignedInSession,
  SESSION_COOKIE,
} from "../../../../test/e2e/session-fixture";

/**
 * CAL-030's acceptance criterion, in a browser: no route outside the explicit
 * public allowlist is reachable without a session, and signing in returns the
 * visitor to the destination they were redirected from.
 *
 * Nothing here calls a real provider (CLAUDE.md §8) — the email and OAuth
 * sign-in requests are intercepted the same way `sign-in.spec.ts` already
 * does, and this suite additionally reads the intercepted request's body to
 * assert on the `callbackUrl` `next-auth/react`'s `signIn()` sends.
 */

/** Parses the `application/x-www-form-urlencoded` body `signIn()` posts. */
function postedCallbackUrl(postData: string | null): string | null {
  return new URLSearchParams(postData ?? "").get("callbackUrl");
}

test.describe("the public allowlist", () => {
  for (const path of ["/sign-in", "/sign-in/check-email", "/account/deleted"]) {
    test(`does not redirect an anonymous visitor away from ${path}`, async ({ page }) => {
      await page.goto(path);
      expect(new URL(page.url()).pathname).toBe(path);
    });
  }
});

test.describe("an anonymous visitor of a non-public route", () => {
  test("is redirected to sign in, preserving the exact destination", async ({ page }) => {
    // A path no page answers — proving the allowlist is default-deny for any
    // unlisted route, not only the ones this application happens to build.
    // (`/account/delete` was that path until CAL-031 built it; the deletion
    // suite asserts the same redirect on the real screen.)
    await page.goto("/projects/not-a-real-project");

    await page.waitForURL((url) => url.pathname === "/sign-in");
    expect(new URL(page.url()).searchParams.get("callbackUrl")).toBe(
      "/projects/not-a-real-project",
    );
  });

  // `/account/deleted` is public and `/account/delete` is not, and the two
  // differ by two characters. A prefix match on the allowlist would have
  // opened the deletion screen to anyone.
  test("is still redirected away from the deletion screen beside the public one", async ({
    page,
  }) => {
    await page.goto("/account/delete");

    await page.waitForURL((url) => url.pathname === "/sign-in");
    expect(new URL(page.url()).searchParams.get("callbackUrl")).toBe("/account/delete");
  });

  test("carries the destination through to the email sign-in request", async ({ page }) => {
    let callbackUrl: string | null = null;
    await page.route("**/api/auth/signin/email*", async (route) => {
      callbackUrl = postedCallbackUrl(route.request().postData());
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ url: "http://localhost:3000/sign-in/check-email" }),
      });
    });

    await page.goto("/account");
    await page.waitForURL((url) => url.pathname === "/sign-in");

    await page.getByLabel("Adresse électronique").fill("autrice@example.test");
    await page.getByRole("button", { name: "Recevoir le lien de connexion" }).click();
    await page.waitForURL(/\/sign-in\/check-email/);

    expect(callbackUrl).toBe("/account");
  });

  test("carries the destination through to the OAuth sign-in request", async ({ page }) => {
    // Fulfilled with a public URL, not the real destination: the mock never
    // sets an actual session cookie, so a fulfilled redirect to `/account`
    // (or, since CAL-032, `/`) would correctly bounce off this very
    // middleware again. What this test asserts is the `callbackUrl` the
    // request carried, not where the (faked) response happens to send the
    // browser next.
    let callbackUrl: string | null = null;
    await page.route("**/api/auth/signin/google*", async (route) => {
      callbackUrl = postedCallbackUrl(route.request().postData());
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ url: "http://localhost:3000/sign-in/check-email" }),
      });
    });

    await page.goto("/account");
    await page.waitForURL((url) => url.pathname === "/sign-in");

    await page.getByRole("button", { name: "Continuer avec Google" }).click();
    await page.waitForURL(/\/sign-in\/check-email/);

    expect(callbackUrl).toBe("/account");
  });

  test("has an external callbackUrl sanitized before it reaches the sign-in request", async ({
    page,
  }) => {
    let callbackUrl: string | null = null;
    await page.route("**/api/auth/signin/email*", async (route) => {
      callbackUrl = postedCallbackUrl(route.request().postData());
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ url: "http://localhost:3000/sign-in/check-email" }),
      });
    });

    await page.goto(`/sign-in?callbackUrl=${encodeURIComponent("https://evil.example")}`);
    await page.getByLabel("Adresse électronique").fill("autrice@example.test");
    await page.getByRole("button", { name: "Recevoir le lien de connexion" }).click();
    await page.waitForURL(/\/sign-in\/check-email/);

    expect(callbackUrl).toBe("/");
  });
});

test.describe("an already signed-in visitor of the sign-in screen", () => {
  test("is sent to a safe callbackUrl instead of the home page", async ({ page, context }) => {
    const session = await openSignedInSession();

    try {
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

      await page.goto(`/sign-in?callbackUrl=${encodeURIComponent("/account")}`);
      await page.waitForURL("http://localhost:3000/account");
    } finally {
      await closeSignedInSession(session);
    }
  });

  test("has an external callbackUrl sanitized to the home page, not followed off-site", async ({
    page,
    context,
  }) => {
    const session = await openSignedInSession();

    try {
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

      await page.goto(`/sign-in?callbackUrl=${encodeURIComponent("https://evil.example")}`);
      await page.waitForURL("http://localhost:3000/");
    } finally {
      await closeSignedInSession(session);
    }
  });
});
