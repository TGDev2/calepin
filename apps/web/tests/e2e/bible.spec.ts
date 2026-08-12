import { type BrowserContext, expect, test } from "@playwright/test";

import {
  closeSignedInSession,
  openSignedInSession,
  seedProjectWithBible,
  SESSION_COOKIE,
  type SignedInSession,
} from "../../../../test/e2e/session-fixture";

/**
 * CAL-096 in a browser: the consultation screen finds one canon fact fast,
 * marks a locked element without relying on colour alone, and shows what
 * proposed, edited and validated content looks like.
 *
 * The reads themselves — `getBibleOverview`'s scoping — are proved against a
 * real PostgreSQL by `test/integration/owner-access.integration.test.ts`.
 * What is proved here is the journey: that the sidebar's keyboard navigation
 * actually moves focus, that the search box finds a fact by a word planted
 * nowhere else, and that the two non-colour badges render.
 */
async function signIn(context: BrowserContext, session: SignedInSession): Promise<void> {
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

test("finds a canon fact by a word planted nowhere else, in one search", async ({
  page,
  context,
}) => {
  const session = await openSignedInSession();

  try {
    const project = await seedProjectWithBible(session.userId, "Bible à consulter");
    await signIn(context, session);

    await page.goto(`/projects/${project.projectId}/bible`);
    await expect(page.getByRole("heading", { name: "Bible narrative" })).toBeVisible();

    await page.getByLabel("Rechercher dans la bible").fill("chaudronnerie");

    const result = page.getByRole("link", { name: /Robert connaît un poste/ });
    await expect(result).toBeVisible();

    await result.click();
    await expect(page).toHaveURL(/#canon-fact-/);
    await expect(
      page.locator("#canon-facts").getByText("Robert connaît un poste en chaudronnerie"),
    ).toBeVisible();
  } finally {
    await closeSignedInSession(session);
  }
});

test("marks a locked element and shows each origin state by its own label", async ({
  page,
  context,
}) => {
  const session = await openSignedInSession();

  try {
    const project = await seedProjectWithBible(session.userId, "Bible verrouillée");
    await signIn(context, session);

    await page.goto(`/projects/${project.projectId}/bible`);

    // The unvalidated identity is a model proposal in words, not only in a
    // colour swatch.
    await expect(page.getByText("Proposition du modèle").first()).toBeVisible();

    // The confirmed canon fact reads as validated on its own signal
    // (CanonFact.status), independent of the identity's.
    await expect(page.getByText("Élément validé").first()).toBeVisible();

    // The locked world rule carries the lock badge's own label. Not an exact
    // match: the badge's visible label sits beside a visually hidden
    // explanation inside the same element (LockBadge's own markup), so no
    // element's full text is the bare word alone.
    await expect(page.getByText("Fermeture programmée")).toBeVisible();
    await expect(page.getByText("Verrouillé").first()).toBeVisible();
  } finally {
    await closeSignedInSession(session);
  }
});

test("moves the sidebar's focus with the arrow keys and jumps to a section", async ({
  page,
  context,
}) => {
  const session = await openSignedInSession();

  try {
    const project = await seedProjectWithBible(session.userId, "Bible au clavier");
    await signIn(context, session);

    await page.goto(`/projects/${project.projectId}/bible`);

    const nav = page.getByRole("navigation", { name: "Sections de la bible" });
    const identityLink = nav.getByRole("link", { name: "Identité" });
    const styleLink = nav.getByRole("link", { name: "Style" });

    await identityLink.focus();
    await expect(identityLink).toBeFocused();

    await page.keyboard.press("ArrowDown");
    await expect(styleLink).toBeFocused();

    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/#style$/);
  } finally {
    await closeSignedInSession(session);
  }
});
