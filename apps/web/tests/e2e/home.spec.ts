import { expect, test } from "@playwright/test";

import {
  closeSignedInSession,
  openSignedInSession,
  seedProjectWithChapters,
  SESSION_COOKIE,
  setProjectStatus,
} from "../../../../test/e2e/session-fixture";

/**
 * CAL-032's acceptance criterion, in a browser: `/` is the real project
 * dashboard — protected like any other project data, and showing the seven
 * pieces of information the specification asks for.
 */

test("redirects an anonymous visitor to sign in, preserving the destination", async ({ page }) => {
  await page.goto("/");

  await page.waitForURL((url) => url.pathname === "/sign-in");
  expect(new URL(page.url()).searchParams.get("callbackUrl")).toBe("/");
});

test("shows an empty state for a signed-in visitor with no projects", async ({ page, context }) => {
  const session = await openSignedInSession();

  try {
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

    await page.goto("/");

    await expect(page.getByText("Aucun projet pour l'instant.")).toBeVisible();
  } finally {
    await closeSignedInSession(session);
  }
});

test("lists a signed-in visitor's project with its chapter and word aggregates", async ({
  page,
  context,
}) => {
  const session = await openSignedInSession();

  try {
    const project = await seedProjectWithChapters(session.userId, "Le Roman de Test");

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

    await page.goto("/");

    const card = page.getByRole("article").filter({ hasText: project.title });
    await expect(card.getByText(project.title)).toBeVisible();
    // Brouillon: no generation ever ran against this project, so its status
    // never left the default.
    await expect(card.getByText("Brouillon")).toBeVisible();
    // One written chapter of two planned (`seedProjectWithChapters`), 250
    // words — the only chapter carrying a revision.
    await expect(card.getByText("1 / 2")).toBeVisible();
    await expect(card.getByText("250")).toBeVisible();
  } finally {
    await closeSignedInSession(session);
  }
});

test("filters the list to the project matching a title search", async ({ page, context }) => {
  const session = await openSignedInSession();

  try {
    const matching = await seedProjectWithChapters(session.userId, "Les Ombres du Nord");
    const other = await seedProjectWithChapters(session.userId, "La Cité de Verre");

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

    await page.goto("/?q=Ombres");

    await expect(page.getByRole("article").filter({ hasText: matching.title })).toBeVisible();
    await expect(page.getByRole("article").filter({ hasText: other.title })).toHaveCount(0);
  } finally {
    await closeSignedInSession(session);
  }
});

test("a URL carrying search, sort and status restores exactly that view (CAL-036)", async ({
  page,
  context,
}) => {
  const session = await openSignedInSession();

  try {
    const project = await seedProjectWithChapters(session.userId, "Le Sentier Oublié");
    await setProjectStatus(project.projectId, "WRITING_IN_PROGRESS");

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

    await page.goto("/?q=Sentier&sort=progress&status=WRITING_IN_PROGRESS");

    await expect(page.getByLabel("Titre")).toHaveValue("Sentier");
    await expect(page.getByLabel("Trier par")).toHaveValue("progress");
    await expect(page.getByLabel("Statut")).toHaveValue("WRITING_IN_PROGRESS");
    await expect(page.getByRole("article").filter({ hasText: project.title })).toBeVisible();
  } finally {
    await closeSignedInSession(session);
  }
});
