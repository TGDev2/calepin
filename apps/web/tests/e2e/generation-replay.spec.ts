import { type BrowserContext, expect, type Page, test } from "@playwright/test";

import {
  closeSignedInSession,
  openSignedInSession,
  readGenerationState,
  seedFailedGeneration,
  seedProjectWithChapters,
  SESSION_COOKIE,
  type SignedInSession,
} from "../../../../test/e2e/session-fixture";

/**
 * CAL-063's acceptance criterion, in a browser: **a failed generation is
 * replayable from the interface without losing the last valid version.**
 *
 * There is still no mission registry (CAL-048) or executor to *produce* a
 * failure, so the row is seeded — the same "seed the effect, drive the screen"
 * shape `generation-indicator.spec.ts` and `project-actions.spec.ts` already use
 * for states no in-app action can reach yet. What is genuinely under test is
 * everything after that: the panel renders a French reason, the form posts to the
 * real server action, and the **row moves**.
 *
 * The oracle is the row rather than the banner. A banner disappearing is what a
 * successful replay looks like, and it is also what a page that failed to render
 * looks like.
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

function panel(page: Page) {
  return page.getByRole("region", { name: /Génération(s?) en échec/ });
}

test("replays a failed generation from the project page", async ({ page, context }) => {
  const session = await openSignedInSession();

  try {
    const project = await seedProjectWithChapters(session.userId, "Projet à relancer");
    const generationId = await seedFailedGeneration(
      project.projectId,
      session.userId,
      "WRITE_SCENE",
      { errorCode: "MODEL_OUTPUT_OFF_TOPIC", errorCategory: "PROVIDER" },
    );
    await signIn(context, session);

    await page.goto(`/projects/${project.projectId}`);

    // The reason, in French, with no code in sight (§7, §9).
    await expect(panel(page)).toBeVisible();
    await expect(panel(page)).toContainText("Rédaction d");
    await expect(panel(page)).toContainText("1 tentative");
    await expect(panel(page)).toContainText("n'a pas répondu à la demande");
    await expect(panel(page)).not.toContainText("MODEL_OUTPUT_OFF_TOPIC");

    await panel(page).getByRole("button", { name: "Relancer" }).click();

    // The row is what had to move: queued again, with a raised ceiling so the
    // reconciliation sweep does not close it a minute later.
    await expect
      .poll(async () => (await readGenerationState(generationId)).status, { timeout: 15_000 })
      .toBe("QUEUED");
    expect((await readGenerationState(generationId)).attemptCeiling).toBeGreaterThan(1);

    // And the screen agrees: the generation is no longer in the failure list,
    // because it is in flight again.
    await expect(panel(page)).toBeHidden();
  } finally {
    await closeSignedInSession(session);
  }
});

test("shows no failure panel on a project whose generations are all fine", async ({
  page,
  context,
}) => {
  const session = await openSignedInSession();

  try {
    const project = await seedProjectWithChapters(session.userId, "Projet sans échec");
    await signIn(context, session);

    await page.goto(`/projects/${project.projectId}`);

    await expect(panel(page)).toHaveCount(0);
  } finally {
    await closeSignedInSession(session);
  }
});

/**
 * A generation the reconciliation sweep gave up on, which is the failure an
 * author is most likely to meet: the code is `GENERATION_ATTEMPTS_EXHAUSTED`
 * rather than a provider's, so the sentence has to come from the per-code table
 * and say that Calepin stopped on purpose — not merely that something broke.
 *
 * **There is no JavaScript-disabled case here, and that is a finding rather than
 * an omission.** The control itself is a plain form posting to a server action,
 * so nothing about it needs a browser to have run; but `/projects/[projectId]`
 * renders its whole body inside a `<Suspense>` boundary (CAL-039's fix, which
 * keeps the ownership `notFound()` from being locked to a 200 by streaming), and
 * without JavaScript the streamed replacement never swaps the skeleton out. A
 * no-JS spec here therefore fails on the *page*, not on this feature, and
 * asserting otherwise would be asserting something the route has never done.
 * `generation-failure-list.test.tsx` pins the progressive-enhancement half — a
 * real `<form>` carrying both identifiers and no client handler.
 */
test("names the reason when the sweep gave up after several attempts", async ({
  page,
  context,
}) => {
  const session = await openSignedInSession();

  try {
    const project = await seedProjectWithChapters(session.userId, "Projet épuisé");
    const generationId = await seedFailedGeneration(
      project.projectId,
      session.userId,
      "ANALYZE_SOURCE_TEXT",
      { errorCode: "GENERATION_ATTEMPTS_EXHAUSTED", errorCategory: "INTERNAL" },
    );
    await signIn(context, session);

    await page.goto(`/projects/${project.projectId}`);

    await expect(panel(page)).toContainText("tentatives automatiques");
    await expect(panel(page)).toContainText("Votre projet est intact");

    await panel(page).getByRole("button", { name: "Relancer" }).click();

    await expect
      .poll(async () => (await readGenerationState(generationId)).status, { timeout: 15_000 })
      .toBe("QUEUED");
  } finally {
    await closeSignedInSession(session);
  }
});
