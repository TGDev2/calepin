import { type BrowserContext, expect, test } from "@playwright/test";

import {
  closeSignedInSession,
  openSignedInSession,
  seedProjectWithDirections,
  SESSION_COOKIE,
  type SignedInSession,
} from "../../../../test/e2e/session-fixture";

/**
 * CAL-085 in a browser: the author rewrites a proposed direction by hand, and
 * writes one entirely their own.
 *
 * The writes themselves are proved against a real PostgreSQL by
 * `test/integration/direction-edit.integration.test.ts`. What is proved here
 * is the journey — that the controls exist on the comparison screen, that a
 * rewrite is reflected with its origin now reading "Modifiée", and that a
 * direction written from scratch takes its place among the proposed ones
 * labelled "Rédigée par l'autrice ou l'auteur".
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

test("rewrites a proposed direction, and its origin reads Modifiée", async ({ page, context }) => {
  const session = await openSignedInSession();

  try {
    const project = await seedProjectWithDirections(session.userId, "Direction à modifier");
    await signIn(context, session);

    await page.goto(`/projects/${project.projectId}/directions`);

    const card = page.getByRole("listitem").filter({ hasText: "Le fleuve remonté" }).first();
    await expect(card.getByText("Roman contemporain · Proposée")).toBeVisible();

    await card.getByText("Modifier cette direction").click();

    const title = card.getByLabel("Titre de travail");
    await title.fill("Le fleuve, réécrit");

    await card.getByRole("button", { name: /Enregistrer/ }).click();

    const updated = page.getByRole("listitem").filter({ hasText: "Le fleuve, réécrit" }).first();
    await expect(updated.getByRole("heading", { name: "Le fleuve, réécrit" })).toBeVisible();
    await expect(updated.getByText("Roman contemporain · Modifiée")).toBeVisible();
  } finally {
    await closeSignedInSession(session);
  }
});

test("writes a direction entirely from scratch, and it joins the comparison", async ({
  page,
  context,
}) => {
  const session = await openSignedInSession();

  try {
    const project = await seedProjectWithDirections(session.userId, "Direction écrite à la main");
    await signIn(context, session);

    await page.goto(`/projects/${project.projectId}/directions`);

    await page.getByText("Écrire ma propre direction").click();

    const form = page.locator("form").filter({ hasText: "Ajouter cette direction" });

    await form.getByLabel("Titre de travail").fill("Ma direction personnelle");
    await form.getByLabel("Genre dominant").fill("Roman noir");
    await form
      .getByLabel("Prémisse développée")
      .fill("Une prémisse entièrement rédigée par l'autrice, sans passer par une proposition.");
    await form.getByLabel("Conflit principal").fill("Un conflit rédigé à la main.");
    await form.getByLabel("Trajectoire du protagoniste").fill("Une trajectoire rédigée à la main.");
    await form.getByLabel("Nature de la fin").fill("Une fin rédigée à la main.");
    await form.getByLabel("Nouveaux enjeux").fill("Premier enjeu\nDeuxième enjeu");
    await form.getByLabel("Risques principaux").fill("Premier risque\nDeuxième risque");
    await form
      .getByLabel("Éléments conservés du texte source")
      .fill("Premier élément conservé\nDeuxième élément conservé");
    await form.getByLabel("Éléments transformés").fill("Un élément transformé");
    await form
      .getByLabel("Évaluation du potentiel romanesque")
      .fill("Une évaluation rédigée à la main.");

    for (const label of [
      "la nature du conflit",
      "la source de la tension",
      "ce que le protagoniste risque",
      "ce qui provoque le basculement",
      "la nature de la résolution",
    ]) {
      await form.getByLabel(label).selectOption({ index: 1 });
    }

    await form.getByRole("button", { name: "Ajouter cette direction" }).click();

    const created = page
      .getByRole("listitem")
      .filter({ hasText: "Ma direction personnelle" })
      .first();
    await expect(created.getByRole("heading", { name: "Ma direction personnelle" })).toBeVisible();
    await expect(
      created.getByText("Rédigée par l'autrice ou l'auteur", { exact: false }),
    ).toBeVisible();
  } finally {
    await closeSignedInSession(session);
  }
});
