import { type BrowserContext, expect, test } from "@playwright/test";

import {
  closeSignedInSession,
  openSignedInSession,
  seedProjectWithDirections,
  seedProjectWithSourceTextAndPlan,
  SESSION_COOKIE,
  type SignedInSession,
} from "../../../../test/e2e/session-fixture";

/**
 * CAL-082 in a browser: three directions side by side, a divergent
 * narrative-engine axis flagged by more than color, a shared axis left
 * unflagged, a direction's argued critique, and a direction with no critique
 * yet saying so plainly.
 *
 * The read itself is proved against a real PostgreSQL by
 * `test/integration/direction-comparison.integration.test.ts`. What is proved
 * here is that a signed-in author reaches the screen, sees the comparison a
 * reader could actually use, and can move between directions with the
 * keyboard.
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

test("shows the empty state for a project with no proposed direction", async ({
  page,
  context,
}) => {
  const session = await openSignedInSession();

  try {
    const project = await seedProjectWithSourceTextAndPlan(
      session.userId,
      "Pas encore de direction",
      "texte de depart",
    );
    await signIn(context, session);

    await page.goto(`/projects/${project.projectId}/directions`);

    await expect(
      page.getByText("Aucune direction n'a encore été proposée pour ce projet."),
    ).toBeVisible();
  } finally {
    await closeSignedInSession(session);
  }
});

test("compares three directions, flags the axis that differs, and shows their critique", async ({
  page,
  context,
}) => {
  const session = await openSignedInSession();

  try {
    const project = await seedProjectWithDirections(session.userId, "Trois directions");
    await signIn(context, session);

    await page.goto(`/projects/${project.projectId}/directions`);

    // All three cards are present.
    await expect(page.getByRole("heading", { name: "Le fleuve remonté" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "L'orage annoncé" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Le silence du puits" })).toBeVisible();

    // The axis every direction differs on is flagged, more than once (once
    // per card) — `.first()` is enough to prove the flag renders at all.
    await expect(page.getByText("la nature du conflit (diffère des autres)").first()).toBeVisible();

    // The axis all three share is never flagged: its label renders on its
    // own, with no "(diffère des autres)" anywhere beside it.
    await expect(
      page.getByText("ce que le protagoniste risque", { exact: true }).first(),
    ).toBeVisible();
    await expect(page.getByText("ce que le protagoniste risque (diffère des autres)")).toHaveCount(
      0,
    );

    // A critique, argued and attached to a named element.
    await expect(
      page.getByText("La direction promet de tenir la tension jusqu'au dénouement.").first(),
    ).toBeVisible();

    // The source elements it keeps and transforms.
    await expect(page.getByText("Le décor du fleuve").first()).toBeVisible();
    await expect(page.getByText("Le dénouement").first()).toBeVisible();

    // The third direction has no critique yet, said plainly rather than left
    // blank.
    await expect(page.getByText("Critique non encore disponible.")).toBeVisible();

    // Keyboard: arrow right moves the roving tab stop to the next card.
    await page.getByRole("listitem").first().focus();
    await page.keyboard.press("ArrowRight");
    await expect(page.getByLabel("Direction 2 sur 3 : L'orage annoncé")).toBeFocused();
  } finally {
    await closeSignedInSession(session);
  }
});
