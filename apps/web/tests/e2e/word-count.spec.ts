import {
  FRENCH_WORD_COUNT_CORPUS,
  FRENCH_WORD_COUNT_CORPUS_WORDS,
  SOURCE_TEXT_CAUTION_WORDS,
  SOURCE_TEXT_MAX_WORDS,
  SOURCE_TEXT_WARNING_WORDS,
} from "@calepin/shared/text";
import { type BrowserContext, expect, type Page, test } from "@playwright/test";

import {
  closeSignedInSession,
  getFirstSourceTextVersion,
  openSignedInSession,
  SESSION_COOKIE,
  type SignedInSession,
} from "../../../../test/e2e/session-fixture";

/**
 * CAL-041's acceptance criteria, in a real browser against a real database.
 *
 * The unit suites prove the *rule* is single-sourced (`word-count-parity.test.ts`)
 * and that each layer applies it (`source-text-counter.test.tsx`,
 * `project-creation.integration.test.ts`). What none of them can prove is the
 * criterion as written — that the number a person watches while typing is the
 * number that ends up in the column. Only a browser typing into a real
 * textarea, submitting through a real form encoding, can: everything between
 * the two (React state, the CRLF rewrite the HTML form-submission algorithm
 * performs, the multipart body, the server action's `FormData` parse) is
 * exactly the part a unit test has to simulate and therefore cannot check.
 *
 * The corpus is imported, not retyped. A spec with its own copy of the
 * fixtures proves the two copies agree, which is not the claim.
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

function counter(page: Page) {
  return page.locator("[role='status']").filter({ hasText: "mots" });
}

/** The number the counter is displaying right now. */
async function displayedWordCount(page: Page): Promise<number> {
  const text = (await counter(page).innerText()).trim();
  const match = /^(\d+)/u.exec(text);
  if (match === null) throw new Error(`counter did not display a number: ${JSON.stringify(text)}`);

  return Number.parseInt(match[1] ?? "", 10);
}

/** Walks the wizard from the source-text step to the created project. */
async function completeWizardFromSourceText(page: Page): Promise<string> {
  await page.getByRole("button", { name: "Suivant" }).click(); // language
  await page.getByRole("button", { name: "Suivant" }).click(); // target length
  await page.getByRole("button", { name: "Suivant" }).click(); // target audience
  await page.getByRole("button", { name: "Suivant" }).click(); // freedom level
  await page.getByRole("button", { name: "Créer le projet" }).click();

  // `/projects/new` matches `^/projects/[^/]+$` too — excluding it is what
  // makes this wait for the *created* project (see `tasks/lessons.md`).
  await page.waitForURL(
    (url) => /^\/projects\/[^/]+$/.test(url.pathname) && url.pathname !== "/projects/new",
  );

  return new URL(page.url()).pathname.split("/")[2] ?? "";
}

test("the count the browser displays is the count the database stores", async ({
  page,
  context,
}) => {
  const session = await openSignedInSession();

  try {
    await signIn(context, session);

    await page.goto("/projects/new");
    await page.getByLabel("Titre provisoire").fill("Typographie française");
    await page.getByRole("button", { name: "Suivant" }).click();

    await page.getByLabel("Texte source").fill(FRENCH_WORD_COUNT_CORPUS);

    // What the visitor sees, read off the live counter rather than computed.
    await expect(counter(page)).toContainText(`${FRENCH_WORD_COUNT_CORPUS_WORDS}`);
    const displayed = await displayedWordCount(page);
    expect(displayed).toBe(FRENCH_WORD_COUNT_CORPUS_WORDS);

    const projectId = await completeWizardFromSourceText(page);

    // What the database holds, after the form encoding, the multipart body and
    // the server action have each had their turn at the text.
    const version = await getFirstSourceTextVersion(projectId);
    expect(version).not.toBeNull();
    expect(version?.wordCount).toBe(displayed);
  } finally {
    await closeSignedInSession(session);
  }
});

test("the counter warns progressively as the budget runs out", async ({ page, context }) => {
  const session = await openSignedInSession();

  try {
    await signIn(context, session);

    await page.goto("/projects/new");
    await page.getByLabel("Titre provisoire").fill("Avertissement progressif");
    await page.getByRole("button", { name: "Suivant" }).click();

    const field = page.getByLabel("Texte source");
    const words = (count: number) => Array.from({ length: count }, () => "mot").join(" ");

    // Well under the ceiling: the count, and nothing else.
    await field.fill(words(100));
    await expect(counter(page)).toHaveAttribute("data-level", "ok");
    await expect(counter(page)).not.toContainText("Il vous reste");

    // 75 % — the budget becomes worth mentioning.
    await field.fill(words(SOURCE_TEXT_CAUTION_WORDS));
    await expect(counter(page)).toHaveAttribute("data-level", "caution");
    await expect(counter(page)).toContainText("Il vous reste 500 mots.");

    // 90 % — firmer.
    await field.fill(words(SOURCE_TEXT_WARNING_WORDS));
    await expect(counter(page)).toHaveAttribute("data-level", "warning");
    await expect(counter(page)).toContainText("Plus que 200 mots avant la limite.");

    // The limit itself is still accepted.
    await field.fill(words(SOURCE_TEXT_MAX_WORDS));
    await expect(counter(page)).toHaveAttribute("data-level", "warning");
    await expect(counter(page)).not.toContainText("dépasse la limite");

    // One word past it, and the counter says so itself.
    await field.fill(words(SOURCE_TEXT_MAX_WORDS + 1));
    await expect(counter(page)).toHaveAttribute("data-level", "over");
    await expect(counter(page)).toContainText(
      "Le texte source dépasse la limite de 2000 mots (actuellement 2001).",
    );
  } finally {
    await closeSignedInSession(session);
  }
});

test("a 2001-word source text cannot be turned into a project", async ({ page, context }) => {
  const session = await openSignedInSession();

  try {
    await signIn(context, session);

    await page.goto("/projects/new");
    await page.getByLabel("Titre provisoire").fill("Deux mille et un");
    await page.getByRole("button", { name: "Suivant" }).click();

    const overLimit = Array.from({ length: SOURCE_TEXT_MAX_WORDS + 1 }, () => "mot").join(" ");
    await page.getByLabel("Texte source").fill(overLimit);
    await page.getByRole("button", { name: "Suivant" }).click();

    // Refused with the count, not merely with "too long" — and still on the
    // step, so the language select the next step alone renders never appears.
    await expect(page.locator("p[role='alert']")).toContainText(
      "Le texte source dépasse la limite de 2000 mots (actuellement 2001).",
    );
    await expect(page.getByLabel("Texte source")).toBeVisible();
    await expect(page.getByLabel("Langue du texte")).toHaveCount(0);
  } finally {
    await closeSignedInSession(session);
  }
});

test("French typography is counted the same in the browser as in the shared rule", async ({
  page,
  context,
}) => {
  const session = await openSignedInSession();

  try {
    await signIn(context, session);

    await page.goto("/projects/new");
    await page.getByLabel("Titre provisoire").fill("Cas typographiques");
    await page.getByRole("button", { name: "Suivant" }).click();

    const field = page.getByLabel("Texte source");

    // Each case typed into a real textarea — the one place the characters
    // survive a round trip through React state and the DOM, which is what the
    // unit suite cannot exercise.
    for (const { text, wordCount } of [
      { text: "l'alpha qu'un rendez-vous", wordCount: 3 },
      { text: `${String.fromCodePoint(0x2014)} Alpha, dit-il.`, wordCount: 2 },
      { text: `alpha${String.fromCodePoint(0x2014)}beta`, wordCount: 2 },
      { text: `alpha${String.fromCodePoint(0x2026)}beta`, wordCount: 2 },
      {
        text: `«${String.fromCodePoint(0x00a0)}alpha beta${String.fromCodePoint(0x00a0)}»`,
        wordCount: 2,
      },
      { text: `alpha${String.fromCodePoint(0x200b)}beta`, wordCount: 2 },
      { text: "1789 3.14 1,5", wordCount: 3 },
    ]) {
      await field.fill(text);
      await expect(counter(page)).toContainText(`${wordCount} / 2000 mots`);
    }
  } finally {
    await closeSignedInSession(session);
  }
});
