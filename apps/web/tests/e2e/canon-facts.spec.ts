/**
 * CAL-098's journey: the specification's own example, written by hand.
 *
 * *Nora ignore que son père est encore vivant* is one row plus one stance, and
 * the acceptance criterion is that an author can produce it in under a minute
 * without meeting the data model. So the spec writes it the way a person would
 * — an affirmative sentence, *c'est vrai*, *toujours*, and one character told
 * to ignore the question — and then reads back the consequence the screen
 * derives.
 *
 * The repository's own refusals are proved in
 * `test/integration/canon-fact-editing.integration.test.ts`; what belongs here
 * is the journey, and the two things only a browser can show: that the filters
 * narrow through the URL, and that a locked fact offers no way to edit it.
 */

import { type BrowserContext, expect, test } from "@playwright/test";

import {
  closeSignedInSession,
  openSignedInSession,
  seedProjectWithBible,
  SESSION_COOKIE,
  type SignedInSession,
} from "../../../../test/e2e/session-fixture";

/** The seeded bible's one character. */
const CHARACTER = "Robert Fassin";

/** Synthetic French written for this spec (§8). */
const STATEMENT = "Le père de Robert est vivant.";

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

test("writes a fact with its three dimensions from one screen", async ({ page, context }) => {
  const session = await openSignedInSession();

  try {
    const project = await seedProjectWithBible(session.userId, "Bible à compléter");
    await signIn(context, session);

    // The editor is reached from the bible screen, never guessed at.
    await page.goto(`/projects/${project.projectId}/bible`);
    await page.getByRole("link", { name: "Écrire et modifier les faits" }).click();
    await page.waitForURL(`**/projects/${project.projectId}/bible/facts`);

    const form = page.getByRole("region", { name: "Écrire un fait" });

    await form.getByLabel("Le fait, en une phrase").fill(STATEMENT);
    await form.getByRole("radio", { name: "vrai", exact: true }).check();
    await form.getByRole("radio", { name: "toujours vrai, du début à la fin" }).check();

    const stance = form.getByRole("group", { name: CHARACTER });
    await stance.getByRole("radio", { name: /ignore la question/ }).check();

    await form.getByRole("button", { name: "Ajouter ce fait" }).click();

    // The card reads the stance back as what it amounts to, not as a column.
    const card = page
      .getByRole("list", { name: "Faits canoniques" })
      .locator("> li")
      .filter({ hasText: STATEMENT });

    await expect(card).toBeVisible();
    await expect(card).toContainText(`${CHARACTER} l'ignore`);
    await expect(card).toContainText("un bout à l");
    await expect(card).toContainText("confirmé");
    await expect(card).toContainText("saisi par vous");
  } finally {
    await closeSignedInSession(session);
  }
});

test("narrows the list by character and by state, through the URL", async ({ page, context }) => {
  const session = await openSignedInSession();

  try {
    const project = await seedProjectWithBible(session.userId, "Bible à filtrer");
    await signIn(context, session);

    await page.goto(`/projects/${project.projectId}/bible/facts`);

    const form = page.getByRole("region", { name: "Écrire un fait" });
    await form.getByLabel("Le fait, en une phrase").fill(STATEMENT);
    await form.getByRole("group", { name: CHARACTER }).getByRole("radio", { name: /ignore la question/ }).check();
    await form.getByRole("button", { name: "Ajouter ce fait" }).click();

    const list = page.getByRole("list", { name: "Faits canoniques" });
    await expect(list.locator("> li")).toHaveCount(2);

    // Filtering by the character keeps the fact that records their stance and
    // drops the seeded one, which bears on nobody.
    await page.getByLabel("Personnage").selectOption({ label: CHARACTER });
    await page.getByRole("button", { name: "Filtrer" }).click();
    await page.waitForURL(/personnage=/);

    await expect(list.locator("> li")).toHaveCount(1);
    await expect(list).toContainText(STATEMENT);

    // A filtered view is a link: the same URL narrows on its own.
    const filtered = page.url();
    await page.goto("/");
    await page.goto(filtered);
    await expect(page.getByRole("list", { name: "Faits canoniques" }).locator("> li")).toHaveCount(1);
  } finally {
    await closeSignedInSession(session);
  }
});

test("sets a fact aside and finds it again by its state", async ({ page, context }) => {
  const session = await openSignedInSession();

  try {
    const project = await seedProjectWithBible(session.userId, "Bible à trier");
    await signIn(context, session);

    await page.goto(`/projects/${project.projectId}/bible/facts`);

    const card = page
      .getByRole("list", { name: "Faits canoniques" })
      .locator("> li")
      .first();

    await card.getByRole("button", { name: "Écarter ce fait" }).click();
    await expect(card).toContainText("écarté");

    await page.getByLabel("État").selectOption({ label: "écarté" });
    await page.getByRole("button", { name: "Filtrer" }).click();
    await page.waitForURL(/statut=REJECTED/);

    await expect(page.getByRole("list", { name: "Faits canoniques" }).locator("> li")).toHaveCount(
      1,
    );
  } finally {
    await closeSignedInSession(session);
  }
});

test("a locked fact offers no way to edit it until the lock is lifted", async ({ page, context }) => {
  const session = await openSignedInSession();

  try {
    const project = await seedProjectWithBible(session.userId, "Bible à verrouiller");
    await signIn(context, session);

    await page.goto(`/projects/${project.projectId}/bible/facts`);

    const card = page
      .getByRole("list", { name: "Faits canoniques" })
      .locator("> li")
      .first();

    await expect(card.getByText("Modifier ce fait")).toBeVisible();

    await card.getByRole("button", { name: "Verrouiller" }).click();

    await expect(card.getByText("Modifier ce fait")).toHaveCount(0);
    await expect(card).toContainText("Ce fait est verrouillé");

    await card.getByRole("button", { name: "Déverrouiller" }).click();

    await expect(card.getByText("Modifier ce fait")).toBeVisible();
  } finally {
    await closeSignedInSession(session);
  }
});

test("offers no outright deletion for a fact the product established", async ({ page, context }) => {
  const session = await openSignedInSession();

  try {
    const project = await seedProjectWithBible(session.userId, "Bible à conserver");
    await signIn(context, session);

    await page.goto(`/projects/${project.projectId}/bible/facts`);

    // The seeded fact is BIBLE-sourced: retiring it is offered, deleting is not.
    const seeded = page
      .getByRole("list", { name: "Faits canoniques" })
      .locator("> li")
      .first();

    await expect(seeded.getByRole("button", { name: "Écarter ce fait" })).toBeVisible();
    await expect(seeded.getByRole("button", { name: "Supprimer" })).toHaveCount(0);
  } finally {
    await closeSignedInSession(session);
  }
});
