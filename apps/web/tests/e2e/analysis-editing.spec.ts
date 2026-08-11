import { type BrowserContext, expect, test } from "@playwright/test";

import {
  closeSignedInSession,
  openSignedInSession,
  seedProjectWithAnalysis,
  SESSION_COOKIE,
  type SignedInSession,
} from "../../../../test/e2e/session-fixture";

/**
 * CAL-073 in a browser: editing one section, annotating one element, and the
 * one promise the backlog makes — *l'origine de chaque élément reste lisible
 * après édition*.
 *
 * The rules are proved elsewhere and are not re-proved here: the pure ones in
 * `packages/shared/src/provenance/provenance.test.ts`, the persisted ones
 * against a real PostgreSQL in
 * `test/integration/analysis-editing.integration.test.ts`. What this proves is
 * that a signed-in author can actually do it, and that the markers on screen
 * say what the database says afterwards.
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

test("keeps the origin of each element readable after an edit", async ({ page, context }) => {
  const session = await openSignedInSession();

  try {
    const project = await seedProjectWithAnalysis(session.userId, "Édition du diagnostic");
    await signIn(context, session);

    await page.goto(`/projects/${project.projectId}/analysis`);

    const themes = page.locator("#section-THEMES");
    await expect(themes.getByText("Proposition du modèle").first()).toBeVisible();

    await themes.getByRole("link", { name: "Modifier" }).click();

    // The seeded THEMES section holds two generated elements. The first is left
    // exactly as it is; the second is rewritten; a third is added.
    const statements = page.getByLabel("Énoncé");
    await statements.nth(1).fill("Le passage suggère surtout une hésitation.");
    await page.getByLabel("Intitulé").nth(2).fill("La rivière");
    await statements.nth(2).fill("Un troisième thème, écrit par l'auteur.");

    await page.getByRole("button", { name: "Enregistrer cette section" }).click();

    const saved = page.locator("#section-THEMES");
    await expect(saved.getByRole("link", { name: "Modifier" })).toBeVisible();

    // Three markers, one per element, in the order the section holds them: the
    // untouched proposal now reads as validated, the rewritten one as the
    // author's modification, the new one as theirs outright.
    const items = saved.locator("li").filter({ has: page.getByText("Le pont") });
    await expect(items.first()).toContainText("Élément validé");
    await expect(saved).toContainText("Modification manuelle");
    await expect(saved).toContainText("Rédigé par vous");

    // And the untouched element still shows the model's own words.
    await expect(saved).toContainText("Le texte insiste sur l'état vétuste du pont.");
  } finally {
    await closeSignedInSession(session);
  }
});

test("refuses an edit the section's own rules forbid, without losing what was typed", async ({
  page,
  context,
}) => {
  const session = await openSignedInSession();

  try {
    const project = await seedProjectWithAnalysis(session.userId, "Refus d'édition");
    await signIn(context, session);

    await page.goto(`/projects/${project.projectId}/analysis?edit=THEMES#section-THEMES`);

    const labels = page.getByLabel("Intitulé");
    const statements = page.getByLabel("Énoncé");

    // A theme with no heading: the section's schema requires one.
    await labels.first().fill("");
    await statements.first().fill("Un énoncé que je ne veux pas perdre.");

    await page.getByRole("button", { name: "Enregistrer cette section" }).click();

    await expect(page.getByRole("alert")).toBeVisible();
    // The refusal did not empty the form.
    await expect(statements.first()).toHaveValue("Un énoncé que je ne veux pas perdre.");
  } finally {
    await closeSignedInSession(session);
  }
});

test("annotates an element, and keeps the note after the section is rewritten", async ({
  page,
  context,
}) => {
  const session = await openSignedInSession();

  try {
    const project = await seedProjectWithAnalysis(session.userId, "Annotation");
    await signIn(context, session);

    await page.goto(`/projects/${project.projectId}/analysis`);

    const themes = page.locator("#section-THEMES");
    await themes.getByRole("link", { name: "Annoter" }).first().click();

    await page.getByLabel("Votre note sur cet élément").fill("À garder pour le chapitre 3.");
    await page.getByRole("button", { name: "Enregistrer la note" }).click();

    await expect(page.locator("#section-THEMES")).toContainText("À garder pour le chapitre 3.");

    // Now rewrite the section around it: the note is attached to the element's
    // lineage, so replacing every row of the revision must not take it away.
    await page
      .locator("#section-THEMES")
      .getByRole("link", { name: "Modifier", exact: true })
      .click();
    await page.getByLabel("Énoncé").nth(1).fill("Une autre lecture du même passage.");
    await page.getByRole("button", { name: "Enregistrer cette section" }).click();

    await expect(page.locator("#section-THEMES")).toContainText("À garder pour le chapitre 3.");
  } finally {
    await closeSignedInSession(session);
  }
});

test("rewrites and removes a note", async ({ page, context }) => {
  const session = await openSignedInSession();

  try {
    const project = await seedProjectWithAnalysis(session.userId, "Note modifiable");
    await signIn(context, session);

    await page.goto(`/projects/${project.projectId}/analysis`);

    const themes = () => page.locator("#section-THEMES");
    await themes().getByRole("link", { name: "Annoter" }).first().click();
    await page.getByLabel("Votre note sur cet élément").fill("Première version.");
    await page.getByRole("button", { name: "Enregistrer la note" }).click();

    await themes().getByRole("link", { name: "Modifier la note" }).click();
    await page.getByLabel("Votre note sur cet élément").fill("Deuxième version.");
    await page.getByRole("button", { name: "Enregistrer la note" }).click();

    await expect(themes()).toContainText("Deuxième version.");
    await expect(themes()).not.toContainText("Première version.");

    await themes().getByRole("button", { name: "Supprimer la note" }).click();

    await expect(themes()).not.toContainText("Deuxième version.");
  } finally {
    await closeSignedInSession(session);
  }
});
