import { expect, type Page, test } from "@playwright/test";

import {
  closeSignedInSession,
  openSignedInSession,
  SESSION_COOKIE,
} from "../../../../test/e2e/session-fixture";

/**
 * CAL-028's acceptance criterion, in a browser: the sign-in / sign-up screen
 * is navigable by keyboard, its fields are associated with their labels, its
 * errors are announced to assistive technology, and no information is
 * carried by color alone.
 *
 * Nothing here calls a real provider (CLAUDE.md §8). Email delivery and the
 * OAuth redirect are both driven through `page.route()` interception of the
 * same-origin `fetch()` calls `next-auth/react`'s `signIn()` makes
 * (`/api/auth/signin/*`), never by depending on ambient machine state —
 * `EMAIL_SERVER_HOST=localhost:1025` (`apps/web/.env.example`) has nothing
 * listening on a fresh checkout, so a test that relied on a real SMTP
 * failure to prove the error banner would be flaky by construction.
 * `/api/auth/csrf` and `/api/auth/providers` are left to hit the real,
 * running dev server — they work regardless of the (placeholder-shaped)
 * Google/GitHub secrets.
 */

/** Delays a fulfilled route just long enough to observe the pending state. */
async function fulfillAfterDelay(
  page: Page,
  urlGlob: string,
  body: { url: string },
): Promise<void> {
  await page.route(urlGlob, async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 300));
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(body),
    });
  });
}

test.describe("the sign-in screen", () => {
  test("associates the email field with its label and reaches every control by keyboard", async ({
    page,
  }) => {
    await page.goto("/sign-in");

    const emailInput = page.getByLabel("Adresse électronique");
    await expect(emailInput).toBeVisible();

    await emailInput.focus();
    await expect(emailInput).toBeFocused();

    await page.keyboard.press("Tab");
    await expect(page.getByRole("button", { name: "Recevoir le lien de connexion" })).toBeFocused();

    await page.keyboard.press("Tab");
    await expect(page.getByRole("button", { name: "Continuer avec Google" })).toBeFocused();

    await page.keyboard.press("Tab");
    await expect(page.getByRole("button", { name: "Continuer avec GitHub" })).toBeFocused();
  });

  test("rejects an invalid address client-side, without ever contacting the server", async ({
    page,
  }) => {
    let signInRequests = 0;
    await page.route("**/api/auth/signin/email*", async (route) => {
      signInRequests += 1;
      await route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
    });

    await page.goto("/sign-in");
    await page.getByLabel("Adresse électronique").fill("not-an-email");
    await page.getByRole("button", { name: "Recevoir le lien de connexion" }).click();

    const fieldError = page.getByRole("alert").filter({ hasText: "adresse électronique valide" });
    await expect(fieldError).toBeVisible();
    expect(signInRequests).toBe(0);
  });

  test("shows a loading state, then moves to the confirmation screen on success", async ({
    page,
  }) => {
    await fulfillAfterDelay(page, "**/api/auth/signin/email*", {
      url: "http://localhost:3000/sign-in/check-email",
    });

    await page.goto("/sign-in");
    await page.getByLabel("Adresse électronique").fill("autrice@example.test");

    const submit = page.getByRole("button", { name: "Recevoir le lien de connexion" });
    await submit.click();

    await expect(page.getByRole("button", { name: "Envoi du lien…" })).toBeDisabled();

    await page.waitForURL(/\/sign-in\/check-email/);
    await expect(page.getByText("autrice@example.test")).toBeVisible();
  });

  test("shows a readable French error and recovers the form when the request fails", async ({
    page,
  }) => {
    await fulfillAfterDelay(page, "**/api/auth/signin/email*", {
      url: "http://localhost:3000/sign-in?error=Configuration",
    });

    await page.goto("/sign-in");
    await page.getByLabel("Adresse électronique").fill("autrice@example.test");
    await page.getByRole("button", { name: "Recevoir le lien de connexion" }).click();

    // Scoped by text, not just role: Next's own client-side route announcer
    // also carries `role="alert"` once JavaScript has run.
    const alert = page.getByRole("alert").filter({ hasText: "La connexion a échoué" });
    await expect(alert).toBeVisible();
    // Not carried by color alone: an explicit "Erreur" label is present too.
    await expect(alert).toContainText("Erreur");

    await expect(page.getByRole("button", { name: "Recevoir le lien de connexion" })).toBeEnabled();
    expect(page.url()).toContain("/sign-in");
    expect(page.url()).not.toContain("check-email");
  });

  test("shows a loading state on an OAuth button without leaving the app", async ({ page }) => {
    await fulfillAfterDelay(page, "**/api/auth/signin/google*", { url: "http://localhost:3000/" });

    await page.goto("/sign-in");
    const googleButton = page.getByRole("button", { name: "Continuer avec Google" });
    await googleButton.click();

    await expect(page.getByRole("button", { name: "Redirection vers Google…" })).toBeDisabled();
    // The email field is part of the same pending state.
    await expect(page.getByLabel("Adresse électronique")).toBeDisabled();

    await page.waitForURL("http://localhost:3000/");
  });

  for (const [code, fragment] of [
    ["Verification", "n'est plus valide"],
    ["AccessDenied", "annulée"],
  ] as const) {
    test(`renders the mapped French message for ?error=${code}, before any client script runs`, async ({
      browser,
    }) => {
      const context = await browser.newContext({ javaScriptEnabled: false });
      const page = await context.newPage();

      await page.goto(`/sign-in?error=${code}`);
      await expect(page.getByRole("alert")).toContainText(fragment);

      await context.close();
    });
  }

  test("redirects an already signed-in visitor away from the sign-in screen", async ({
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

      await page.goto("/sign-in");
      await page.waitForURL("http://localhost:3000/");
      expect(page.url()).toBe("http://localhost:3000/");
    } finally {
      await closeSignedInSession(session);
    }
  });
});

test.describe("the confirmation screen", () => {
  test("shows the address it was given", async ({ page }) => {
    await page.goto("/sign-in/check-email?email=autrice%40example.test");

    await expect(
      page.getByRole("heading", { name: "Vérifiez votre boîte de réception" }),
    ).toBeVisible();
    await expect(page.getByText("autrice@example.test")).toBeVisible();
    await expect(page.getByRole("link", { name: "Retour à la connexion" })).toHaveAttribute(
      "href",
      "/sign-in",
    );
  });

  test("still reads sensibly without one", async ({ page }) => {
    await page.goto("/sign-in/check-email");

    await expect(page.getByText("Un lien de connexion vous a été envoyé.")).toBeVisible();
  });
});

test.describe("the home page", () => {
  test("offers a way to reach the sign-in screen when signed out", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByRole("link", { name: "Se connecter" })).toHaveAttribute(
      "href",
      "/sign-in",
    );
  });
});
