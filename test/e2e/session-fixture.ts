/**
 * The end-to-end fixture that puts a signed-in browser in front of the app
 * (CAL-024).
 *
 * **Why it lives at the repository root rather than in `apps/web/tests/`.**
 * §3.5 forbids anything under `apps/web` from naming the database, and the rule
 * is a lint glob over the whole app, tests included. Seeding a session is not
 * an entry point and never ships, but bending the glob to say so would reopen
 * the boundary for everything else beneath it. This directory is where CAL-004
 * already put test wiring that no domain owns, so it is where the fixture goes.
 *
 * It writes the session directly, for the reason the integration suite does:
 * no provider exists until CAL-025, so there is no sign-in form to drive.
 * `createSession` is the call a provider callback makes once it has verified an
 * identity, and the row it writes is the one a browser's cookie points at.
 *
 * **The `package.json` beside this file says `"type": "commonjs"`, and it has
 * to.** Playwright compiles specs to the module format of the config's own
 * package (`apps/web`, which is CommonJS), while the repository root declares
 * `"type": "module"` — so without it Node loads this file's CommonJS output as
 * an ES module and fails on `exports is not defined`. Four lines of manifest
 * rather than a hole in the boundary above.
 *
 * `DATABASE_URL` is loaded by `apps/web/playwright.config.ts`, which is the
 * process that starts everything here; Prisma reads it from the environment.
 */

import { createHash, randomUUID } from "node:crypto";

import { type $Enums, PrismaClient } from "@prisma/client";

/** The name Auth.js gives its session cookie over plain HTTP. */
export const SESSION_COOKIE = "authjs.session-token";

export interface SignedInSession {
  readonly userId: string;
  readonly email: string;
  readonly sessionToken: string;
}

/**
 * Creates an account and a live session for it, and returns what the browser
 * needs to present. The address is unique per call so parallel specs never
 * collide on `User.email`.
 */
export async function openSignedInSession(): Promise<SignedInSession> {
  const prisma = new PrismaClient();

  try {
    const email = `e2e-${randomUUID()}@example.test`;
    const user = await prisma.user.create({ data: { email, name: "Autrice de test" } });
    const sessionToken = randomUUID();

    await prisma.session.create({
      data: {
        sessionToken,
        userId: user.id,
        expires: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });

    return { userId: user.id, email, sessionToken };
  } finally {
    await prisma.$disconnect();
  }
}

/**
 * Removes the account the fixture created, and its session with it.
 *
 * `deleteMany`, not `delete`: since CAL-031 a spec can legitimately have
 * deleted the account already, and a `finally` block that threw `P2025` would
 * fail the test that just proved the feature works.
 *
 * Projects first, same as `@calepin/shared/account`'s `deleteAccount`
 * (lessons.md): `ChapterRevision.createdBy` is `onDelete: Restrict`, and
 * `seedProjectWithChapters` credits the fixture's own user as the author, so
 * deleting the user first is refused over rows its own projects' cascade was
 * about to remove.
 */
export async function closeSignedInSession(session: SignedInSession): Promise<void> {
  const prisma = new PrismaClient();

  try {
    await prisma.project.deleteMany({ where: { userId: session.userId } });
    await prisma.user.deleteMany({ where: { id: session.userId } });
  } finally {
    await prisma.$disconnect();
  }
}

/**
 * Links an OAuth provider to a fixture user (CAL-029), the way
 * `resolveOAuthAccountLink` (CAL-026/027) would after a real sign-in. Only
 * the fields the account page reads matter here — `provider` — so the rest
 * is filled with the minimum the schema requires.
 */
export async function linkAccount(userId: string, provider: string): Promise<void> {
  const prisma = new PrismaClient();

  try {
    await prisma.account.create({
      data: { userId, provider, providerAccountId: randomUUID(), type: "oauth" },
    });
  } finally {
    await prisma.$disconnect();
  }
}

export interface SeededProject {
  readonly projectId: string;
  readonly title: string;
}

/**
 * A project with a plan behind it — one written chapter, one not (CAL-032):
 * enough for the dashboard's aggregates to read as non-trivial in a browser.
 *
 * Writes `updatedById` explicitly rather than pulling in
 * `@calepin/shared/audit`'s extension: the fixture writes once, so naming the
 * author on each call is simpler than wrapping the client for it.
 *
 * No matching teardown: `Project.user` cascades (`onDelete: Cascade`), so
 * `closeSignedInSession`'s own deletes already remove everything this
 * function creates.
 */
export async function seedProjectWithChapters(
  userId: string,
  title: string,
): Promise<SeededProject> {
  const prisma = new PrismaClient();

  try {
    const project = await prisma.project.create({ data: { userId, title, updatedById: userId } });
    const bible = await prisma.bible.create({
      data: { projectId: project.id, updatedById: userId },
    });
    const outline = await prisma.outline.create({
      data: { projectId: project.id, bibleId: bible.id, updatedById: userId },
    });
    const part = await prisma.part.create({
      data: { outlineId: outline.id, orderKey: "i", title: "Partie 1", updatedById: userId },
    });

    const writtenChapter = await prisma.chapter.create({
      data: {
        outlineId: outline.id,
        bibleId: bible.id,
        partId: part.id,
        orderKey: "i",
        updatedById: userId,
      },
    });
    await prisma.chapterRevision.create({
      data: {
        chapterId: writtenChapter.id,
        revisionNumber: 1,
        origin: "GENERATED",
        content: "fixture",
        wordCount: 250,
        createdById: userId,
      },
    });

    await prisma.chapter.create({
      data: {
        outlineId: outline.id,
        bibleId: bible.id,
        partId: part.id,
        orderKey: "r",
        updatedById: userId,
      },
    });

    // The two counters CAL-033 stores on the row are maintained by the write
    // paths in `@calepin/manuscript`, which this fixture bypasses — it writes
    // its revision directly. They are set to what it actually seeded: one
    // written chapter, worth 250 words. Reconciling instead would mean
    // registering the database seam inside a Playwright fixture, which is a
    // dependency this file exists to avoid.
    await prisma.project.update({
      where: { id: project.id },
      data: { writtenChapterCount: 1, totalWordCount: 250, updatedById: userId },
    });

    return { projectId: project.id, title };
  } finally {
    await prisma.$disconnect();
  }
}

/**
 * A project with a source text and a plan already built on it (CAL-046) — what
 * the source-text editor needs in front of it before an edit can put anything
 * in doubt.
 *
 * The two instants are forced, and the order between them is the point: the
 * founding version is written first, the bible, the plan and the chapters after
 * it, and the edit the spec performs lands now — later than both. Raw SQL for
 * the stamping, because `@updatedAt` is applied client-side by Prisma and a
 * normal `update` would overwrite the very column being set.
 */
export async function seedProjectWithSourceTextAndPlan(
  userId: string,
  title: string,
  content: string,
): Promise<SeededProject> {
  const prisma = new PrismaClient();
  const foundingVersionWrittenAt = new Date("2019-01-01T00:00:00.000Z");
  const stagesProducedAt = new Date("2020-01-01T00:00:00.000Z");

  try {
    const project = await prisma.project.create({ data: { userId, title, updatedById: userId } });

    const sourceText = await prisma.sourceText.create({
      data: { projectId: project.id, updatedById: userId },
    });
    await prisma.sourceTextVersion.create({
      data: {
        sourceTextId: sourceText.id,
        versionNumber: 1,
        content,
        wordCount: content.split(/\s+/u).filter(Boolean).length,
        editedById: userId,
      },
    });

    const bible = await prisma.bible.create({
      data: { projectId: project.id, updatedById: userId },
    });
    const outline = await prisma.outline.create({
      data: { projectId: project.id, bibleId: bible.id, updatedById: userId },
    });
    const part = await prisma.part.create({
      data: { outlineId: outline.id, orderKey: "i", title: "Partie 1", updatedById: userId },
    });

    for (const orderKey of ["i", "r"]) {
      await prisma.chapter.create({
        data: {
          outlineId: outline.id,
          bibleId: bible.id,
          partId: part.id,
          orderKey,
          updatedById: userId,
        },
      });
    }

    await prisma.$executeRaw`
      UPDATE "source_text_versions" SET "createdAt" = ${foundingVersionWrittenAt}
      WHERE "sourceTextId" = ${sourceText.id}
    `;
    await prisma.$executeRaw`
      UPDATE "bibles" SET "updatedAt" = ${stagesProducedAt} WHERE "id" = ${bible.id}
    `;
    await prisma.$executeRaw`
      UPDATE "outlines" SET "updatedAt" = ${stagesProducedAt} WHERE "id" = ${outline.id}
    `;
    await prisma.$executeRaw`
      UPDATE "chapters" SET "updatedAt" = ${stagesProducedAt} WHERE "outlineId" = ${outline.id}
    `;

    return { projectId: project.id, title };
  } finally {
    await prisma.$disconnect();
  }
}

/**
 * A project with an analysis behind it (CAL-072) — three sections, enough to
 * prove the diagnostic screen renders a `FACTUAL` element with its
 * quotation, a labelled `INTERPRETATION` element, and a section left
 * legitimately empty, without seeding all seventeen.
 *
 * No matching teardown, for the reason `seedProjectWithChapters` gives:
 * `Project.user` cascades, so `closeSignedInSession` already removes it.
 */
export async function seedProjectWithAnalysis(
  userId: string,
  title: string,
): Promise<SeededProject> {
  const prisma = new PrismaClient();

  try {
    const project = await prisma.project.create({ data: { userId, title, updatedById: userId } });

    const content =
      "Le vieux pont craquait sous chaque pas. Louise s'arrêta au milieu, regardant l'eau grise couler en contrebas.";
    const sourceText = await prisma.sourceText.create({
      data: { projectId: project.id, updatedById: userId },
    });
    const sourceTextVersion = await prisma.sourceTextVersion.create({
      data: {
        sourceTextId: sourceText.id,
        versionNumber: 1,
        content,
        wordCount: content.split(/\s+/u).filter(Boolean).length,
        editedById: userId,
      },
    });

    const analysis = await prisma.analysis.create({
      data: { projectId: project.id, updatedById: userId },
    });

    const summary = await prisma.analysisSectionRevision.create({
      data: {
        analysisId: analysis.id,
        section: "FACTUAL_SUMMARY",
        revisionNumber: 1,
        origin: "GENERATED",
        sourceTextVersionId: sourceTextVersion.id,
        createdById: userId,
      },
    });
    await prisma.analysisElement.create({
      data: {
        sectionRevisionId: summary.id,
        position: 1,
        kind: "FACTUAL",
        origin: "GENERATED",
        statement: "Louise s'arrête au milieu d'un pont et observe la rivière.",
      },
    });

    const themes = await prisma.analysisSectionRevision.create({
      data: {
        analysisId: analysis.id,
        section: "THEMES",
        revisionNumber: 1,
        origin: "GENERATED",
        sourceTextVersionId: sourceTextVersion.id,
        createdById: userId,
      },
    });
    await prisma.analysisElement.create({
      data: {
        sectionRevisionId: themes.id,
        position: 1,
        kind: "FACTUAL",
        origin: "GENERATED",
        label: "Le pont",
        statement: "Le texte insiste sur l'état vétuste du pont.",
        evidence: "Le vieux pont craquait sous chaque pas.",
      },
    });
    await prisma.analysisElement.create({
      data: {
        sectionRevisionId: themes.id,
        position: 2,
        kind: "INTERPRETATION",
        origin: "GENERATED",
        label: "La contemplation",
        statement: "Le passage suggère un moment de pause réflexive plutôt qu'une action.",
      },
    });

    // No elements: `RELATIONSHIPS` allows zero, and the screen must show that
    // as a legitimate empty state rather than as a missing section.
    await prisma.analysisSectionRevision.create({
      data: {
        analysisId: analysis.id,
        section: "RELATIONSHIPS",
        revisionNumber: 1,
        origin: "GENERATED",
        sourceTextVersionId: sourceTextVersion.id,
        createdById: userId,
      },
    });

    return { projectId: project.id, title };
  } finally {
    await prisma.$disconnect();
  }
}

/**
 * A project with three proposed directions (CAL-082) — enough to prove the
 * comparison screen renders three cards, flags a narrative-engine axis that
 * differs while leaving a shared one alone, shows an argued critique for the
 * directions that have one, and says so plainly for the one that does not.
 *
 * All three share `protagonistStake` and differ on `conflictNature`, so the
 * screen's divergence highlight has exactly one axis to flag and at least one
 * to leave unflagged — deterministic, rather than left to chance.
 *
 * **It also seeds the source text and the validated analysis the directions
 * descend from** (CAL-086). Three proposals exist in the product only after an
 * analysis has been validated — that is what `DIRECTION_TO_CHOOSE` means — and
 * `selectCanonicalDirection` refuses a choice before it, so a fixture without
 * them would be describing a state the product cannot reach. The status is set
 * here rather than reconciled: these rows are written directly, and the column
 * is what a fixture is entitled to state.
 *
 * No matching teardown, for the reason `seedProjectWithChapters` gives:
 * `Project.user` cascades, so `closeSignedInSession` already removes it.
 */
export async function seedProjectWithDirections(
  userId: string,
  title: string,
): Promise<SeededProject> {
  const prisma = new PrismaClient();

  try {
    const project = await prisma.project.create({
      data: { userId, title, updatedById: userId, status: "DIRECTION_TO_CHOOSE" },
    });

    const sourceText = await prisma.sourceText.create({
      data: { projectId: project.id, updatedById: userId },
    });
    await prisma.sourceTextVersion.create({
      data: {
        sourceTextId: sourceText.id,
        versionNumber: 1,
        content: "Le vieux pont craquait sous chaque pas.",
        wordCount: 7,
        editedById: userId,
      },
    });
    // `analyses_validation_check` demands the two validation columns move
    // together — a validation with no author is not one.
    await prisma.analysis.create({
      data: {
        projectId: project.id,
        validatedAt: new Date(),
        validatedById: userId,
        updatedById: userId,
      },
    });

    const sharedEngine = {
      tensionSource: "pursuit",
      protagonistStake: "life",
      shiftTrigger: "revelation",
      resolutionNature: "victory",
    };

    const directionsData = [
      {
        workingTitle: "Le fleuve remonté",
        conflictNature: "interpersonal",
        evaluated: true,
      },
      {
        workingTitle: "L'orage annoncé",
        conflictNature: "societal",
        evaluated: true,
      },
      {
        workingTitle: "Le silence du puits",
        conflictNature: "internal",
        evaluated: false,
      },
    ];

    for (const data of directionsData) {
      const direction = await prisma.creativeDirection.create({
        data: {
          projectId: project.id,
          workingTitle: data.workingTitle,
          developedPremise: "Prémisse de démonstration pour la comparaison des directions.",
          dominantGenre: "Roman contemporain",
          mainConflict: "Conflit de démonstration.",
          protagonistArc: "Trajectoire de démonstration.",
          // At least two, matching DIRECTION_LIST_COUNTS' own minimum
          // (@calepin/direction) — a real propose-directions answer could
          // never produce fewer, and CAL-085's edit form re-validates the
          // whole direction against that same bound.
          newStakes: ["Enjeu de démonstration", "Second enjeu de démonstration"],
          charactersToIntroduce: ["Personnage de démonstration"],
          endingNature: "Fin ouverte",
          mainRisks: ["Risque de démonstration", "Second risque de démonstration"],
          elementsKeptFromSource: ["Le décor du fleuve", "Le rythme des saisons"],
          elementsTransformed: ["Le dénouement"],
          novelPotentialAssessment: "Évaluation de démonstration du potentiel romanesque.",
          narrativeEngine: { conflictNature: data.conflictNature, ...sharedEngine },
          origin: "PROPOSED",
          updatedById: userId,
        },
      });

      if (data.evaluated) {
        await prisma.directionEvaluation.create({
          data: {
            directionId: direction.id,
            promises: [
              {
                label: "Une tension familiale tenue",
                element: "mainConflict",
                evidence: null,
                whatItCommitsTo: "La direction promet de tenir la tension jusqu'au dénouement.",
              },
              {
                label: "Un décor exploité",
                element: "elementsKeptFromSource",
                evidence: null,
                whatItCommitsTo: "Le fleuve reste un repère pour le lecteur.",
              },
            ],
            shortfalls: [
              {
                label: "Un enjeu peu développé",
                element: "newStakes",
                evidence: null,
                whyAtRisk: "L'enjeu annoncé n'est pas repris ailleurs dans la direction.",
              },
              {
                label: "Une fin ouverte fragile",
                element: "endingNature",
                evidence: null,
                whyAtRisk: "Rien n'indique comment l'ouverture serait exploitée.",
              },
            ],
            conventions: [
              {
                label: "Un dénouement attendu",
                element: "endingNature",
                evidence: null,
                whyConventional: "La fin ouverte est la résolution la plus courante du genre.",
              },
            ],
            comparativeWeaknesses: [
              {
                label: "Un protagoniste moins engagé",
                element: "protagonistArc",
                evidence: null,
                whyLessInteresting: "La trajectoire proposée est moins risquée que ses voisines.",
              },
            ],
            createdById: userId,
          },
        });
      }
    }

    return { projectId: project.id, title };
  } finally {
    await prisma.$disconnect();
  }
}

/**
 * Every version of a project's source text, newest first — what a spec asserts
 * an edit against, since the browser only ever shows the current one.
 */
export async function listSourceTextVersions(
  projectId: string,
): Promise<{ versionNumber: number; content: string; wordCount: number }[]> {
  const prisma = new PrismaClient();

  try {
    return await prisma.sourceTextVersion.findMany({
      where: { sourceText: { projectId } },
      orderBy: { versionNumber: "desc" },
      select: { versionNumber: true, content: true, wordCount: true },
    });
  } finally {
    await prisma.$disconnect();
  }
}

/**
 * Overwrites a project's status directly — the dashboard's search/sort/filter
 * specs (CAL-036) need a project at a status other than the default `DRAFT`
 * without driving an entire generation through the browser to earn one.
 */
export async function setProjectStatus(
  projectId: string,
  status: $Enums.ProjectStatus,
): Promise<void> {
  const prisma = new PrismaClient();

  try {
    await prisma.project.update({ where: { id: projectId }, data: { status } });
  } finally {
    await prisma.$disconnect();
  }
}

/**
 * Writes a `Generation` row directly, `QUEUED` or `RUNNING` — the persistent
 * indicator's spec (CAL-039) needs one without a mission registry
 * (`@calepin/ai`, CAL-048) or a worker (CAL-060) to produce it for real.
 */
export async function seedRunningGeneration(
  projectId: string,
  userId: string,
  mission: $Enums.GenerationMission,
): Promise<string> {
  const prisma = new PrismaClient();

  try {
    const generation = await prisma.generation.create({
      data: {
        projectId,
        mission,
        input: {},
        // A key of the shape `generations_idempotency_key_check` demands
        // (CAL-058). The spec drives the indicator, not the deduplication, so
        // what matters here is only that two fixture generations stay distinct.
        idempotencyKey: createHash("sha256")
          .update(`${projectId}:${mission}:${Date.now()}:${Math.random()}`, "utf8")
          .digest("hex"),
        status: "RUNNING",
        updatedById: userId,
      },
    });

    return generation.id;
  } finally {
    await prisma.$disconnect();
  }
}

/** Moves a generation to a terminal status — CAL-039's spec proves the
 * indicator's poll picks up a generation finishing without a page reload. */
export async function setGenerationStatus(
  generationId: string,
  status: $Enums.GenerationStatus,
): Promise<void> {
  const prisma = new PrismaClient();

  try {
    await prisma.generation.update({
      where: { id: generationId },
      data: { status, completedAt: new Date() },
    });
  } finally {
    await prisma.$disconnect();
  }
}

/**
 * Writes a named step and percentage directly onto a `Generation` row —
 * CAL-062's spec proves the progress stream's own tick picks the change up
 * without a page reload, the same "seed the effect, drive the screen" shape
 * `setGenerationStatus` above already uses in place of a real executor.
 */
export async function setGenerationProgress(
  generationId: string,
  progress: { step: string; percent?: number },
): Promise<void> {
  const prisma = new PrismaClient();

  try {
    await prisma.generation.update({
      where: { id: generationId },
      data: { progressStep: progress.step, progressPercent: progress.percent ?? null },
    });
  } finally {
    await prisma.$disconnect();
  }
}

/**
 * A generation that has failed for good, with an attempt behind it (CAL-063).
 *
 * Written directly, for the reason `seedRunningGeneration` above gives: there is
 * no mission registry and no executor yet, so there is nothing in the product
 * that can *produce* a failure. What the spec drives is the screen and the
 * replay, and both need a row in exactly this shape.
 *
 * The attempt row matters as much as the generation: without one there is no
 * attempt count to render, and — more to the point — the replay's raised ceiling
 * is computed from the attempts, so a fixture with none would not exercise it.
 */
export async function seedFailedGeneration(
  projectId: string,
  userId: string,
  mission: $Enums.GenerationMission,
  failure: { errorCode: string; errorCategory: $Enums.ErrorCategory },
): Promise<string> {
  const prisma = new PrismaClient();

  try {
    const generation = await prisma.generation.create({
      data: {
        projectId,
        mission,
        input: {},
        idempotencyKey: createHash("sha256")
          .update(`${projectId}:${mission}:${Date.now()}:${Math.random()}`, "utf8")
          .digest("hex"),
        status: "FAILED",
        completedAt: new Date(),
        errorCode: failure.errorCode,
        errorCategory: failure.errorCategory,
        failureClass: "PERMANENT",
        updatedById: userId,
      },
    });

    await prisma.generationAttempt.create({
      data: {
        generationId: generation.id,
        attempt: 1,
        model: "claude-opus-5",
        status: "FAILED",
        completedAt: new Date(),
        errorCode: failure.errorCode,
        errorCategory: failure.errorCategory,
      },
    });

    return generation.id;
  } finally {
    await prisma.$disconnect();
  }
}

/**
 * What a generation's row says now — the oracle CAL-063's replay spec needs.
 *
 * On the screen the replay looks like a banner disappearing, and a banner can
 * disappear for the wrong reasons. What the button has to have done is move the
 * row, so that is what is read.
 */
export async function readGenerationState(
  generationId: string,
): Promise<{ status: $Enums.GenerationStatus; attemptCeiling: number | null }> {
  const prisma = new PrismaClient();

  try {
    return await prisma.generation.findUniqueOrThrow({
      where: { id: generationId },
      select: { status: true, attemptCeiling: true },
    });
  } finally {
    await prisma.$disconnect();
  }
}

/**
 * The titles of one account's projects, most recently modified first — what
 * CAL-035's specs check a rename and a duplication against.
 *
 * In the database rather than on the screen, for the reason `userExists` gives:
 * a duplication asserted only through the interface would pass just as happily
 * against a page that re-rendered the original.
 */
export async function listProjectTitles(userId: string): Promise<string[]> {
  const prisma = new PrismaClient();

  try {
    const projects = await prisma.project.findMany({
      where: { userId },
      orderBy: { createdAt: "asc" },
      select: { title: true },
    });

    return projects.map((project) => project.title);
  } finally {
    await prisma.$disconnect();
  }
}

/** How many chapters a project holds — the copy's own, never the original's. */
export async function countChapters(projectId: string): Promise<number> {
  const prisma = new PrismaClient();

  try {
    return await prisma.chapter.count({ where: { outline: { projectId } } });
  } finally {
    await prisma.$disconnect();
  }
}

export async function projectExists(projectId: string): Promise<boolean> {
  const prisma = new PrismaClient();

  try {
    return (await prisma.project.count({ where: { id: projectId } })) > 0;
  } finally {
    await prisma.$disconnect();
  }
}

export interface ProjectFields {
  readonly status: $Enums.ProjectStatus;
  readonly language: string;
  readonly targetLength: $Enums.TargetLength;
  readonly targetAudience: string;
  readonly freedomLevel: $Enums.FreedomLevel;
  readonly sourceTextVersionCount: number;
}

/** What CAL-040's wizard actually wrote — read back for the creation spec, never through the screen alone. */
export async function getProjectFields(projectId: string): Promise<ProjectFields | null> {
  const prisma = new PrismaClient();

  try {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: { sourceText: { include: { _count: { select: { versions: true } } } } },
    });

    if (project === null) return null;

    return {
      status: project.status,
      language: project.language,
      targetLength: project.targetLength,
      targetAudience: project.targetAudience,
      freedomLevel: project.freedomLevel,
      sourceTextVersionCount: project.sourceText?._count.versions ?? 0,
    };
  } finally {
    await prisma.$disconnect();
  }
}

/**
 * The first source text version a project stored — CAL-041's half of the
 * "client and server never diverge" proof.
 *
 * The browser side reads the number the counter displayed; this reads the
 * number and the text the database actually holds, so the spec can assert the
 * two are the same rather than that each is individually plausible.
 */
export async function getFirstSourceTextVersion(
  projectId: string,
): Promise<{ content: string; wordCount: number } | null> {
  const prisma = new PrismaClient();

  try {
    const version = await prisma.sourceTextVersion.findFirst({
      where: { sourceText: { projectId } },
      orderBy: { versionNumber: "asc" },
      select: { content: true, wordCount: true },
    });

    return version;
  } finally {
    await prisma.$disconnect();
  }
}

/** Whether a session row is still live — CAL-029's proof that sign-out invalidates it. */
export async function sessionExists(sessionToken: string): Promise<boolean> {
  const prisma = new PrismaClient();

  try {
    const session = await prisma.session.findUnique({ where: { sessionToken } });
    return session !== null;
  } finally {
    await prisma.$disconnect();
  }
}

/**
 * Whether the account row is still there — CAL-031's proof, in the database
 * rather than in the browser.
 *
 * The screen saying "votre compte a été supprimé" is what the visitor sees;
 * this is what says it is true. A deletion asserted only through the interface
 * would pass just as happily against a sign-out.
 */
export async function userExists(userId: string): Promise<boolean> {
  const prisma = new PrismaClient();

  try {
    return (await prisma.user.count({ where: { id: userId } })) > 0;
  } finally {
    await prisma.$disconnect();
  }
}

/**
 * A project whose bible holds three characters and five directed ties
 * (CAL-091).
 *
 * The graph is deliberately not symmetric, because that is what the screen
 * under test exists to show: Alix and Bernard declare the same tie from both
 * sides, Alix declares one toward Camille that Camille never answers, and
 * Bernard and Camille name the same tie differently. One fixture, three
 * classifications.
 */
export async function seedProjectWithRelationships(
  userId: string,
  title: string,
): Promise<SeededProject> {
  const prisma = new PrismaClient();

  try {
    const project = await prisma.project.create({
      data: { userId, title, updatedById: userId },
    });

    const bible = await prisma.bible.create({
      data: { projectId: project.id, updatedById: userId },
    });

    const names = ["Alix Renard", "Bernard Coste", "Camille Vasseur"];
    const ids: string[] = [];

    for (const name of names) {
      const character = await prisma.character.create({
        data: {
          bibleId: bible.id,
          name,
          importance: "MAIN",
          origin: "GENERATED",
          updatedById: userId,
        },
      });
      ids.push(character.id);
    }

    const [alix, bernard, camille] = ids;

    if (alix === undefined || bernard === undefined || camille === undefined) {
      throw new Error("the relationship fixture could not seed its cast");
    }

    const ties = [
      { from: alix, to: bernard, type: "FRIENDSHIP", label: "amie de", description: null },
      { from: bernard, to: alix, type: "FRIENDSHIP", label: "ami de", description: null },
      {
        from: alix,
        to: camille,
        type: "RIVALRY",
        label: "rivale de",
        description: "Elle sait ce que Camille a signé, et ne l'a dit à personne.",
      },
      { from: bernard, to: camille, type: "ALLIANCE", label: "allié de", description: null },
      {
        from: camille,
        to: bernard,
        type: "PROFESSIONAL",
        label: "employeur de",
        description: null,
      },
    ] as const;

    for (const tie of ties) {
      await prisma.relationship.create({
        data: {
          bibleId: bible.id,
          fromCharacterId: tie.from,
          toCharacterId: tie.to,
          type: tie.type,
          label: tie.label,
          description: tie.description,
          origin: "GENERATED",
          updatedById: userId,
        },
      });
    }

    return { projectId: project.id, title };
  } finally {
    await prisma.$disconnect();
  }
}

/**
 * A bible carrying one row in every section CAL-096's screen reads, with
 * three things planted on purpose: an identity left unvalidated (so it reads
 * "Proposition du modèle"), a canon fact confirmed into the canon (so it
 * reads "Élément validé"), and a locked world rule (so the lock badge has
 * something to show). One characteristic, otherwise-unlikely word —
 * "chaudronnerie" — sits nowhere but in one canon fact's statement, which is
 * what a search spec asserts against rather than a word common enough to
 * match by accident.
 */
export async function seedProjectWithBible(userId: string, title: string): Promise<SeededProject> {
  const prisma = new PrismaClient();

  try {
    const project = await prisma.project.create({
      data: { userId, title, updatedById: userId },
    });

    const bible = await prisma.bible.create({
      data: { projectId: project.id, updatedById: userId },
    });

    await prisma.bibleIdentity.create({
      data: {
        bibleId: bible.id,
        workingTitle: "Le dernier quart",
        genre: "Roman social",
        subGenre: "Chronique ouvrière",
        tone: "Sobre",
        narrativePromise: "Une usine ferme, et ceux qui restent doivent se choisir un avenir.",
        centralQuestion: "Que devient-on quand le métier qu'on a appris disparaît ?",
        endingNature: "Fin ouverte",
        origin: "GENERATED",
        updatedById: userId,
      },
    });

    await prisma.bibleStyle.create({
      data: {
        bibleId: bible.id,
        pointOfView: "Troisième personne",
        focalization: "Alternée",
        tense: "Passé simple",
        languageRegister: "Populaire, technique par endroits",
        descriptiveDensity: "Élevée sur les gestes du travail",
        pacing: "Régulier",
        dialogueBalance: "Dense",
        origin: "GENERATED",
        updatedById: userId,
      },
    });

    await prisma.bibleWorld.create({
      data: {
        bibleId: bible.id,
        era: "Années 1980",
        socialContext: "Bassin industriel en reconversion",
        origin: "GENERATED",
        updatedById: userId,
      },
    });

    const character = await prisma.character.create({
      data: {
        bibleId: bible.id,
        name: "Robert Fassin",
        importance: "MAIN",
        role: "Chef d'atelier",
        origin: "GENERATED",
        updatedById: userId,
      },
    });

    await prisma.place.create({
      data: {
        bibleId: bible.id,
        name: "Atelier de chaudronnerie",
        description: "Le dernier atelier encore en activité.",
        origin: "GENERATED",
        updatedById: userId,
      },
    });

    // Locked, so LockBadge has a real row to render for.
    await prisma.worldRule.create({
      data: {
        bibleId: bible.id,
        name: "Fermeture programmée",
        statement: "L'usine ferme dans six mois, quoi qu'il arrive.",
        origin: "GENERATED",
        lockedAt: new Date(),
        updatedById: userId,
      },
    });

    const event = await prisma.timelineEvent.create({
      data: {
        bibleId: bible.id,
        name: "Annonce de la fermeture",
        category: "BACKSTORY",
        absoluteDay: -10,
        datePrecision: "DAY",
        origin: "GENERATED",
        updatedById: userId,
      },
    });
    await prisma.timelineEventParticipant.create({
      data: {
        bibleId: bible.id,
        eventId: event.id,
        characterId: character.id,
        updatedById: userId,
      },
    });

    // Confirmed, so its badge reads "Élément validé" — CanonFact's own
    // provenance signal (status), independent of the identity's above.
    await prisma.canonFact.create({
      data: {
        bibleId: bible.id,
        statement: "Robert connaît un poste en chaudronnerie dans la ville voisine.",
        isTrue: true,
        source: "BIBLE",
        status: "CONFIRMED",
        updatedById: userId,
      },
    });

    return { projectId: project.id, title };
  } finally {
    await prisma.$disconnect();
  }
}
