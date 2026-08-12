/**
 * CAL-099's acceptance criterion, against a real PostgreSQL: *une bible
 * contenant deux faits contradictoires ne peut pas être validée sans arbitrage
 * explicite*.
 *
 * The criterion is about a **write**, so it is proved as a refused write and
 * not as a report somebody could have ignored: `Bible.validatedAt` stays null
 * while the contradiction stands, and the same call succeeds once the author
 * has ruled on it. Every refusal here has its accepted twin.
 *
 * The other half is what makes the refusal liveable: an arbitration has to
 * survive the next run of a check that recomputes its findings from scratch.
 * That is `fingerprint`'s whole purpose, and it is asserted by running the
 * check twice around a decision.
 *
 * Cross-owner isolation for the five `quality-issue` entry points is proved
 * here rather than in `owner-access.integration.test.ts`, because it needs a
 * bible that actually contradicts itself — a row every `createProjectGraph`
 * fixture would otherwise have to carry.
 */

import { buildBibleVersionContent } from "@calepin/bible";
import { getReferenceBible, runBibleCoherenceCheck, validateBible } from "@calepin/bible/repository";
import { runWithActor } from "@calepin/shared/audit";
import { BIBLE_COHERENCE_CHECKS, BIBLE_DETERMINISTIC_CHECKS } from "@calepin/shared/coherence";
import { configureDatabaseClient, resetDatabaseClient } from "@calepin/shared/database";
import {
  getBibleOverview,
  getReferenceBibleVersion,
  listQualityIssues,
  listQualityIssuesWithin,
  mintBibleVersion,
  openProjectScope,
  type ProjectScope,
  reconcileQualityIssues,
  refreshProjectStatus,
  setQualityIssueStatus,
} from "@calepin/shared/repository";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createAuditedClient } from "./audited-client";
import { createProjectGraph, type ProjectGraph } from "./project-graph";

const CONTRADICTED = "le père de Nora est vivant";

interface Fixture {
  readonly graph: ProjectGraph;
  readonly scope: ProjectScope;
  readonly bibleId: string;
}

describe("the bible coherence check (CAL-099)", () => {
  const { prisma, setActor } = createAuditedClient();
  const seam = new PrismaClient();
  let sequence = 0;

  beforeAll(() => {
    configureDatabaseClient(seam);
  });

  afterAll(async () => {
    resetDatabaseClient();
    await prisma.$disconnect();
    await seam.$disconnect();
  });

  async function createFixture(): Promise<Fixture> {
    sequence += 1;
    const graph = await createProjectGraph(prisma, setActor, `bible-coherence-${String(sequence)}`);
    const opened = await openProjectScope({ ownerId: graph.ownerId, projectId: graph.projectId });
    if (!opened.ok) throw new Error("the fixture scope was refused");

    return { graph, scope: opened.value, bibleId: graph.rows.Bible };
  }

  /** Two confirmed facts saying the same thing and disagreeing about it. */
  async function contradict(fixture: Fixture): Promise<readonly [string, string]> {
    setActor(fixture.graph.ownerId);

    const held = await prisma.canonFact.create({
      data: {
        bibleId: fixture.bibleId,
        statement: CONTRADICTED,
        isTrue: true,
        validity: "PERMANENT",
        source: "USER",
        status: "CONFIRMED",
      },
      select: { id: true },
    });
    const denied = await prisma.canonFact.create({
      data: {
        bibleId: fixture.bibleId,
        statement: CONTRADICTED,
        isTrue: false,
        validity: "PERMANENT",
        source: "USER",
        status: "CONFIRMED",
      },
      select: { id: true },
    });

    return [held.id, denied.id];
  }

  function asOwner<T>(fixture: Fixture, write: () => Promise<T>): Promise<T> {
    return runWithActor(fixture.graph.ownerId, write);
  }

  async function validatedAt(bibleId: string): Promise<Date | null> {
    const bible = await prisma.bible.findUnique({
      where: { id: bibleId },
      select: { validatedAt: true },
    });

    return bible?.validatedAt ?? null;
  }

  async function collisions(fixture: Fixture) {
    const issues = await listQualityIssues(fixture.scope, {
      checkIds: ["bible-canon-fact-collision"],
    });
    if (!issues.ok) throw new Error("the fixture could not read its own issues");

    return issues.value;
  }

  it("reports the contradiction, and blocks the validation on it", async () => {
    const fixture = await createFixture();
    await contradict(fixture);

    const run = await asOwner(fixture, () => runBibleCoherenceCheck(fixture.scope));

    expect(run.ok).toBe(true);
    expect(run.ok && run.value.blocking.length).toBeGreaterThan(0);

    const [issue] = await collisions(fixture);
    expect(issue?.severity).toBe("CRITICAL");
    expect(issue?.status).toBe("DETECTED");
    expect(issue?.fingerprint).toMatch(/^[0-9a-f]{64}$/);

    const refused = await asOwner(fixture, () => validateBible(fixture.scope));

    expect(refused.ok).toBe(false);
    expect(!refused.ok && refused.error.code).toBe("BIBLE_NOT_COHERENT");
    expect(!refused.ok && refused.error.category).toBe("conflict");
    await expect(validatedAt(fixture.bibleId)).resolves.toBeNull();
  });

  it("validates once the author has ruled on it — and not before", async () => {
    const fixture = await createFixture();
    await contradict(fixture);

    const refused = await asOwner(fixture, () => validateBible(fixture.scope));
    expect(refused.ok).toBe(false);

    const [issue] = await collisions(fixture);
    if (issue === undefined) throw new Error("the run produced no collision to arbitrate");

    const arbitrated = await asOwner(fixture, () =>
      setQualityIssueStatus(fixture.scope, { issueId: issue.id, status: "ACCEPTED" }),
    );
    expect(arbitrated.ok).toBe(true);

    const accepted = await asOwner(fixture, () => validateBible(fixture.scope));

    expect(accepted.ok).toBe(true);
    await expect(validatedAt(fixture.bibleId)).resolves.toBeInstanceOf(Date);
  });

  it("refuses a second validation rather than moving the timestamp", async () => {
    const fixture = await createFixture();

    const first = await asOwner(fixture, () => validateBible(fixture.scope));
    expect(first.ok).toBe(true);

    const again = await asOwner(fixture, () => validateBible(fixture.scope));

    expect(again.ok).toBe(false);
    expect(!again.ok && again.error.category).toBe("conflict");
  });

  it("carries an arbitration across a re-run, and never opens a second row for it", async () => {
    // The whole reason `fingerprint` is a column: a deterministic check
    // recomputes its findings every time, so without a stable identity the
    // second run would insert a fresh DETECTED row beside the accepted one and
    // the validation would be blocked forever.
    const fixture = await createFixture();
    await contradict(fixture);
    await asOwner(fixture, () => runBibleCoherenceCheck(fixture.scope));

    const [issue] = await collisions(fixture);
    if (issue === undefined) throw new Error("the run produced no collision to arbitrate");
    await asOwner(fixture, () =>
      setQualityIssueStatus(fixture.scope, { issueId: issue.id, status: "IGNORED" }),
    );

    await asOwner(fixture, () => runBibleCoherenceCheck(fixture.scope));
    const after = await collisions(fixture);

    expect(after).toHaveLength(1);
    expect(after[0]?.id).toBe(issue.id);
    expect(after[0]?.status).toBe("IGNORED");
  });

  it("closes the issue when the author removes the contradiction instead of accepting it", async () => {
    const fixture = await createFixture();
    const [, denied] = await contradict(fixture);
    await asOwner(fixture, () => runBibleCoherenceCheck(fixture.scope));

    setActor(fixture.graph.ownerId);
    await prisma.canonFact.update({ where: { id: denied }, data: { status: "REJECTED" } });

    const rerun = await asOwner(fixture, () => runBibleCoherenceCheck(fixture.scope));

    expect(rerun.ok && rerun.value.blocking).toEqual([]);
    const after = await collisions(fixture);
    expect(after).toHaveLength(1);
    expect(after[0]?.status).toBe("FIXED");
  });

  it("leaves a model-backed finding alone when a calculable run reconciles", async () => {
    // Scoping a reconciliation to the ids that actually ran is what stops a
    // pass which never asked a question from closing the answer somebody paid
    // for. Here the model check has a row and the calculable run does not
    // produce it — and must not touch it.
    const fixture = await createFixture();

    await asOwner(fixture, () =>
      reconcileQualityIssues(fixture.scope, {
        checkIds: ["bible-opposed-canon-facts"],
        findings: [
          {
            checkId: "bible-opposed-canon-facts",
            category: "FACTUAL_CONTINUITY",
            severity: "CRITICAL",
            anchor: ["fact:one", "fact:two"],
            explanation: "Deux faits que rien ne réconcilie.",
            proposedFix: null,
            fingerprint: "a".repeat(64),
          },
        ],
      }),
    );

    await asOwner(fixture, () => runBibleCoherenceCheck(fixture.scope));

    const issues = await listQualityIssues(fixture.scope, {
      checkIds: ["bible-opposed-canon-facts"],
    });

    expect(issues.ok && issues.value).toHaveLength(1);
    expect(issues.ok && issues.value[0]?.status).toBe("DETECTED");

    // And it blocks the validation exactly as a calculable one does.
    const refused = await asOwner(fixture, () => validateBible(fixture.scope));
    expect(!refused.ok && refused.error.code).toBe("BIBLE_NOT_COHERENT");
  });

  describe("cross-owner isolation", () => {
    it("hides every quality issue entry point from another owner", async () => {
      const mine = await createFixture();
      const theirs = await createFixture();
      await contradict(mine);
      await asOwner(mine, () => runBibleCoherenceCheck(mine.scope));

      const forged = await openProjectScope({
        ownerId: theirs.graph.ownerId,
        projectId: mine.graph.projectId,
      });
      expect(forged.ok).toBe(false);

      // A scope another owner *can* open reaches their own project only.
      const listed = await listQualityIssues(theirs.scope, {
        checkIds: BIBLE_COHERENCE_CHECKS,
      });
      expect(listed.ok && listed.value).toEqual([]);

      const within = await prisma.$transaction((client) =>
        listQualityIssuesWithin(client, theirs.scope, { checkIds: BIBLE_COHERENCE_CHECKS }),
      );
      expect(within).toEqual([]);

      const [issue] = await collisions(mine);
      if (issue === undefined) throw new Error("the run produced no collision to isolate");

      const stolen = await asOwner(theirs, () =>
        setQualityIssueStatus(theirs.scope, { issueId: issue.id, status: "ACCEPTED" }),
      );
      expect(stolen.ok).toBe(false);
      expect(!stolen.ok && stolen.error.code).toBe("NOT_FOUND");

      const reconciled = await asOwner(theirs, () =>
        reconcileQualityIssues(theirs.scope, {
          checkIds: BIBLE_DETERMINISTIC_CHECKS,
          findings: [],
        }),
      );
      expect(reconciled.ok && reconciled.value.closed).toBe(0);
      expect((await collisions(mine))[0]?.status).toBe("DETECTED");
    });

    it("refuses to run or validate another owner's bible", async () => {
      const mine = await createFixture();
      const theirs = await createFixture();

      const run = await asOwner(theirs, () => runBibleCoherenceCheck(theirs.scope));
      expect(run.ok).toBe(true);
      expect(run.ok && run.value.bibleId).toBe(theirs.bibleId);
      expect(run.ok && run.value.bibleId).not.toBe(mine.bibleId);

      await expect(validatedAt(mine.bibleId)).resolves.toBeNull();
    });
  });

  describe("the savepoint and reference bible (CAL-100)", () => {
    interface MinimalFixture {
      readonly ownerId: string;
      readonly projectId: string;
      readonly scope: ProjectScope;
    }

    /**
     * A project carrying nothing past a canonical direction — `Bible` and
     * nothing under it. `createFixture` (`createProjectGraph`) seeds one row in
     * every project-owned table, `BibleVersion` included, which is exactly what
     * the cross-model ownership suite needs and exactly what these tests must
     * not start from: they are about the state *before* a first savepoint
     * exists. Walked stepwise through `refreshProjectStatus`, `SEQUENCE`'s own
     * shape in `project-status.integration.test.ts`, so the stored status is
     * never more than one legal step from the rows — `validateBible` refuses
     * otherwise.
     */
    async function seedBibleReadyToValidate(label: string): Promise<MinimalFixture> {
      const user = await prisma.user.create({ data: { email: `${label}@example.test`, name: "Test User" } });
      setActor(user.id);
      const project = await prisma.project.create({ data: { title: label, userId: user.id } });
      const opened = await openProjectScope({ ownerId: user.id, projectId: project.id });
      if (!opened.ok) throw new Error("the fixture scope was refused");
      const scope = opened.value;

      const sourceText = await prisma.sourceText.create({ data: { projectId: project.id } });
      await prisma.sourceTextVersion.create({
        data: {
          sourceTextId: sourceText.id,
          versionNumber: 1,
          content: "fixture text",
          wordCount: 2,
          editedById: user.id,
        },
      });
      await refreshProjectStatus(scope);

      await prisma.analysis.create({
        data: { projectId: project.id, validatedAt: new Date(), validatedById: user.id },
      });
      await refreshProjectStatus(scope);

      await prisma.creativeDirection.create({
        data: {
          projectId: project.id,
          workingTitle: "fixture",
          developedPremise: "fixture",
          dominantGenre: "fixture",
          mainConflict: "fixture",
          protagonistArc: "fixture",
          endingNature: "fixture",
          novelPotentialAssessment: "fixture",
          narrativeEngine: {
            conflictNature: "interpersonal",
            tensionSource: "pursuit",
            protagonistStake: "life",
            shiftTrigger: "revelation",
            resolutionNature: "victory",
          },
          origin: "PROPOSED",
          isCanonical: true,
        },
      });
      await refreshProjectStatus(scope);

      await prisma.bible.create({ data: { projectId: project.id } });

      return { ownerId: user.id, projectId: project.id, scope };
    }

    async function storedStatus(projectId: string): Promise<string | undefined> {
      return (await prisma.project.findUnique({ where: { id: projectId }, select: { status: true } }))
        ?.status;
    }

    it("mints version 1 with the validated content, and none before validation", async () => {
      const fixture = await seedBibleReadyToValidate("cal-100-mint");

      await expect(getReferenceBible(fixture.scope)).resolves.toBeNull();

      const overview = await getBibleOverview(fixture.scope);
      if (overview === null) throw new Error("the fixture bible could not be read");
      const expectedContent = buildBibleVersionContent(overview);

      const validated = await runWithActor(fixture.ownerId, () => validateBible(fixture.scope));
      expect(validated.ok).toBe(true);
      expect(validated.ok && validated.value.versionNumber).toBe(1);

      const reference = await getReferenceBible(fixture.scope);
      expect(reference?.versionNumber).toBe(1);
      expect(reference?.content).toEqual(expectedContent);
    });

    it("carries the bible through BIBLE_TO_VALIDATE to OUTLINE_IN_PROGRESS", async () => {
      const fixture = await seedBibleReadyToValidate("cal-100-status");

      await expect(storedStatus(fixture.projectId)).resolves.toBe("BIBLE_TO_VALIDATE");

      const validated = await runWithActor(fixture.ownerId, () => validateBible(fixture.scope));
      expect(validated.ok).toBe(true);

      await expect(storedStatus(fixture.projectId)).resolves.toBe("OUTLINE_IN_PROGRESS");
    });

    it("keeps the reference frozen once the author edits the bible past validation", async () => {
      const fixture = await createFixture();
      const validated = await asOwner(fixture, () => validateBible(fixture.scope));
      expect(validated.ok).toBe(true);

      const before = await getReferenceBible(fixture.scope);
      const originalRole = before?.content.characters[0]?.role ?? null;

      setActor(fixture.graph.ownerId);
      await prisma.character.update({
        where: { id: fixture.graph.rows.Character },
        data: { role: "un rôle réécrit après validation" },
      });

      const liveOverview = await getBibleOverview(fixture.scope);
      expect(liveOverview?.characters[0]?.role).toBe("un rôle réécrit après validation");

      const after = await getReferenceBible(fixture.scope);
      expect(after?.content.characters[0]?.role).toBe(originalRole);
      expect(after?.versionNumber).toBe(before?.versionNumber);
    });

    describe("cross-owner isolation", () => {
      it("hides mintBibleVersion and getReferenceBibleVersion from another owner", async () => {
        const mine = await createFixture();
        const theirs = await createFixture();

        const validated = await asOwner(mine, () => validateBible(mine.scope));
        expect(validated.ok).toBe(true);

        // `theirs` never sees a savepoint of `mine`'s bible — only, at most,
        // the row `createProjectGraph` seeded under its own.
        const theirsReference = await getReferenceBibleVersion(theirs.scope);
        expect(theirsReference?.bibleId).not.toBe(mine.bibleId);

        const mineReference = await getReferenceBibleVersion(mine.scope);
        expect(mineReference?.bibleId).toBe(mine.bibleId);

        const forged = await prisma.$transaction((client) =>
          mintBibleVersion(client, theirs.scope, {
            bibleId: mine.bibleId,
            createdById: theirs.graph.ownerId,
            content: {},
          }),
        );
        expect(forged.ok).toBe(false);
        expect(!forged.ok && forged.error.code).toBe("NOT_FOUND");
      });
    });
  });
});
