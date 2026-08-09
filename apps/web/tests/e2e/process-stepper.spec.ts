import { type BrowserContext, expect, type Page, test } from "@playwright/test";

import {
  closeSignedInSession,
  openSignedInSession,
  seedProjectWithChapters,
  SESSION_COOKIE,
  type SignedInSession,
} from "../../../../test/e2e/session-fixture";

/**
 * CAL-037's nine-step progress bar, in a browser: that it reflects the real
 * rows rather than the stored (and here, deliberately stale) status column,
 * and that it is genuinely operable by keyboard, not merely marked up as if
 * it were.
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

function stepperList(page: Page) {
  return page.getByRole("list", { name: "Étapes du projet" });
}

test("names writing the current step, derived from the rows rather than the stored status", async ({
  page,
  context,
}) => {
  const session = await openSignedInSession();

  try {
    // `seedProjectWithChapters` never refreshes `project.status` (it writes
    // one chapter revision directly) — it stays at the schema default,
    // `DRAFT`. The bar must still name "Rédaction" current, because it reads
    // `readProjectProgress`, not the cached column.
    const project = await seedProjectWithChapters(session.userId, "Roman en rédaction");
    await signIn(context, session);

    await page.goto(`/projects/${project.projectId}`);

    const list = stepperList(page);
    await expect(list.getByRole("listitem").filter({ hasText: "Rédaction" })).toHaveAttribute(
      "aria-current",
      "step",
    );
    await expect(list.getByRole("listitem").filter({ hasText: "Analyse" })).toContainText(
      "Franchie",
    );
    await expect(list.getByRole("listitem").filter({ hasText: "Export" })).toContainText(
      "Pas encore accessible",
    );
  } finally {
    await closeSignedInSession(session);
  }
});

test("moves focus across the nine steps with the keyboard", async ({ page, context }) => {
  const session = await openSignedInSession();

  try {
    const project = await seedProjectWithChapters(session.userId, "Roman au clavier");
    await signIn(context, session);

    await page.goto(`/projects/${project.projectId}`);

    const list = stepperList(page);
    const analysis = list.getByRole("listitem").filter({ hasText: "Analyse" });
    const writing = list.getByRole("listitem").filter({ hasText: "Rédaction" });
    const coherence = list.getByRole("listitem").filter({ hasText: "Contrôle" });
    const exportStep = list.getByRole("listitem").filter({ hasText: "Export" });

    // The roving tab stop starts on the current step, not the first one in
    // the list — this is the item a real Tab keypress lands on.
    await expect(writing).toHaveAttribute("tabindex", "0");
    await expect(analysis).toHaveAttribute("tabindex", "-1");

    await writing.focus();
    await expect(writing).toBeFocused();

    await page.keyboard.press("ArrowRight");
    await expect(coherence).toBeFocused();
    await expect(writing).toHaveAttribute("tabindex", "-1");
    await expect(coherence).toHaveAttribute("tabindex", "0");

    await page.keyboard.press("Home");
    await expect(analysis).toBeFocused();

    await page.keyboard.press("End");
    await expect(exportStep).toBeFocused();

    await page.keyboard.press("ArrowLeft");
    await expect(list.getByRole("listitem").filter({ hasText: "Révision" })).toBeFocused();
  } finally {
    await closeSignedInSession(session);
  }
});
