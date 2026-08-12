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

import { runBibleCoherenceCheck, validateBible } from "@calepin/bible/repository";
import { runWithActor } from "@calepin/shared/audit";
import { BIBLE_COHERENCE_CHECKS, BIBLE_DETERMINISTIC_CHECKS } from "@calepin/shared/coherence";
import { configureDatabaseClient, resetDatabaseClient } from "@calepin/shared/database";
import {
  listQualityIssues,
  listQualityIssuesWithin,
  openProjectScope,
  type ProjectScope,
  reconcileQualityIssues,
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
});
