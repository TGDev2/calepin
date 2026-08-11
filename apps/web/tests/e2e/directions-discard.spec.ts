import { type BrowserContext, expect, test } from "@playwright/test";

import {
  closeSignedInSession,
  openSignedInSession,
  seedProjectWithDirections,
  SESSION_COOKIE,
  type SignedInSession,
} from "../../../../test/e2e/session-fixture";

/**
 * CAL-083 in a browser: the author writes one of the three proposed directions
 * off, says why, and finds it afterwards under « Historique des directions »
 * with what they wrote.
 *
 * The write itself is proved against a real PostgreSQL by
 * `test/integration/direction-discard.integration.test.ts`. What is proved
 * here is the journey the backlog describes — that the control exists, that
 * the reason reaches the screen it is shown back on, and that *reste
 * consultable* is true of the page and not only of the row.
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

test("writes one direction off with a reason, and keeps it consultable", async ({
  page,
  context,
}) => {
  const session = await openSignedInSession();

  try {
    const project = await seedProjectWithDirections(session.userId, "Direction à écarter");
    await signIn(context, session);

    await page.goto(`/projects/${project.projectId}/directions`);

    const grid = page.getByRole("list", { name: "Directions proposées" });
    await expect(grid.getByRole("heading", { name: "L'orage annoncé" })).toBeVisible();
    const historyBefore = page.getByRole("region", { name: "Historique des directions" });
    await expect(historyBefore.getByText("Écartée le", { exact: false })).toHaveCount(0);

    // The control is behind a disclosure on the card it belongs to.
    const card = page.getByRole("listitem").filter({ hasText: "L'orage annoncé" }).first();
    await card.getByText("Écarter cette direction").click();
    await card
      .getByLabel("Pourquoi l'écartez-vous ? (facultatif)")
      .fill("Le conflit social recouvre le personnage.");
    await card.getByRole("button", { name: "Écarter « L'orage annoncé »" }).click();

    // It leaves the comparison…
    await expect(grid.getByRole("heading", { name: "Le fleuve remonté" })).toBeVisible();
    await expect(grid.getByRole("heading", { name: "Le silence du puits" })).toBeVisible();
    await expect(
      page.getByRole("listitem").filter({ hasText: "Écarter « L'orage annoncé »" }),
    ).toHaveCount(0);

    // …and appears in the history, whole, with what the author wrote.
    const history = page.getByRole("region", { name: "Historique des directions" });
    await expect(history.getByRole("heading", { name: "L'orage annoncé" })).toBeVisible();
    await expect(history.getByText("Le conflit social recouvre le personnage.")).toBeVisible();
    await expect(history.getByText("un ordre collectif", { exact: false })).toBeVisible();
  } finally {
    await closeSignedInSession(session);
  }
});

test("writes a direction off without a reason, and says so", async ({ page, context }) => {
  const session = await openSignedInSession();

  try {
    const project = await seedProjectWithDirections(session.userId, "Écartée sans commentaire");
    await signIn(context, session);

    await page.goto(`/projects/${project.projectId}/directions`);

    const card = page.getByRole("listitem").filter({ hasText: "Le silence du puits" }).first();
    await card.getByText("Écarter cette direction").click();
    await card.getByRole("button", { name: "Écarter « Le silence du puits »" }).click();

    const history = page.getByRole("region", { name: "Historique des directions" });
    await expect(history.getByRole("heading", { name: "Le silence du puits" })).toBeVisible();
    await expect(history.getByText("Écartée sans commentaire.")).toBeVisible();
  } finally {
    await closeSignedInSession(session);
  }
});

// The roving tabindex owns the card; the textarea inside it owns its own keys.
test("leaves the arrow keys to the reason field", async ({ page, context }) => {
  const session = await openSignedInSession();

  try {
    const project = await seedProjectWithDirections(session.userId, "Clavier dans le formulaire");
    await signIn(context, session);

    await page.goto(`/projects/${project.projectId}/directions`);

    const card = page.getByRole("listitem").filter({ hasText: "Le fleuve remonté" }).first();
    await card.getByText("Écarter cette direction").click();

    const reason = card.getByLabel("Pourquoi l'écartez-vous ? (facultatif)");
    await reason.fill("Deux lignes");
    await reason.press("ArrowLeft");

    await expect(reason).toBeFocused();
  } finally {
    await closeSignedInSession(session);
  }
});
