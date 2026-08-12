/**
 * CAL-099's journey: a bible that contradicts itself cannot be validated until
 * the author has ruled on the contradiction.
 *
 * The refusal itself is proved as a refused write in
 * `test/integration/bible-coherence.integration.test.ts`; what belongs here is
 * the thing only a browser shows — that the author is told what stands in the
 * way before they can act on it, that the validation is closed while it does,
 * and that one click on *Assumer* opens it.
 */

import { type BrowserContext, expect, type Page, test } from "@playwright/test";

import {
  closeSignedInSession,
  openSignedInSession,
  seedProjectWithBible,
  SESSION_COOKIE,
  type SignedInSession,
} from "../../../../test/e2e/session-fixture";

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

/** Writes the same statement twice, once held true and once held false. */
async function writeOpposedFacts(page: Page, projectId: string): Promise<void> {
  for (const truth of ["vrai", "faux"] as const) {
    await page.goto(`/projects/${projectId}/bible/facts`);

    const form = page.getByRole("region", { name: "Écrire un fait" });
    await form.getByLabel("Le fait, en une phrase").fill(STATEMENT);
    await form.getByRole("radio", { name: truth, exact: true }).check();
    await form.getByRole("radio", { name: "toujours vrai, du début à la fin" }).check();
    await form.getByRole("button", { name: "Ajouter ce fait" }).click();

    await expect(
      page.getByRole("list", { name: "Faits canoniques" }).locator("> li").first(),
    ).toBeVisible();
  }
}

test("refuses the validation until the contradiction is arbitrated", async ({ page, context }) => {
  const session = await openSignedInSession();

  try {
    const project = await seedProjectWithBible(session.userId, "Bible contradictoire");
    await signIn(context, session);
    await writeOpposedFacts(page, project.projectId);

    // The screen is reached from the bible, never guessed at.
    await page.goto(`/projects/${project.projectId}/bible`);
    await page.getByRole("link", { name: "Contrôler sa cohérence et la valider" }).click();
    await expect(page.getByRole("heading", { name: "Cohérence de la bible" })).toBeVisible();

    await page.getByRole("button", { name: "Lancer le contrôle" }).click();

    const open = page.getByRole("list", { name: "Signalements ouverts" });
    await expect(open.locator("> li")).toHaveCount(1);
    await expect(open.getByText("Bloquant")).toBeVisible();
    await expect(page.getByText("Une contradiction bloque la validation.")).toBeVisible();

    // Closed while the contradiction stands — and it says so without colour.
    await expect(page.getByRole("button", { name: "Valider la bible" })).toBeDisabled();

    await open.getByRole("button", { name: "Assumer" }).click();

    await expect(page.getByText("Rien ne bloque la validation.")).toBeVisible();
    await expect(open.getByText("Assumé")).toBeVisible();
    await expect(page.getByRole("button", { name: "Valider la bible" })).toBeEnabled();

    // The validation itself is proved as a committed write in
    // `test/integration/bible-coherence.integration.test.ts`, over a project
    // that has walked the whole chain. This fixture's project has neither a
    // validated analysis nor a canonical direction, so `withProjectStatus`
    // refuses it for a different rule — a real one, and not this spec's.
  } finally {
    await closeSignedInSession(session);
  }
});

test("says why a bible cannot be validated out of order", async ({ page, context }) => {
  const session = await openSignedInSession();

  try {
    const project = await seedProjectWithBible(session.userId, "Bible prématurée");
    await signIn(context, session);

    await page.goto(`/projects/${project.projectId}/bible/coherence`);
    await page.getByRole("button", { name: "Lancer le contrôle" }).click();
    await expect(page.getByText("Rien ne bloque la validation.")).toBeVisible();

    await page.getByRole("button", { name: "Valider la bible" }).click();

    // Never *déjà validée*: the project's status cannot legally reach what a
    // validated bible would imply, and the banner says which step is missing.
    await expect(
      page.getByText(
        "La bible ne peut pas être validée à ce stade : l'analyse doit être validée et une direction retenue avant elle.",
      ),
    ).toBeVisible();
  } finally {
    await closeSignedInSession(session);
  }
});

test("keeps the decision when the check is run again", async ({ page, context }) => {
  const session = await openSignedInSession();

  try {
    const project = await seedProjectWithBible(session.userId, "Bible arbitrée");
    await signIn(context, session);
    await writeOpposedFacts(page, project.projectId);

    await page.goto(`/projects/${project.projectId}/bible/coherence`);
    await page.getByRole("button", { name: "Lancer le contrôle" }).click();

    const open = page.getByRole("list", { name: "Signalements ouverts" });
    await open.getByRole("button", { name: "Écarter" }).click();
    await expect(open.getByText("Écarté")).toBeVisible();

    // The whole reason a finding carries a fingerprint: a second run recomputes
    // the same contradiction and must land on the row the author already ruled
    // on, not open a second one beside it.
    await page.getByRole("button", { name: "Lancer le contrôle" }).click();

    await expect(open.locator("> li")).toHaveCount(1);
    await expect(open.getByText("Écarté")).toBeVisible();
  } finally {
    await closeSignedInSession(session);
  }
});
