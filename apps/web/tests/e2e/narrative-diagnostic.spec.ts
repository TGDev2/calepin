import { type BrowserContext, expect, test } from "@playwright/test";

import {
  closeSignedInSession,
  openSignedInSession,
  seedProjectWithAnalysis,
  seedProjectWithChapters,
  seedProjectWithSourceTextAndPlan,
  SESSION_COOKIE,
  type SignedInSession,
} from "../../../../test/e2e/session-fixture";

/**
 * CAL-072 in a browser: the seventeen-section diagnostic, the fact/
 * interpretation marker that never relies on color alone, and the short
 * explanation a specialised term offers on hover and on keyboard focus.
 *
 * The read itself is proved against a real PostgreSQL by
 * `test/integration/analysis-diagnostic.integration.test.ts`. What is proved
 * here is that a signed-in author reaches the screen, sees a fact's real
 * quotation and an interpretation told apart by more than color, sees a
 * legitimately empty section explained rather than left blank, and can
 * discover "point de vue" without leaving the page.
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

test("shows the empty state for a source text never analysed", async ({ page, context }) => {
  const session = await openSignedInSession();

  try {
    const project = await seedProjectWithSourceTextAndPlan(
      session.userId,
      "Pas encore analysé",
      "texte de depart",
    );
    await signIn(context, session);

    await page.goto(`/projects/${project.projectId}/analysis`);

    await expect(
      page.getByText("Aucune analyse n'a encore été réalisée pour ce texte source."),
    ).toBeVisible();
  } finally {
    await closeSignedInSession(session);
  }
});

test("presents facts and interpretations, told apart by more than color", async ({
  page,
  context,
}) => {
  const session = await openSignedInSession();

  try {
    const project = await seedProjectWithAnalysis(session.userId, "Diagnostic complet");
    await signIn(context, session);

    await page.goto(`/projects/${project.projectId}/analysis`);

    await expect(page.getByRole("heading", { name: "Résumé factuel" })).toBeVisible();
    await expect(
      page.getByText("Louise s'arrête au milieu d'un pont et observe la rivière."),
    ).toBeVisible();

    // A fact's real quotation from the source text.
    await expect(page.getByText("« Le vieux pont craquait sous chaque pas. »")).toBeVisible();

    // Both markers render as an icon plus a visible label, not as color alone.
    await expect(page.getByText("Fait", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Interprétation", { exact: true }).first()).toBeVisible();

    // A section with zero elements explains its own emptiness.
    await expect(page.getByRole("heading", { name: "Relations entre personnages" })).toBeVisible();
    await expect(
      page.getByText("Le texte n'établit pas de relation entre personnages."),
    ).toBeVisible();
  } finally {
    await closeSignedInSession(session);
  }
});

test("explains a specialised term on hover and on keyboard focus", async ({ page, context }) => {
  const session = await openSignedInSession();

  try {
    const project = await seedProjectWithAnalysis(session.userId, "Notions spécialisées");
    await signIn(context, session);

    await page.goto(`/projects/${project.projectId}/analysis`);

    const trigger = page.getByRole("button", { name: "Point de vue" });
    const hint = page.locator("#term-hint-point-de-vue");

    await expect(hint).toHaveCSS("opacity", "0");

    await trigger.hover();
    await expect(hint).toHaveCSS("opacity", "1");
    await expect(hint).toContainText("Qui raconte l'histoire");

    await page.mouse.move(0, 0);
    await expect(hint).toHaveCSS("opacity", "0");

    await trigger.focus();
    await expect(hint).toHaveCSS("opacity", "1");
  } finally {
    await closeSignedInSession(session);
  }
});

test("answers 404 for an analysis that is not yours", async ({ page, context }) => {
  const owner = await openSignedInSession();
  const intruder = await openSignedInSession();

  try {
    const project = await seedProjectWithChapters(owner.userId, "Projet d'un autre");
    await signIn(context, intruder);

    const response = await page.goto(`/projects/${project.projectId}/analysis`);

    expect(response?.status()).toBe(404);
  } finally {
    await closeSignedInSession(owner);
    await closeSignedInSession(intruder);
  }
});
