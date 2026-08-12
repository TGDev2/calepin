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
 * CAL-105 in a browser: a chapter moves by keyboard and by drag, the plan
 * renumbers itself, and the thread badges follow the chapter rather than the
 * position.
 *
 * That no reference breaks is proved against a real PostgreSQL, over a scripted
 * series of moves, by `test/integration/chapter-move.integration.test.ts`. What
 * is proved here is what only a browser can say: that the keyboard alternative
 * the backlog demands actually moves something, that the move is announced, and
 * that what the screen shows afterwards is what the database holds — which is
 * why every case ends on `readChapterOrder`.
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

/** The chapter rows as the reader sees them, in reading order. */
function chapterRows(page: Page) {
  return page.locator('[role="treeitem"][aria-level="2"]');
}

test("moves a chapter down with Alt+ArrowDown, and the plan renumbers itself", async ({
  page,
  context,
}) => {
  const session = await openSignedInSession();

  try {
    const plan = await seedProjectWithReorderablePlan(session.userId, "Plan à réordonner");
    await signIn(context, session);

    await page.goto(`/projects/${plan.projectId}/outline`);

    const first = chapterRows(page).first();
    await expect(first).toContainText("Chapitre repère 1");
    await expect(first).toContainText("Ouvre 1");

    await first.focus();
    await page.keyboard.press("Alt+ArrowDown");

    // The move is announced, and the announcement names where the chapter now is.
    await expect(page.getByRole("status")).toContainText("position 2");

    // Renumbering is derived, so the row that used to be first now reads "2."
    // and the one that was second reads "1." — nothing was renamed.
    const rows = chapterRows(page);
    await expect(rows.nth(0)).toContainText("Chapitre repère 2");
    await expect(rows.nth(1)).toContainText("Chapitre repère 1");

    // The thread badge travelled with the chapter, not with the position.
    await expect(rows.nth(1)).toContainText("Ouvre 1");
    await expect(rows.nth(0)).not.toContainText("Ouvre 1");

    const [a, b, ...rest] = plan.chapterIds;
    expect(await readChapterOrder(plan.projectId)).toEqual([b, a, ...rest]);
  } finally {
    await closeSignedInSession(session);
  }
});

test("carries a chapter into the next part, one Alt+ArrowDown at a time", async ({
  page,
  context,
}) => {
  const session = await openSignedInSession();

  try {
    const plan = await seedProjectWithReorderablePlan(session.userId, "Plan à traverser");
    await signIn(context, session);

    await page.goto(`/projects/${plan.projectId}/outline`);

    // The last chapter of the first part. One step puts it at the head of the
    // second part without changing its number; the next one moves it past a
    // chapter and does.
    const last = chapterRows(page).nth(2);
    await expect(last).toContainText("Chapitre repère 3");
    await last.focus();

    await page.keyboard.press("Alt+ArrowDown");
    await expect(page.getByRole("status")).toContainText("partie 2");

    const parts = page.locator('[role="treeitem"][aria-level="1"]');
    await expect(parts.nth(0)).toContainText("2 chapitres");
    await expect(parts.nth(1)).toContainText("4 chapitres");

    // Order in the database is unchanged by that first step — only the part is.
    expect(await readChapterOrder(plan.projectId)).toEqual(plan.chapterIds);

    await page.keyboard.press("Alt+ArrowDown");
    await expect(page.getByRole("status")).toContainText("position 4");

    const [a, b, c, d, ...rest] = plan.chapterIds;
    expect(await readChapterOrder(plan.projectId)).toEqual([a, b, d, c, ...rest]);
  } finally {
    await closeSignedInSession(session);
  }
});

test("moves a chapter up with the visible control, and stops at the first", async ({
  page,
  context,
}) => {
  const session = await openSignedInSession();

  try {
    const plan = await seedProjectWithReorderablePlan(session.userId, "Plan à remonter");
    await signIn(context, session);

    await page.goto(`/projects/${plan.projectId}/outline`);

    await page.getByRole("button", { name: "Monter le chapitre 3" }).click();
    await expect(page.getByRole("status")).toContainText("position 2");

    const [a, b, c, ...rest] = plan.chapterIds;
    expect(await readChapterOrder(plan.projectId)).toEqual([a, c, b, ...rest]);

    // A plan does not wrap: the control at the head of the novel is unavailable.
    await expect(page.getByRole("button", { name: "Monter le chapitre 1" })).toBeDisabled();
  } finally {
    await closeSignedInSession(session);
  }
});

test("moves a chapter by dragging it onto another", async ({ page, context }) => {
  const session = await openSignedInSession();

  try {
    const plan = await seedProjectWithReorderablePlan(session.userId, "Plan à glisser");
    await signIn(context, session);

    await page.goto(`/projects/${plan.projectId}/outline`);

    const rows = chapterRows(page);
    await expect(rows.nth(0)).toContainText("Chapitre repère 1");

    // Grabbed by its own line — the whole item is a drop target, but only the
    // compact row is the handle — and dropped on the lower half of the third
    // chapter, which means behind it.
    const source = rows.nth(0).getByText("Chapitre repère 1");
    const target = rows.nth(2);
    const box = await target.boundingBox();
    if (box === null) throw new Error("the target chapter has no box to drop on");

    await source.dragTo(target, {
      targetPosition: { x: box.width / 2, y: box.height * 0.9 },
    });

    await expect(page.getByRole("status")).toContainText("position 3");

    const [a, b, c, ...rest] = plan.chapterIds;
    expect(await readChapterOrder(plan.projectId)).toEqual([b, c, a, ...rest]);
  } finally {
    await closeSignedInSession(session);
  }
});
