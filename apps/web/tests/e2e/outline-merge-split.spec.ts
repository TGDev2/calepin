import { type BrowserContext, expect, type Page, test } from "@playwright/test";

import {
  closeSignedInSession,
  openSignedInSession,
  readChapterOrder,
  seedProjectWithReorderablePlan,
  SESSION_COOKIE,
  type SignedInSession,
} from "../../../../test/e2e/session-fixture";

/**
 * CAL-106 in a browser: a chapter absorbs the one after it, and one chapter is
 * cut in two through the arbitration screen.
 *
 * That nothing is lost either way is proved against a real PostgreSQL by
 * `test/integration/chapter-merge-split.integration.test.ts`, which runs the
 * whole cycle and compares a census of the plan. What is proved here is what
 * only a browser can say: that the controls exist, that the arbitration form
 * refuses to submit a redistribution leaving something behind, and that what
 * the screen shows afterwards is what the database holds — which is why every
 * case ends on `readChapterOrder`.
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

function chapterRows(page: Page) {
  return page.locator('[role="treeitem"][aria-level="2"]');
}

/**
 * `pnpm test:e2e` drives `next dev`, which compiles a route the first time
 * anything asks for it. The arbitration screen is this spec's alone, so under
 * the full suite's six workers that compile lands in the middle of a busy
 * server. Absorbed once, here, rather than by raising the timeout of assertions
 * that are about the product.
 */
const FIRST_COMPILE_MS = 60_000;

async function openSplitScreen(page: Page, chapterNumber: number): Promise<void> {
  await page.getByRole("link", { name: `Scinder le chapitre ${String(chapterNumber)}` }).click();

  await expect(
    page.getByRole("heading", { name: `Scinder le chapitre ${String(chapterNumber)}` }),
  ).toBeVisible({ timeout: FIRST_COMPILE_MS });

  // The heading is server-rendered, so seeing it says nothing about the form
  // being interactive. Under the full suite the dev server is still building
  // and sending this route's client chunks well after the HTML has landed, and
  // a `fill` that arrives first sets a DOM value React never sees. `networkidle`
  // is the honest observable for *the chunks have arrived*; there is no
  // hydration event to key on.
  await page.waitForLoadState("networkidle", { timeout: FIRST_COMPILE_MS });
}

/**
 * Retries an interaction until the page acts on it.
 *
 * The arbitration form is server-rendered before it is hydrated, and under the
 * full suite's load that gap is seconds wide: a `fill` that lands first sets
 * the DOM value with no React handler attached, so the state never moves and
 * every later assertion waits on a screen that will never change. Waiting for
 * *hydration* has no honest signal to key on; waiting for the interaction to
 * take does, and `toPass` is the tool for it. Both places this is used are
 * about what the form computes, never about how fast it does.
 */
async function untilItTakes(body: () => Promise<void>): Promise<void> {
  await expect(body).toPass({ timeout: FIRST_COMPILE_MS });
}

test("merges a chapter with the one after it, and the plan loses a row", async ({
  page,
  context,
}) => {
  const session = await openSignedInSession();

  try {
    const plan = await seedProjectWithReorderablePlan(session.userId, "Plan à fusionner");
    await signIn(context, session);

    const before = await readChapterOrder(plan.projectId);
    expect(before).toHaveLength(6);

    await page.goto(`/projects/${plan.projectId}/outline`);
    await expect(chapterRows(page)).toHaveCount(6);

    await page.getByRole("button", { name: "Fusionner le chapitre 1 avec le suivant" }).click();

    // The fixture's chapters agree on everything a merge cannot join, so the
    // write goes through on the first attempt with nothing to acknowledge.
    await expect(chapterRows(page)).toHaveCount(5);
    await expect(page.getByRole("status")).toContainText("Chapitres fusionnés");

    const after = await readChapterOrder(plan.projectId);
    expect(after).toHaveLength(5);
    expect(after).toEqual(before.filter((id) => id !== before[1]));

    // The surviving chapter carries both working titles, joined rather than
    // picked between.
    await expect(chapterRows(page).first()).toContainText("Chapitre repère 1");
    await expect(chapterRows(page).first()).toContainText("Chapitre repère 2");
  } finally {
    await closeSignedInSession(session);
  }
});

test("offers no merge to the chapter that closes its part", async ({ page, context }) => {
  const session = await openSignedInSession();

  try {
    const plan = await seedProjectWithReorderablePlan(session.userId, "Plan aux bords");
    await signIn(context, session);

    await page.goto(`/projects/${plan.projectId}/outline`);

    // Chapter 3 closes part 1 and chapter 6 closes part 2 and the novel:
    // merging across a part boundary is refused by the domain, so the control
    // is disabled rather than offered and then rejected.
    await expect(
      page.getByRole("button", { name: "Fusionner le chapitre 3 avec le suivant" }),
    ).toBeDisabled();
    await expect(
      page.getByRole("button", { name: "Fusionner le chapitre 6 avec le suivant" }),
    ).toBeDisabled();
    await expect(
      page.getByRole("button", { name: "Fusionner le chapitre 2 avec le suivant" }),
    ).toBeEnabled();
  } finally {
    await closeSignedInSession(session);
  }
});

test("splits a chapter through the arbitration screen, and the plan gains a row", async ({
  page,
  context,
}) => {
  const session = await openSignedInSession();

  try {
    const plan = await seedProjectWithReorderablePlan(session.userId, "Plan à scinder");
    await signIn(context, session);

    const before = await readChapterOrder(plan.projectId);

    await page.goto(`/projects/${plan.projectId}/outline`);
    await openSplitScreen(page, 2);

    // The form opens on a redistribution that keeps everything, so the author
    // narrows from a valid state rather than climbing out of an invalid one.
    await expect(page.getByRole("status")).toContainText("Rien n'est perdu");

    await untilItTakes(async () => {
      await page.getByRole("button", { name: "Scinder le chapitre" }).click();
      await expect(page).toHaveURL(new RegExp(`/projects/${plan.projectId}/outline$`), {
        timeout: 2_000,
      });
    });
    await expect(chapterRows(page)).toHaveCount(7);

    const after = await readChapterOrder(plan.projectId);
    expect(after).toHaveLength(before.length + 1);
    // The source chapter kept its id and its place; the new one reads right
    // after it.
    expect(after[1]).toBe(before[1]);
    expect(after.filter((id) => before.includes(id))).toEqual(before);
  } finally {
    await closeSignedInSession(session);
  }
});

test("refuses to submit a redistribution the chapter would not survive", async ({
  page,
  context,
}) => {
  const session = await openSignedInSession();

  try {
    const plan = await seedProjectWithReorderablePlan(session.userId, "Plan incomplet");
    await signIn(context, session);

    const before = await readChapterOrder(plan.projectId);

    await page.goto(`/projects/${plan.projectId}/outline`);
    // Chapter 1 opens the fixture's thread, so its arbitration has an endpoint
    // to place.
    await openSplitScreen(page, 1);

    // A target that no longer sums back to the chapter's own is refused here,
    // before anything is sent — the same `checkChapterSplit` the write will run.
    await untilItTakes(async () => {
      await page.getByRole("spinbutton", { name: "Longueur cible, en mots" }).first().fill("50");
      await expect(page.getByRole("status")).toContainText("laisse quelque chose de côté", {
        timeout: 2_000,
      });
    });

    await expect(page.getByRole("button", { name: "Scinder le chapitre" })).toBeDisabled();

    // Sending the thread's opening to the second half is legal, and putting the
    // budget back leaves the redistribution conserved again.
    await page
      .getByRole("group", { name: "Fils ouverts" })
      .getByRole("radio", { name: "seconde" })
      .check();
    await page.getByRole("spinbutton", { name: "Longueur cible, en mots" }).first().fill("1000");

    await expect(page.getByRole("status")).toContainText("Rien n'est perdu");
    await expect(page.getByRole("button", { name: "Scinder le chapitre" })).toBeEnabled();

    expect(await readChapterOrder(plan.projectId)).toEqual(before);
  } finally {
    await closeSignedInSession(session);
  }
});
