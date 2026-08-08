import { type BrowserContext, expect, type Page, test } from "@playwright/test";

import {
  closeSignedInSession,
  countChapters,
  listProjectTitles,
  openSignedInSession,
  projectExists,
  seedProjectWithChapters,
  SESSION_COOKIE,
  type SignedInSession,
} from "../../../../test/e2e/session-fixture";

/**
 * CAL-035's five actions, in a browser: open, rename, duplicate, archive and
 * delete.
 *
 * What the copy *contains* is asserted against a real PostgreSQL by
 * `test/integration/project-duplication.integration.test.ts` — thirty-four
 * tables, and the criterion that none of the copy's rows names the original.
 * What is asserted here is the other half: that a signed-in author can reach
 * each action from a page, that a destructive one is refused until it is
 * confirmed, and that the result is true in the database rather than merely on
 * screen.
 */

/**
 * The error banner, and not Next's route announcer — which also carries
 * `role="alert"` and would make every assertion on a message ambiguous.
 */
function banner(page: Page) {
  return page.locator("p[role='alert']");
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

test("opens a project from the dashboard", async ({ page, context }) => {
  const session = await openSignedInSession();

  try {
    const project = await seedProjectWithChapters(session.userId, "Ouvrir ce projet");
    await signIn(context, session);

    await page.goto("/");
    await page.getByRole("link", { name: project.title }).click();

    await page.waitForURL(`/projects/${project.projectId}`);
    await expect(page.getByRole("heading", { level: 1, name: project.title })).toBeVisible();
  } finally {
    await closeSignedInSession(session);
  }
});

test("renames a project, and refuses a blank title", async ({ page, context }) => {
  const session = await openSignedInSession();

  try {
    const project = await seedProjectWithChapters(session.userId, "Titre de départ");
    await signIn(context, session);

    await page.goto(`/projects/${project.projectId}`);

    // A space is not a title, and the server is what says so — the field's own
    // `required` never sees it.
    await page.getByLabel("Titre du projet").fill("   ");
    await page.getByRole("button", { name: "Renommer" }).click();

    await expect(banner(page)).toContainText("Le titre ne peut pas être vide");
    expect(await listProjectTitles(session.userId)).toEqual(["Titre de départ"]);

    await page.getByLabel("Titre du projet").fill("Titre choisi");
    await page.getByRole("button", { name: "Renommer" }).click();

    await expect(page.getByRole("heading", { level: 1, name: "Titre choisi" })).toBeVisible();
    expect(await listProjectTitles(session.userId)).toEqual(["Titre choisi"]);
  } finally {
    await closeSignedInSession(session);
  }
});

test("duplicates a project and lands in the copy", async ({ page, context }) => {
  const session = await openSignedInSession();

  try {
    const project = await seedProjectWithChapters(session.userId, "Roman à dupliquer");
    await signIn(context, session);

    await page.goto(`/projects/${project.projectId}`);
    await page.getByRole("button", { name: "Dupliquer ce projet" }).click();

    // Not "a project page" — this *is* one. The copy is where the action
    // lands, so what is waited on is a different project id.
    await page.waitForURL(
      (url) =>
        /^\/projects\/[^/]+$/.test(url.pathname) &&
        url.pathname !== `/projects/${project.projectId}`,
    );
    const copyId = new URL(page.url()).pathname.split("/")[2] ?? "";
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Roman à dupliquer (copie)");

    // The copy holds its own chapters, and the original still holds its own.
    expect(await countChapters(copyId)).toBe(2);
    expect(await countChapters(project.projectId)).toBe(2);
    expect(await listProjectTitles(session.userId)).toEqual([
      "Roman à dupliquer",
      "Roman à dupliquer (copie)",
    ]);

    await page.goto("/");
    await expect(page.getByRole("link", { name: "Roman à dupliquer (copie)" })).toBeVisible();
  } finally {
    await closeSignedInSession(session);
  }
});

test("archives a project and restores it", async ({ page, context }) => {
  const session = await openSignedInSession();

  try {
    const project = await seedProjectWithChapters(session.userId, "Projet à archiver");
    await signIn(context, session);

    await page.goto(`/projects/${project.projectId}`);
    await page.getByRole("button", { name: "Archiver ce projet" }).click();

    await expect(page.getByText("Archivé", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Restaurer" })).toBeVisible();

    // Archiving is the reversible action, which is what makes deleting the only
    // irreversible one.
    await page.getByRole("button", { name: "Restaurer ce projet" }).click();

    await expect(page.getByRole("heading", { name: "Archiver" })).toBeVisible();
    await expect(page.getByText("Archivé", { exact: true })).toBeHidden();
  } finally {
    await closeSignedInSession(session);
  }
});

test("deletes a project only once its title has been typed", async ({ page, context }) => {
  const session = await openSignedInSession();

  try {
    const project = await seedProjectWithChapters(session.userId, "Projet à supprimer");
    await signIn(context, session);

    await page.goto(`/projects/${project.projectId}`);
    await page.getByRole("link", { name: "Supprimer ce projet…" }).click();

    await page.waitForURL(`/projects/${project.projectId}/delete`);

    await page.getByLabel("Pour confirmer, saisissez le titre du projet :").fill("Projet");
    await page.getByRole("button", { name: "Supprimer définitivement ce projet" }).click();

    await expect(banner(page)).toContainText("Le titre saisi ne correspond pas");
    expect(await projectExists(project.projectId)).toBe(true);

    await page.getByLabel("Pour confirmer, saisissez le titre du projet :").fill(project.title);
    await page.getByRole("button", { name: "Supprimer définitivement ce projet" }).click();

    await page.waitForURL("/");
    await expect(page.getByText("Aucun projet pour l'instant.")).toBeVisible();
    expect(await projectExists(project.projectId)).toBe(false);
  } finally {
    await closeSignedInSession(session);
  }
});

test("hides another author's project behind the same answer as a missing one", async ({
  page,
  context,
}) => {
  const owner = await openSignedInSession();
  const intruder = await openSignedInSession();

  try {
    const project = await seedProjectWithChapters(owner.userId, "Projet d'une autre");
    await signIn(context, intruder);

    const response = await page.goto(`/projects/${project.projectId}`);

    expect(response?.status()).toBe(404);
    await expect(page.getByText(project.title)).toBeHidden();
  } finally {
    await closeSignedInSession(owner);
    await closeSignedInSession(intruder);
  }
});
