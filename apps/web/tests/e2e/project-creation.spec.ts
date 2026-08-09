import { type BrowserContext, expect, type Page, test } from "@playwright/test";

import {
  closeSignedInSession,
  getProjectFields,
  openSignedInSession,
  seedProjectWithChapters,
  SESSION_COOKIE,
  type SignedInSession,
} from "../../../../test/e2e/session-fixture";

/**
 * CAL-040's acceptance criteria, in a browser: the six-step wizard ends in a
 * project at `DRAFT`, and a reload mid-entry loses nothing.
 *
 * The wizard needs JavaScript regardless of what any individual field does —
 * the draft lives in `localStorage`, and moving between steps never
 * navigates — so unlike `project-actions.spec.ts` there is no no-JS variant
 * of these specs.
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
  return page.locator("p[role='alert']");
}

test("creates a project through the wizard, ending in a draft", async ({ page, context }) => {
  const session = await openSignedInSession();

  try {
    await signIn(context, session);

    await page.goto("/projects/new");
    await page.getByLabel("Titre provisoire").fill("Le Grand Roman");
    await page.getByRole("button", { name: "Suivant" }).click();

    await page.getByLabel("Texte source").fill("Il était une fois un texte source de test.");
    await page.getByRole("button", { name: "Suivant" }).click();

    // Language step: keep the default (français).
    await page.getByRole("button", { name: "Suivant" }).click();

    await page.getByLabel(/Roman court/).check();
    await page.getByRole("button", { name: "Suivant" }).click();

    // Target audience step: keep the default (Grand public).
    await page.getByRole("button", { name: "Suivant" }).click();

    await page.getByLabel(/Élevé/).check();
    await page.getByRole("button", { name: "Créer le projet" }).click();

    // `/projects/new` itself matches `^/projects/[^/]+$` — the pattern alone
    // would resolve against the page we're already on, the trap
    // `tasks/lessons.md` records for `waitForURL`. Excluding it explicitly is
    // what makes this wait for the *created* project's page.
    await page.waitForURL(
      (url) => /^\/projects\/[^/]+$/.test(url.pathname) && url.pathname !== "/projects/new",
    );
    const projectId = new URL(page.url()).pathname.split("/")[2] ?? "";

    await expect(page.getByRole("heading", { level: 1, name: "Le Grand Roman" })).toBeVisible();

    const fields = await getProjectFields(projectId);
    expect(fields).toMatchObject({
      status: "DRAFT",
      targetLength: "SHORT",
      freedomLevel: "HIGH",
      targetAudience: "Grand public",
      sourceTextVersionCount: 1,
    });
  } finally {
    await closeSignedInSession(session);
  }
});

test("keeps a mid-entry draft across a reload, and resumes on the same step", async ({
  page,
  context,
}) => {
  const session = await openSignedInSession();

  try {
    await signIn(context, session);

    await page.goto("/projects/new");
    await page.getByLabel("Titre provisoire").fill("Brouillon Conservé");
    await page.getByRole("button", { name: "Suivant" }).click();

    await page.getByLabel("Texte source").fill("Un texte source conservé après un rechargement.");
    await page.getByRole("button", { name: "Suivant" }).click();

    // Now on the "language" step.
    await page.reload();

    // Resumes on the language step — the select this step alone renders.
    await expect(page.getByLabel("Langue du texte")).toBeVisible();

    await page.getByRole("button", { name: "Précédent" }).click();
    await expect(page.getByLabel("Texte source")).toHaveValue(
      "Un texte source conservé après un rechargement.",
    );

    await page.getByRole("button", { name: "Précédent" }).click();
    await expect(page.getByLabel("Titre provisoire")).toHaveValue("Brouillon Conservé");
  } finally {
    await closeSignedInSession(session);
  }
});

test("refuses a source text over 2000 words and blocks the next step", async ({ page, context }) => {
  const session = await openSignedInSession();

  try {
    await signIn(context, session);

    await page.goto("/projects/new");
    await page.getByLabel("Titre provisoire").fill("Texte trop long");
    await page.getByRole("button", { name: "Suivant" }).click();

    const overLimit = Array.from({ length: 2001 }, () => "mot").join(" ");
    await page.getByLabel("Texte source").fill(overLimit);
    await page.getByRole("button", { name: "Suivant" }).click();

    await expect(banner(page)).toContainText("dépasse la limite de 2000 mots");
    // Still on the source text step — the language step's own select never appears.
    await expect(page.getByLabel("Texte source")).toBeVisible();
  } finally {
    await closeSignedInSession(session);
  }
});

test("the dashboard always offers a way to create another project", async ({ page, context }) => {
  const session = await openSignedInSession();

  try {
    await signIn(context, session);

    await page.goto("/");
    await expect(page.getByRole("link", { name: "Nouveau projet" })).toBeVisible();

    await seedProjectWithChapters(session.userId, "Projet déjà existant");
    await page.goto("/");
    await expect(page.getByRole("link", { name: "Nouveau projet" })).toBeVisible();
  } finally {
    await closeSignedInSession(session);
  }
});
