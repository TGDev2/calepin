/**
 * One row in every project-owned table, for one owner.
 *
 * CAL-023's criterion is that another user's project is unreachable through
 * every entry point. A suite asserting that against an empty database would
 * pass by finding nothing anywhere, so the isolation suite needs a graph that
 * is genuinely populated — and it needs one per owner, so that "nothing of
 * theirs" can be told apart from "nothing at all".
 *
 * It lives here rather than beside a domain file for the reason `global-setup`
 * and `audited-client` do: it is wiring, and no domain owns it (CLAUDE.md §4.1).
 *
 * Every string is technical. §9 forbids literary content in a committed
 * artefact, and an ownership suite needs none: what is under test is who may
 * read a row, never what the row says.
 */

import type { ProjectOwnedModelName } from "@calepin/shared/repository";

import type { AuditedClient } from "./audited-client";
import { fixtureGenerationKey, fixtureLease } from "./generation-fixture";

export interface ProjectGraph {
  readonly ownerId: string;
  readonly projectId: string;
  /** One row id per project-owned model — the registry's keys, all of them. */
  readonly rows: Record<ProjectOwnedModelName, string>;
}

/**
 * Creates the owner, the project and one row in each of the thirty-five tables
 * that hang off it.
 *
 * `label` keys every unique column, so two graphs can coexist in one database.
 */
export async function createProjectGraph(
  prisma: AuditedClient,
  setActor: (id: string) => void,
  label: string,
): Promise<ProjectGraph> {
  const user = await prisma.user.create({
    data: { email: `${label}@example.test`, name: "Test User" },
  });
  setActor(user.id);

  const project = await prisma.project.create({ data: { title: label, userId: user.id } });

  const sourceText = await prisma.sourceText.create({ data: { projectId: project.id } });
  const sourceTextVersion = await prisma.sourceTextVersion.create({
    data: {
      sourceTextId: sourceText.id,
      versionNumber: 1,
      content: "fixture",
      wordCount: 1,
      editedById: user.id,
    },
  });

  const analysis = await prisma.analysis.create({ data: { projectId: project.id } });
  const sectionRevision = await prisma.analysisSectionRevision.create({
    data: {
      analysisId: analysis.id,
      section: "FACTUAL_SUMMARY",
      revisionNumber: 1,
      origin: "GENERATED",
      sourceTextVersionId: sourceTextVersion.id,
      createdById: user.id,
    },
  });
  const element = await prisma.analysisElement.create({
    data: {
      sectionRevisionId: sectionRevision.id,
      position: 1,
      kind: "FACTUAL",
      origin: "GENERATED",
      statement: "fixture",
    },
  });
  // Keyed on the analysis and the element's lineage since CAL-073, which is
  // what lets it outlive the revision the element sits in.
  const annotation = await prisma.analysisAnnotation.create({
    data: {
      analysisId: analysis.id,
      lineageId: element.lineageId,
      authorId: user.id,
      body: "fixture",
    },
  });

  const direction = await prisma.creativeDirection.create({
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
    },
  });
  const directionEvaluation = await prisma.directionEvaluation.create({
    data: {
      directionId: direction.id,
      promises: [
        { label: "fixture", element: "workingTitle", evidence: null, whatItCommitsTo: "fixture" },
      ],
      shortfalls: [
        { label: "fixture", element: "workingTitle", evidence: null, whyAtRisk: "fixture" },
      ],
      conventions: [
        { label: "fixture", element: "workingTitle", evidence: null, whyConventional: "fixture" },
      ],
      comparativeWeaknesses: [
        {
          label: "fixture",
          element: "workingTitle",
          evidence: null,
          whyLessInteresting: "fixture",
        },
      ],
      createdById: user.id,
    },
  });

  const bible = await prisma.bible.create({ data: { projectId: project.id } });
  const bibleVersion = await prisma.bibleVersion.create({
    data: { bibleId: bible.id, versionNumber: 1, content: {}, createdById: user.id },
  });
  const identity = await prisma.bibleIdentity.create({
    data: {
      bibleId: bible.id,
      workingTitle: "fixture",
      genre: "fixture",
      subGenre: "fixture",
      tone: "fixture",
      narrativePromise: "fixture",
      centralQuestion: "fixture",
      endingNature: "fixture",
      origin: "GENERATED",
    },
  });
  const style = await prisma.bibleStyle.create({
    data: {
      bibleId: bible.id,
      pointOfView: "fixture",
      focalization: "fixture",
      tense: "fixture",
      languageRegister: "fixture",
      descriptiveDensity: "fixture",
      pacing: "fixture",
      dialogueBalance: "fixture",
      origin: "GENERATED",
    },
  });
  const world = await prisma.bibleWorld.create({
    data: {
      bibleId: bible.id,
      era: "fixture",
      socialContext: "fixture",
      origin: "GENERATED",
    },
  });

  const character = await prisma.character.create({
    data: { bibleId: bible.id, name: `${label}-first`, origin: "GENERATED" },
  });
  const secondCharacter = await prisma.character.create({
    data: { bibleId: bible.id, name: `${label}-second`, origin: "GENERATED" },
  });
  const relationship = await prisma.relationship.create({
    data: {
      bibleId: bible.id,
      fromCharacterId: character.id,
      toCharacterId: secondCharacter.id,
      type: "FAMILY",
      label: "fixture",
      origin: "GENERATED",
    },
  });
  const characterEditHistoryEntry = await prisma.characterEditHistory.create({
    data: {
      characterId: character.id,
      name: `${label}-first`,
      importance: "SECONDARY",
      changedFields: ["NAME"],
      editedById: user.id,
    },
  });
  const place = await prisma.place.create({
    data: { bibleId: bible.id, name: `${label}-place`, origin: "GENERATED" },
  });
  const worldRule = await prisma.worldRule.create({
    data: { bibleId: bible.id, name: `${label}-rule`, statement: "fixture", origin: "GENERATED" },
  });

  const event = await prisma.timelineEvent.create({
    // An event is placed absolutely or relative to another — timeline_events_placement_check
    // — and a day carries the precision it is known to, so the two move together.
    data: {
      bibleId: bible.id,
      name: `${label}-event`,
      category: "BACKSTORY",
      absoluteDay: -1,
      datePrecision: "DAY",
      origin: "GENERATED",
    },
  });
  const participant = await prisma.timelineEventParticipant.create({
    data: { bibleId: bible.id, eventId: event.id, characterId: character.id },
  });

  const fact = await prisma.canonFact.create({
    data: { bibleId: bible.id, statement: "fixture", isTrue: true, source: "BIBLE" },
  });
  const belief = await prisma.canonFactBelief.create({
    data: {
      bibleId: bible.id,
      factId: fact.id,
      characterId: character.id,
      state: "BELIEVES_TRUE",
    },
  });
  const subject = await prisma.canonFactSubject.create({
    data: { bibleId: bible.id, factId: fact.id, characterId: character.id },
  });

  const outline = await prisma.outline.create({
    data: { projectId: project.id, bibleId: bible.id },
  });
  const part = await prisma.part.create({
    data: { outlineId: outline.id, orderKey: "i", title: `${label}-part` },
  });
  const chapter = await prisma.chapter.create({
    data: { outlineId: outline.id, bibleId: bible.id, partId: part.id, orderKey: "i" },
  });
  const secondChapter = await prisma.chapter.create({
    data: { outlineId: outline.id, bibleId: bible.id, partId: part.id, orderKey: "r" },
  });
  const chapterOutline = await prisma.chapterOutline.create({
    data: { bibleId: bible.id, chapterId: chapter.id },
  });
  const outlineCharacter = await prisma.chapterOutlineCharacter.create({
    data: {
      bibleId: bible.id,
      chapterOutlineId: chapterOutline.id,
      characterId: character.id,
    },
  });
  const outlineFact = await prisma.chapterOutlineFact.create({
    data: { bibleId: bible.id, chapterOutlineId: chapterOutline.id, factId: fact.id },
  });
  const chapterRevision = await prisma.chapterRevision.create({
    data: {
      chapterId: chapter.id,
      revisionNumber: 1,
      origin: "GENERATED",
      content: "fixture",
      wordCount: 1,
      createdById: user.id,
    },
  });

  const chapterSummary = await prisma.chapterSummaryRevision.create({
    data: {
      chapterId: chapter.id,
      chapterRevisionId: chapterRevision.id,
      revisionNumber: 1,
      briefSummary: "fixture",
      detailedSummary: "fixture",
      briefWordCount: 1,
      detailedWordCount: 1,
      createdById: user.id,
    },
  });
  const partSummary = await prisma.partSummaryRevision.create({
    data: {
      partId: part.id,
      revisionNumber: 1,
      summary: "fixture",
      wordCount: 1,
      createdById: user.id,
    },
  });

  const thread = await prisma.thread.create({
    data: {
      outlineId: outline.id,
      bibleId: bible.id,
      label: `${label}-thread`,
      narrativePromise: "fixture",
      openingChapterId: chapter.id,
    },
  });
  const continuation = await prisma.threadContinuation.create({
    data: { bibleId: bible.id, threadId: thread.id, chapterId: secondChapter.id },
  });

  const generation = await prisma.generation.create({
    data: {
      projectId: project.id,
      mission: "WRITE_SCENE",
      input: {},
      idempotencyKey: fixtureGenerationKey(`${project.id}-write-scene`),
    },
  });
  const attempt = await prisma.generationAttempt.create({
    data: {
      generationId: generation.id,
      attempt: 1,
      model: "fixture-model",
      leaseExpiresAt: fixtureLease(),
    },
  });

  const issue = await prisma.qualityIssue.create({
    data: {
      projectId: project.id,
      category: "STRUCTURE",
      severity: "MINOR",
      checkId: "fixture-check",
      fingerprint: "0100000000000000000000000000000000000000000000000000000000000000",
      explanation: "fixture",
    },
  });
  const passage = await prisma.qualityIssuePassage.create({
    data: { issueId: issue.id, chapterId: chapter.id },
  });

  const exported = await prisma.export.create({
    data: { projectId: project.id, requestedById: user.id, format: "MARKDOWN" },
  });
  const publication = await prisma.publication.create({
    data: {
      projectId: project.id,
      slug: label,
      title: "fixture",
      authorName: "fixture",
    },
  });

  // The graph writes its rows directly, so the derived state CAL-033 and
  // CAL-034 maintain at write time never moved. All three are set to what the
  // graph actually seeded — one chapter carrying one revision of one word, and
  // therefore a project whose furthest stage reached is *rédaction en cours* —
  // rather than reconciled, because this fixture must not depend on the seam
  // being registered before it runs, and because an isolation suite asserting on
  // derived state should be asserting on a value this file put there.
  //
  // The status matters beyond the assertions: a suite that calls
  // `withProjectAggregates` on this graph recomputes the status inside the same
  // transaction, and a column left at DRAFT would put that recomputation four
  // stages ahead of it — the jump the transition table refuses.
  await prisma.project.update({
    where: { id: project.id },
    data: { writtenChapterCount: 1, totalWordCount: 1, status: "WRITING_IN_PROGRESS" },
  });

  return {
    ownerId: user.id,
    projectId: project.id,
    rows: {
      Project: project.id,
      SourceText: sourceText.id,
      SourceTextVersion: sourceTextVersion.id,
      Analysis: analysis.id,
      AnalysisSectionRevision: sectionRevision.id,
      AnalysisElement: element.id,
      AnalysisAnnotation: annotation.id,
      CreativeDirection: direction.id,
      DirectionEvaluation: directionEvaluation.id,
      Bible: bible.id,
      BibleVersion: bibleVersion.id,
      BibleIdentity: identity.id,
      BibleStyle: style.id,
      BibleWorld: world.id,
      Character: character.id,
      CharacterEditHistory: characterEditHistoryEntry.id,
      Relationship: relationship.id,
      Place: place.id,
      WorldRule: worldRule.id,
      TimelineEvent: event.id,
      TimelineEventParticipant: participant.id,
      CanonFact: fact.id,
      CanonFactBelief: belief.id,
      CanonFactSubject: subject.id,
      Outline: outline.id,
      Part: part.id,
      Chapter: chapter.id,
      ChapterOutline: chapterOutline.id,
      ChapterOutlineCharacter: outlineCharacter.id,
      ChapterOutlineFact: outlineFact.id,
      ChapterRevision: chapterRevision.id,
      ChapterSummaryRevision: chapterSummary.id,
      PartSummaryRevision: partSummary.id,
      Thread: thread.id,
      ThreadContinuation: continuation.id,
      Generation: generation.id,
      GenerationAttempt: attempt.id,
      QualityIssue: issue.id,
      QualityIssuePassage: passage.id,
      Export: exported.id,
      Publication: publication.id,
    },
  };
}
