import { type BrowserContext, expect, test } from "@playwright/test";

import {
  closeSignedInSession,
  openSignedInSession,
  seedProjectWithDirections,
  SESSION_COOKIE,
  type SignedInSession,
} from "../../../../test/e2e/session-fixture";

/**
 * CAL-086 in a browser: the author retains one of the three proposed
 * directions, the project moves to *Bible à valider*, and only that direction
 * carries the badge.
 *
 * The write, the single-canonical invariant and the obsolescence report are
 * proved against a real PostgreSQL by
 * `test/integration/direction-canonical.integration.test.ts`. What is proved
 * here is the journey: that the control exists on each card, that it is absent
 * on the one already retained, and that the choice reaches the project screen
 * as a status rather than as a message about a status.
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

test("retains one direction and moves the project to the bible stage", async ({
  page,
  context,
}) => {
  const session = await openSignedInSession();

  try {
    const project = await seedProjectWithDirections(session.userId, "Direction à retenir");
    await signIn(context, session);

    await page.goto(`/projects/${project.projectId}/directions`);

    // Nothing is retained yet, so no card carries the badge.
    await expect(page.getByText("Direction canonique")).toHaveCount(0);

    const card = page.getByRole("listitem").filter({ hasText: "L'orage annoncé" }).first();
    await card.getByText("Retenir cette direction").click();
    await card.getByRole("button", { name: "Retenir « L'orage annoncé »" }).click();

    // The badge lands on the chosen direction, and on it alone.
    await expect(page.getByText("Direction canonique")).toHaveCount(1);
    const retained = page.getByRole("listitem").filter({ hasText: "L'orage annoncé" }).first();
    await expect(retained.getByText("Direction canonique")).toBeVisible();

    // Its own card no longer offers to retain it, and no longer offers to
    // write it off either — the two rules meet on the same card.
    await expect(retained.getByText("Retenir cette direction")).toHaveCount(0);
    await expect(retained.getByText("Écarter cette direction")).toHaveCount(0);

    // The other two still offer the choice.
    const other = page.getByRole("listitem").filter({ hasText: "Le fleuve remonté" }).first();
    await expect(other.getByText("Retenir cette direction")).toBeVisible();

    // And the status the choice implies is on the project screen, derived from
    // the row rather than announced by the action.
    await page.goto(`/projects/${project.projectId}`);
    // Scoped to `main`: the project page streams its body behind a Suspense
    // boundary, so the fallback and the settled content both carry the status
    // for an instant and an unscoped locator trips strict mode.
    await expect(page.getByRole("main").getByText("Bible à valider")).toBeVisible();
  } finally {
    await closeSignedInSession(session);
  }
});

test("changes the retained direction, and warns about nothing when nothing was built", async ({
  page,
  context,
}) => {
  const session = await openSignedInSession();

  try {
    const project = await seedProjectWithDirections(session.userId, "Changement de direction");
    await signIn(context, session);

    await page.goto(`/projects/${project.projectId}/directions`);

    const first = page.getByRole("listitem").filter({ hasText: "Le fleuve remonté" }).first();
    await first.getByText("Retenir cette direction").click();
    await first.getByRole("button", { name: "Retenir « Le fleuve remonté »" }).click();

    await expect(page.getByText("Direction canonique")).toHaveCount(1);

    // This project holds no bible, no plan and no chapter, so the change asks
    // for no confirmation — the warning appears when there is something to warn
    // about, which is what keeps it meaningful.
    const second = page.getByRole("listitem").filter({ hasText: "Le silence du puits" }).first();
    await second.getByText("Retenir cette direction").click();
    await expect(second.getByText("J'ai lu ce qui sera à revoir")).toHaveCount(0);
    await second.getByRole("button", { name: "Retenir « Le silence du puits »" }).click();

    // Still exactly one, and it is the new one.
    await expect(page.getByText("Direction canonique")).toHaveCount(1);
    const retained = page.getByRole("listitem").filter({ hasText: "Le silence du puits" }).first();
    await expect(retained.getByText("Direction canonique")).toBeVisible();

    // The one it replaced is untouched and still on screen, and its history
    // entry carries no discard marker: replacing is not discarding.
    const grid = page.getByRole("list", { name: "Directions proposées" });
    await expect(grid.getByRole("heading", { name: "Le fleuve remonté" })).toBeVisible();
    const history = page.getByRole("region", { name: "Historique des directions" });
    const replaced = history.getByRole("listitem").filter({ hasText: "Le fleuve remonté" });
    await expect(replaced.getByText("Écartée le", { exact: false })).toHaveCount(0);
  } finally {
    await closeSignedInSession(session);
  }
});
