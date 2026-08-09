import { type BrowserContext, expect, test } from "@playwright/test";

import {
  closeSignedInSession,
  openSignedInSession,
  SESSION_COOKIE,
  type SignedInSession,
} from "../../../../test/e2e/session-fixture";

/**
 * CAL-047's acceptance line, in a browser: uploading a file in the wizard's
 * source-text step fills the field with cleaned text — no residual markup, no
 * doubled spaces, a proper dialogue dash — ready for the author to review
 * before the existing word-limit and submit paths take over (CAL-041's own
 * `word-count.spec.ts` already proves those).
 *
 * The upload content is synthetic and technical (CLAUDE.md §9): what is under
 * test is the pipeline, not prose.
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

const EM_DASH = String.fromCodePoint(0x2014);

test("imports a .txt file into the wizard's source text step, cleaned", async ({
  page,
  context,
}) => {
  const session = await openSignedInSession();

  try {
    await signIn(context, session);

    await page.goto("/projects/new");
    await page.getByLabel("Titre provisoire").fill("Import de fichier");
    await page.getByRole("button", { name: "Suivant" }).click();

    const raw = "Alpha   beta gamma.\n\n-- Bonjour, dit-il.";
    await page.getByLabel(/Importer un fichier/).setInputFiles({
      name: "sample.txt",
      mimeType: "text/plain",
      buffer: Buffer.from(raw, "utf-8"),
    });

    await expect(page.getByLabel("Texte source")).toHaveValue(
      `Alpha beta gamma.\n\n${EM_DASH} Bonjour, dit-il.`,
    );
    // The shared counter reacts to the imported text exactly as it would to
    // typing: "dit-il" is one hyphenated word, so the count is 5, not 6.
    await expect(page.locator("#project-creation-source-text-counter")).toContainText(
      "5 / 2000 mots",
    );
  } finally {
    await closeSignedInSession(session);
  }
});

test("shows a French refusal for an unsupported file extension, field untouched", async ({
  page,
  context,
}) => {
  const session = await openSignedInSession();

  try {
    await signIn(context, session);

    await page.goto("/projects/new");
    await page.getByLabel("Titre provisoire").fill("Fichier refuse");
    await page.getByRole("button", { name: "Suivant" }).click();

    await page.getByLabel(/Importer un fichier/).setInputFiles({
      name: "sample.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("whatever", "utf-8"),
    });

    await expect(page.getByText(/Formats acceptés/)).toBeVisible();
    await expect(page.getByLabel("Texte source")).toHaveValue("");
  } finally {
    await closeSignedInSession(session);
  }
});
