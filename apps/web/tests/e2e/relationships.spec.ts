import { type BrowserContext, expect, test } from "@playwright/test";

import {
  closeSignedInSession,
  openSignedInSession,
  seedProjectWithRelationships,
  SESSION_COOKIE,
  type SignedInSession,
} from "../../../../test/e2e/session-fixture";

/**
 * CAL-091 in a browser: the network of characters, and the thing a list could
 * not show — a tie one character declares and the other never answers.
 *
 * The writes themselves are proved against a real PostgreSQL by
 * `test/integration/relationship-graph.integration.test.ts`. What is proved
 * here is the journey: that the asymmetry is *visible*, that adding a tie adds
 * one direction and not two, and that removing one leaves the other standing.
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

test("shows a one-sided tie as an asymmetry rather than as a relationship", async ({
  page,
  context,
}) => {
  const session = await openSignedInSession();

  try {
    const project = await seedProjectWithRelationships(session.userId, "Réseau à lire");
    await signIn(context, session);

    await page.goto(`/projects/${project.projectId}/bible/relationships`);

    await expect(page.getByRole("heading", { name: "Réseau des personnages" })).toBeVisible();

    // The diagram is there, server-rendered, before any interaction.
    await expect(page.getByRole("img", { name: /Réseau des relations/ })).toBeVisible();

    // Alix and Bernard answer each other.
    const mutual = page
      .getByRole("listitem")
      .filter({ hasText: "Alix Renard & Bernard Coste" })
      .first();
    await expect(mutual.getByText("lien déclaré des deux côtés", { exact: true })).toBeVisible();

    // Alix declares a tie toward Camille; Camille declares nothing back — and
    // the page says so in those words rather than leaving it to be noticed.
    const oneSided = page
      .getByRole("listitem")
      .filter({ hasText: "Alix Renard & Camille Vasseur" })
      .first();
    await expect(oneSided.getByText("lien déclaré d'un seul côté")).toBeVisible();
    await expect(
      oneSided.getByText("rien n'est déclaré en retour", { exact: false }),
    ).toBeVisible();

    // Bernard and Camille both declare, but not the same tie.
    const divergent = page
      .getByRole("listitem")
      .filter({ hasText: "Bernard Coste & Camille Vasseur" })
      .first();
    await expect(
      divergent.getByText("lien déclaré des deux côtés, mais pas du même type"),
    ).toBeVisible();
  } finally {
    await closeSignedInSession(session);
  }
});

test("adds one direction only, and removing it leaves the other standing", async ({
  page,
  context,
}) => {
  const session = await openSignedInSession();

  try {
    const project = await seedProjectWithRelationships(session.userId, "Réseau à écrire");
    await signIn(context, session);

    await page.goto(`/projects/${project.projectId}/bible/relationships`);

    // Camille answers Alix at last — one row, in one direction.
    const form = page.getByRole("region", { name: "Ajouter un lien" });
    await page.getByLabel("De", { exact: true }).selectOption({ label: "Camille Vasseur" });
    await page.getByLabel("Vers", { exact: true }).selectOption({ label: "Alix Renard" });
    await form.getByLabel("Nature du lien").selectOption("HOSTILITY");
    await form.getByLabel("Libellé, depuis ce personnage").fill("adversaire de");
    await form.getByRole("button", { name: "Ajouter ce lien" }).click();

    const pair = page
      .getByRole("listitem")
      .filter({ hasText: "Alix Renard & Camille Vasseur" })
      .first();

    // Both sides now declare something, and they disagree about what.
    await expect(
      pair.getByText("lien déclaré des deux côtés, mais pas du même type"),
    ).toBeVisible();
    await expect(pair.getByText("adversaire de")).toBeVisible();
    await expect(pair.getByText("rivale de")).toBeVisible();

    // Removing Camille's direction leaves Alix's, and the pair is one-sided
    // again — nothing was mirrored, so nothing was lost with it.
    const camilleEdge = pair.getByRole("listitem").filter({ hasText: "adversaire de" }).first();
    await camilleEdge.getByText("Modifier ce lien").click();
    await camilleEdge.getByRole("button", { name: "Supprimer ce lien" }).click();

    await expect(pair.getByText("lien déclaré d'un seul côté")).toBeVisible();
    await expect(pair.getByText("rivale de")).toBeVisible();
  } finally {
    await closeSignedInSession(session);
  }
});
