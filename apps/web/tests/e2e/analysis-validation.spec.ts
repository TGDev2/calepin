import { type BrowserContext, expect, test } from "@playwright/test";

import {
  closeSignedInSession,
  getProjectFields,
  openSignedInSession,
  seedProjectWithAnalysis,
  SESSION_COOKIE,
  setProjectStatus,
  type SignedInSession,
} from "../../../../test/e2e/session-fixture";

/**
 * CAL-074 in a browser: the explicit validation action, and the one promise
 * the backlog makes — *l'étape suivante est inaccessible tant que l'analyse
 * n'est pas validée*.
 *
 * The state machine itself is proved elsewhere (`packages/shared/src/
 * project-status/*.test.ts`, `test/integration/project-status.integration
 * .test.ts`) and the write against a real PostgreSQL is proved in
 * `test/integration/analysis-editing.integration.test.ts`. What this proves
 * is that a signed-in author can actually reach the button, that clicking it
 * locks the diagnostic on screen, and that the nine-step bar — reading the
 * live rows, not the cached column — moves "Exploration" from inaccessible to
 * current because of it.
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

test("validates the analysis, locks it, and unlocks the next step", async ({ page, context }) => {
  const session = await openSignedInSession();

  try {
    const project = await seedProjectWithAnalysis(session.userId, "Validation du diagnostic");
    // `seedProjectWithAnalysis` writes its rows directly and never refreshes
    // `Project.status` — it stays at the schema default, `DRAFT`. The status
    // machine only allows a legal one-step move, so the fixture is brought to
    // the stage the product's own writes would have left it at first.
    await setProjectStatus(project.projectId, "ANALYSIS_IN_PROGRESS");
    await signIn(context, session);

    await page.goto(`/projects/${project.projectId}`);

    const stepper = page.getByRole("list", { name: "Étapes du projet" });
    await expect(stepper.getByRole("listitem").filter({ hasText: "Exploration" })).toContainText(
      "Pas encore accessible",
    );

    await page.goto(`/projects/${project.projectId}/analysis`);

    const validate = page.getByRole("button", { name: "Valider l'analyse" });
    await expect(validate).toBeVisible();
    await validate.click();

    await expect(page.getByText(/Analyse validée le/)).toBeVisible();
    // The lock is real on screen, not only in the database: no section offers
    // an edit link any more.
    await expect(page.getByRole("link", { name: "Modifier" })).toHaveCount(0);

    const fields = await getProjectFields(project.projectId);
    expect(fields?.status).toBe("DIRECTION_TO_CHOOSE");

    await page.goto(`/projects/${project.projectId}`);
    await expect(stepper.getByRole("listitem").filter({ hasText: "Exploration" })).toHaveAttribute(
      "aria-current",
      "step",
    );
  } finally {
    await closeSignedInSession(session);
  }
});
