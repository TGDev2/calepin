import { type BrowserContext, expect, type Page, test } from "@playwright/test";

import {
  closeSignedInSession,
  openSignedInSession,
  readGenerationState,
  seedProjectWithChapters,
  seedRunningGeneration,
  SESSION_COOKIE,
  setGenerationStatus,
  type SignedInSession,
} from "../../../../test/e2e/session-fixture";

/**
 * CAL-064's interface half, in a browser: **a generation in flight can be
 * stopped from the screen it is displayed on.**
 *
 * The rest of the chain — the worker, the abort, the untouched chapter — is
 * proved against a real Postgres and a real Redis in
 * `test/integration/generation-cancellation.integration.test.ts`, because a
 * browser cannot observe an `AbortSignal` inside a worker process. What this
 * spec owns is the part only a browser can answer: the control exists where a
 * running generation is shown, it posts to the real server action, and the row
 * moves.
 *
 * The oracle is the row rather than the banner, the same choice
 * `generation-replay.spec.ts` made: a banner disappearing is what a successful
 * cancellation looks like, and it is also what a page that failed to render
 * looks like.
 *
 * **No JavaScript-disabled case, for the reason CAL-063 already recorded** —
 * `/projects/[projectId]` renders inside a `<Suspense>` boundary and the
 * streamed replacement never swaps the skeleton out without a browser. The
 * progressive-enhancement half is pinned in `generation-indicator.test.tsx`.
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
  return page.getByRole("status");
}

test("cancels a running generation from the project page", async ({ page, context }) => {
  const session = await openSignedInSession();

  try {
    const project = await seedProjectWithChapters(session.userId, "Projet à annuler");
    const generationId = await seedRunningGeneration(
      project.projectId,
      session.userId,
      "WRITE_SCENE",
    );
    await signIn(context, session);

    await page.goto(`/projects/${project.projectId}`);

    await expect(banner(page)).toBeVisible();
    await expect(banner(page)).toContainText("Génération en cours");

    await banner(page).getByRole("button", { name: "Annuler" }).click();

    // The row is what had to move, and it had to move all the way: cancelled is
    // terminal, so nothing redelivers it and nothing charges for it again.
    await expect
      .poll(async () => (await readGenerationState(generationId)).status, { timeout: 15_000 })
      .toBe("CANCELLED");

    // And the screen agrees, on its own, through the stream: a cancelled
    // generation is neither running nor a failure to fix.
    await expect(banner(page)).toBeHidden();
  } finally {
    await closeSignedInSession(session);
  }
});

/**
 * A generation that finished between the render and the click. The screen was
 * stale, not broken, so the answer is the `cancellation` reason code and its own
 * French sentence — not the replay's, which would tell a reader who pressed
 * *Annuler* that something "n'est plus en échec".
 */
test("says so when the generation finished before the click landed", async ({ page, context }) => {
  const session = await openSignedInSession();

  try {
    const project = await seedProjectWithChapters(session.userId, "Projet déjà terminé");
    const generationId = await seedRunningGeneration(
      project.projectId,
      session.userId,
      "ANALYZE_SOURCE_TEXT",
    );
    await signIn(context, session);

    await page.goto(`/projects/${project.projectId}`);
    await expect(banner(page)).toBeVisible();

    // Behind the reader's back, exactly as a worker finishing would.
    await setGenerationStatus(generationId, "SUCCEEDED");

    await banner(page).getByRole("button", { name: "Annuler" }).click();

    await expect(page.getByText("Cette génération est déjà terminée")).toBeVisible();
    expect((await readGenerationState(generationId)).status).toBe("SUCCEEDED");
  } finally {
    await closeSignedInSession(session);
  }
});

test("shows no indicator on a project with nothing in flight", async ({ page, context }) => {
  const session = await openSignedInSession();

  try {
    const project = await seedProjectWithChapters(session.userId, "Projet au repos");
    await signIn(context, session);

    await page.goto(`/projects/${project.projectId}`);

    await expect(banner(page)).toHaveCount(0);
  } finally {
    await closeSignedInSession(session);
  }
});
