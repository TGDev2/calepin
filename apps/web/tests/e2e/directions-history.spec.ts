import { type BrowserContext, expect, test } from "@playwright/test";

import {
  closeSignedInSession,
  openSignedInSession,
  seedProjectWithDirections,
  SESSION_COOKIE,
  type SignedInSession,
} from "../../../../test/e2e/session-fixture";

/**
 * CAL-087 in a browser: every direction the project has ever held stays
 * consultable, with its origin and its date, whatever happened to it since.
 *
 * The read itself is proved against a real PostgreSQL by
 * `test/integration/direction-comparison.integration.test.ts`
 * (`getDirectionsForComparison` already returns every row, standing and
 * discarded alike). What is proved here is that the comparison screen turns
 * that read into a single history a reader can trust: a direction that was
 * only ever proposed, one that was rewritten, one that was retained and one
 * that was written off all show up with what happened to them — and each
 * only with what actually happened, not with another's status.
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

test("keeps every direction consultable with its origin and what happened to it", async ({
  page,
  context,
}) => {
  const session = await openSignedInSession();

  try {
    const project = await seedProjectWithDirections(session.userId, "Historique des directions");
    await signIn(context, session);

    await page.goto(`/projects/${project.projectId}/directions`);

    const history = page.getByRole("region", { name: "Historique des directions" });

    // Nothing has happened yet: all three are simply proposed, and the history
    // already lists them with their origin and a creation date.
    const untouched = history.getByRole("listitem").filter({ hasText: "Le fleuve remonté" });
    await expect(untouched.getByText("Proposée", { exact: false })).toBeVisible();
    await expect(untouched.getByText("créée le", { exact: false })).toBeVisible();
    await expect(untouched.getByText("En comparaison")).toBeVisible();

    // Rewrite one direction by hand — its origin moves to "Modifiée".
    const editCard = page.getByRole("listitem").filter({ hasText: "Le fleuve remonté" }).first();
    await editCard.getByText("Modifier cette direction").click();
    await editCard.getByLabel("Titre de travail").fill("Le fleuve, réécrit");
    await editCard.getByRole("button", { name: /Enregistrer/ }).click();

    const edited = history.getByRole("listitem").filter({ hasText: "Le fleuve, réécrit" });
    await expect(edited.getByText("Modifiée", { exact: false })).toBeVisible();
    await expect(edited.getByText("Écartée le", { exact: false })).toHaveCount(0);

    // Retain one direction — its history entry says so, without borrowing the
    // grid's own "Direction canonique" badge text.
    const retainCard = page.getByRole("listitem").filter({ hasText: "L'orage annoncé" }).first();
    await retainCard.getByText("Retenir cette direction").click();
    await retainCard.getByRole("button", { name: "Retenir « L'orage annoncé »" }).click();

    const retained = history.getByRole("listitem").filter({ hasText: "L'orage annoncé" });
    await expect(retained.getByText("Direction retenue")).toBeVisible();
    await expect(retained.getByText("Écartée le", { exact: false })).toHaveCount(0);

    // Discard the last one, with a reason — it stays whole in the history.
    const discardCard = page
      .getByRole("listitem")
      .filter({ hasText: "Le silence du puits" })
      .first();
    await discardCard.getByText("Écarter cette direction").click();
    await discardCard
      .getByLabel("Pourquoi l'écartez-vous ? (facultatif)")
      .fill("Le silence ne portait pas assez l'intrigue.");
    await discardCard.getByRole("button", { name: "Écarter « Le silence du puits »" }).click();

    const discarded = history.getByRole("listitem").filter({ hasText: "Le silence du puits" });
    await expect(discarded.getByText("Écartée le", { exact: false })).toBeVisible();
    await expect(discarded.getByText("Le silence ne portait pas assez l'intrigue.")).toBeVisible();

    // Each entry carries only its own status — discarding one never touches
    // what the other two already show.
    await expect(edited.getByText("Écartée le", { exact: false })).toHaveCount(0);
    await expect(retained.getByText("Écartée le", { exact: false })).toHaveCount(0);
  } finally {
    await closeSignedInSession(session);
  }
});
