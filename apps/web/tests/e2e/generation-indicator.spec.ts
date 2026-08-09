import { type BrowserContext, expect, type Page, test } from "@playwright/test";

import {
  closeSignedInSession,
  openSignedInSession,
  seedProjectWithChapters,
  seedRunningGeneration,
  SESSION_COOKIE,
  setGenerationStatus,
  type SignedInSession,
} from "../../../../test/e2e/session-fixture";

/**
 * CAL-039's persistent generation indicator, in a browser.
 *
 * There is no mission registry (`@calepin/ai`, CAL-048) or worker (CAL-060)
 * yet to drive a real generation, so the row this spec reads is written
 * directly — the same "seed the effect, drive the screen" shape
 * `project-actions.spec.ts` already uses for statuses no in-app action can
 * reach. What is under test is the read path end to end: the project page
 * shows a generation in flight, and its own poll — not a page reload —
 * notices when it finishes.
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

function banner(page: Page) {
  return page.locator("[role='status']").filter({ hasText: "Génération en cours" });
}

test("shows a generation in flight and clears it once the poll sees it finish", async ({
  page,
  context,
}) => {
  const session = await openSignedInSession();

  try {
    const project = await seedProjectWithChapters(session.userId, "Projet en génération");
    const generationId = await seedRunningGeneration(
      project.projectId,
      session.userId,
      "WRITE_SCENE",
    );
    await signIn(context, session);

    await page.goto(`/projects/${project.projectId}`);

    await expect(banner(page)).toBeVisible();
    await expect(banner(page)).toContainText("Rédaction d");

    await setGenerationStatus(generationId, "SUCCEEDED");

    // The poll, not a reload: the indicator clears on its own once it next
    // asks the server, well inside Playwright's own retrying assertion.
    await expect(banner(page)).toBeHidden({ timeout: 10_000 });
  } finally {
    await closeSignedInSession(session);
  }
});

test("shows nothing on a project with no generation in flight", async ({ page, context }) => {
  const session = await openSignedInSession();

  try {
    const project = await seedProjectWithChapters(session.userId, "Projet sans génération");
    await signIn(context, session);

    await page.goto(`/projects/${project.projectId}`);

    await expect(banner(page)).toBeHidden();
  } finally {
    await closeSignedInSession(session);
  }
});
