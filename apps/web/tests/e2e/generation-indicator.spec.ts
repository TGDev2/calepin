import { type BrowserContext, expect, type Page, test } from "@playwright/test";

import {
  closeSignedInSession,
  openSignedInSession,
  seedProjectWithChapters,
  seedRunningGeneration,
  SESSION_COOKIE,
  setGenerationProgress,
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

/**
 * CAL-062's progress stream. There is still no mission registry or worker to
 * drive real progress, so — exactly as the two tests above already do for
 * status — the row is written directly and the screen is watched: what is
 * under test is the SSE transport end to end, not a mission.
 */
test("shows the named step and percentage live, and keeps updating without a reload", async ({
  page,
  context,
}) => {
  const session = await openSignedInSession();

  try {
    const project = await seedProjectWithChapters(session.userId, "Projet avec progression");
    const generationId = await seedRunningGeneration(
      project.projectId,
      session.userId,
      "WRITE_SCENE",
    );
    await signIn(context, session);

    await page.goto(`/projects/${project.projectId}`);
    await expect(banner(page)).toBeVisible();

    // No step reported yet: the banner names only the mission.
    await expect(banner(page)).not.toContainText("Composition du contexte");

    await setGenerationProgress(generationId, { step: "Composition du contexte", percent: 20 });

    // The stream's own tick, not a reload — Playwright's retrying assertion
    // is well inside the 2 s poll interval by its default timeout.
    await expect(banner(page)).toContainText("Composition du contexte", { timeout: 10_000 });
    await expect(banner(page)).toContainText("20");

    // A second update supersedes the first — proof this is a live feed and
    // not a value read once.
    await setGenerationProgress(generationId, { step: "Rédaction en cours", percent: 65 });

    await expect(banner(page)).toContainText("Rédaction en cours", { timeout: 10_000 });
    await expect(banner(page)).toContainText("65");
    await expect(banner(page)).not.toContainText("Composition du contexte");
  } finally {
    await closeSignedInSession(session);
  }
});

test("restores the current progress after leaving the page and coming back", async ({
  page,
  context,
}) => {
  const session = await openSignedInSession();

  try {
    const project = await seedProjectWithChapters(session.userId, "Projet quitté et retrouvé");
    const generationId = await seedRunningGeneration(
      project.projectId,
      session.userId,
      "WRITE_SCENE",
    );
    await setGenerationProgress(generationId, { step: "Rédaction en cours", percent: 55 });
    await signIn(context, session);

    await page.goto(`/projects/${project.projectId}`);
    await expect(banner(page)).toContainText("Rédaction en cours");

    // The user leaves the project entirely — the task must not be affected,
    // since nothing about the browser touches the generation's own row.
    await page.goto("/");
    await expect(banner(page)).toHaveCount(0);

    // ...and comes back. The banner shows the *current* state at once, from
    // the page's own server render — no waiting for a poll tick.
    await page.goto(`/projects/${project.projectId}`);
    await expect(banner(page)).toContainText("Rédaction en cours");
    await expect(banner(page)).toContainText("55");
  } finally {
    await closeSignedInSession(session);
  }
});
