import { type BrowserContext, expect, type Page, test } from "@playwright/test";

import {
  closeSignedInSession,
  listSourceTextVersions,
  openSignedInSession,
  seedProjectWithChapters,
  seedProjectWithSourceTextAndPlan,
  SESSION_COOKIE,
  type SignedInSession,
} from "../../../../test/e2e/session-fixture";

/**
 * CAL-046 in a browser: editing the source text after creation, and being told
 * what the change put in doubt.
 *
 * The rule and the statements it runs are asserted against a real PostgreSQL by
 * `test/integration/source-text-edit.integration.test.ts`. What is asserted here
 * is the other half — that a signed-in author can reach the editor from their
 * project, that saving really appends a version rather than overwriting one, and
 * that the warning they then read names the stages and offers to destroy
 * nothing.
 *
 * Every text here is synthetic (CLAUDE.md §9): counted words with no meaning.
 */

/** A text of exactly `count` words, so the counter identifies the version. */
function wordsOfLength(count: number, tag: string): string {
  return Array.from({ length: count }, (_unused, index) => `${tag}${index}`).join(" ");
}

/**
 * The obsolescence panel, located by its own heading rather than by a role:
 * Next's route announcer carries a live-region role too, and a locator that did
 * not name the heading would be ambiguous under strict mode.
 */
function obsolescencePanel(page: Page) {
  return page.locator("section").filter({ hasText: "Étapes à revoir après cette modification" });
}

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

test("edits the source text, keeping every earlier version", async ({ page, context }) => {
  const session = await openSignedInSession();

  try {
    const original = wordsOfLength(20, "depart");
    const project = await seedProjectWithSourceTextAndPlan(
      session.userId,
      "Texte à reprendre",
      original,
    );
    await signIn(context, session);

    await page.goto(`/projects/${project.projectId}`);
    await page.getByRole("link", { name: "Modifier le texte source…" }).click();
    await page.waitForURL(`/projects/${project.projectId}/source-text`);

    const field = page.getByLabel("Votre texte de départ");
    await expect(field).toHaveValue(original);

    const rewritten = wordsOfLength(31, "reprise");
    await field.fill(rewritten);
    await page.getByRole("button", { name: "Enregistrer une nouvelle version" }).click();

    await expect(page.getByText("Version 2 enregistrée")).toBeVisible();

    // The criterion, in the database rather than on screen: a second version,
    // and the first one still exactly as it was written.
    const versions = await listSourceTextVersions(project.projectId);
    expect(versions.map((version) => version.versionNumber)).toEqual([2, 1]);
    expect(versions[1]?.content).toBe(original);
    expect(versions[0]).toMatchObject({ content: rewritten, wordCount: 31 });

    await expect(page.getByRole("heading", { name: "Versions conservées" })).toBeVisible();
    await expect(page.getByText("Version 1", { exact: true })).toBeVisible();
    await expect(page.getByText("Version 2", { exact: true })).toBeVisible();
  } finally {
    await closeSignedInSession(session);
  }
});

test("names the stages the edit put in doubt, and offers to destroy none of them", async ({
  page,
  context,
}) => {
  const session = await openSignedInSession();

  try {
    const project = await seedProjectWithSourceTextAndPlan(
      session.userId,
      "Projet avec un plan",
      wordsOfLength(20, "initial"),
    );
    await signIn(context, session);

    await page.goto(`/projects/${project.projectId}/source-text`);

    // Nothing has been edited yet, so nothing may be reported.
    await expect(obsolescencePanel(page)).toHaveCount(0);

    await page.getByLabel("Votre texte de départ").fill(wordsOfLength(28, "modifie"));
    await page.getByRole("button", { name: "Enregistrer une nouvelle version" }).click();

    const panel = obsolescencePanel(page).first();
    await expect(panel).toBeVisible();
    await expect(panel).toContainText("La bible narrative");
    await expect(panel).toContainText("Le plan");
    await expect(panel).toContainText("2 chapitres sur 2");
    await expect(panel).toContainText("rien n'a été supprimé");

    // Not one control that would act on the author's behalf.
    await expect(panel.getByRole("button")).toHaveCount(0);
    await expect(panel.getByRole("link")).toHaveCount(0);

    // And the warning follows them back to the project, where they will next
    // look for it.
    await page.goto(`/projects/${project.projectId}`);
    await expect(obsolescencePanel(page).first()).toContainText("La bible narrative");
  } finally {
    await closeSignedInSession(session);
  }
});

test("refuses an empty text and keeps the current version", async ({ page, context }) => {
  const session = await openSignedInSession();

  try {
    const original = wordsOfLength(12, "garde");
    const project = await seedProjectWithSourceTextAndPlan(
      session.userId,
      "Texte à ne pas vider",
      original,
    );
    await signIn(context, session);

    await page.goto(`/projects/${project.projectId}/source-text`);
    await page.getByLabel("Votre texte de départ").fill("   ");
    await page.getByRole("button", { name: "Enregistrer une nouvelle version" }).click();

    await expect(page.locator("p[role='alert']")).toContainText("ne peut pas être vide");

    const versions = await listSourceTextVersions(project.projectId);
    expect(versions).toHaveLength(1);
    expect(versions[0]?.content).toBe(original);
  } finally {
    await closeSignedInSession(session);
  }
});

test("answers 404 for a source text that is not yours", async ({ page, context }) => {
  const owner = await openSignedInSession();
  const intruder = await openSignedInSession();

  try {
    const project = await seedProjectWithChapters(owner.userId, "Projet d'un autre");
    await signIn(context, intruder);

    const response = await page.goto(`/projects/${project.projectId}/source-text`);

    expect(response?.status()).toBe(404);
  } finally {
    await closeSignedInSession(owner);
    await closeSignedInSession(intruder);
  }
});
