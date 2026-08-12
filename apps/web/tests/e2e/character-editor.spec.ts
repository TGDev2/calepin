import { type BrowserContext, expect, test } from "@playwright/test";

import {
  closeSignedInSession,
  openSignedInSession,
  seedProjectWithCharacterSheet,
  SESSION_COOKIE,
  type SignedInSession,
} from "../../../../test/e2e/session-fixture";

/**
 * CAL-097 in a browser: editing a sheet by hand, a locked field refusing to
 * budge until it is explicitly unlocked, autosave actually persisting, a
 * history entry appearing, and a relation linking straight to the other
 * character's own editor.
 *
 * The write itself — `editCharacter`'s lock check, no-op short circuit and
 * history row — is proved against a real PostgreSQL by
 * `test/integration/character-editing.integration.test.ts`. What is proved
 * here is the journey.
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

test("reaches the editor from the bible screen", async ({ page, context }) => {
  const session = await openSignedInSession();

  try {
    const project = await seedProjectWithCharacterSheet(session.userId, "Bible à modifier");
    await signIn(context, session);

    await page.goto(`/projects/${project.projectId}/bible`);
    await page.getByText("Corentin Maillard", { exact: false }).first().click();

    await page.getByRole("link", { name: "Modifier cette fiche →" }).click();

    await expect(page).toHaveURL(new RegExp(`/bible/characters/${project.characterId}$`));
    await expect(page.getByRole("heading", { name: "Corentin Maillard" })).toBeVisible();
  } finally {
    await closeSignedInSession(session);
  }
});

test("autosaves an edit, records it in the history, and blocks a locked field until lifted", async ({
  page,
  context,
}) => {
  const session = await openSignedInSession();

  try {
    const project = await seedProjectWithCharacterSheet(session.userId, "Fiche à modifier");
    await signIn(context, session);

    await page.goto(`/projects/${project.projectId}/bible/characters/${project.characterId}`);
    await expect(page.getByRole("heading", { name: "Corentin Maillard" })).toBeVisible();

    // The locked field: disabled, and carrying the lock badge.
    const fear = page.getByLabel("Peur");
    await expect(fear).toBeDisabled();
    await expect(fear).toHaveValue("être oublié");

    // An unlocked field: editable, seeded value present.
    const secret = page.getByLabel("Secret");
    await expect(secret).toBeEnabled();
    await expect(secret).toHaveValue("il a menti sur la date de son retour");

    // Editing it triggers the debounced autosave — no button pressed.
    await secret.fill("il n'a jamais vendu la maison, il l'a rachetée sous un autre nom");
    await expect(page.getByText("Enregistré.")).toBeVisible({ timeout: 5_000 });

    await page.reload();
    await expect(page.getByLabel("Secret")).toHaveValue(
      "il n'a jamais vendu la maison, il l'a rachetée sous un autre nom",
    );

    // The edit left a history entry naming the field and its previous value.
    await expect(page.getByRole("heading", { name: "Historique des modifications" })).toBeVisible();
    await page.getByText("Secret", { exact: true }).last().click();
    await expect(page.getByText("il a menti sur la date de son retour")).toBeVisible();

    // Lifting the lock on Peur makes it editable.
    const fearRow = page.locator("p", { has: page.getByLabel("Peur") });
    await fearRow.getByRole("button", { name: "Déverrouiller" }).click();
    await expect(page.getByLabel("Peur")).toBeEnabled({ timeout: 5_000 });
  } finally {
    await closeSignedInSession(session);
  }
});

test("links straight to a related character's own editor", async ({ page, context }) => {
  const session = await openSignedInSession();

  try {
    const project = await seedProjectWithCharacterSheet(session.userId, "Réseau à suivre");
    await signIn(context, session);

    await page.goto(`/projects/${project.projectId}/bible/characters/${project.characterId}`);

    await expect(page.getByRole("heading", { name: "Relations" })).toBeVisible();
    await page.getByRole("link", { name: "Élise Fougeray" }).click();

    await expect(page).toHaveURL(new RegExp(`/bible/characters/${project.relatedCharacterId}$`));
    await expect(page.getByRole("heading", { name: "Élise Fougeray" })).toBeVisible();
  } finally {
    await closeSignedInSession(session);
  }
});
