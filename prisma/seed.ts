import { auditExtension, runWithActor } from "@calepin/shared/audit";
import { configureDatabaseClient } from "@calepin/shared/database";
import {
  openProjectScope,
  reconcileProjectAggregates,
  reconcileProjectStatus,
} from "@calepin/shared/repository";
import { type $Enums, PrismaClient } from "@prisma/client";

// The seed is the first caller shaped like production: it opens an actor scope
// once, and every audited write underneath is credited to it without a single
// call site naming the author (CAL-022).
const prisma = new PrismaClient().$extends(auditExtension());

// It is also a process shell, so it registers a client on the seam like every
// other one (CAL-023). That is what lets it finish by *reconciling* its demo
// projects' derived state rather than asserting it: since CAL-034 a status is
// read off the rows, and a seed that wrote one by hand would be the first file a
// newcomer reads contradicting the rule the rest of the codebase enforces.
configureDatabaseClient(new PrismaClient());

async function main() {
  console.log("Seeding demo data...");

  // Upsert demo user. `User` is outside the audit set — the author of a change
  // to an account is the account holder — so this one write needs no scope.
  const demoUser = await prisma.user.upsert({
    where: { email: "demo@calepin.local" },
    update: {},
    create: {
      email: "demo@calepin.local",
      name: "Demo User",
    },
  });
  console.log(`User: ${demoUser.email}`);

  await runWithActor(demoUser.id, () => seedProjectData(demoUser.id));

  console.log("Seeding complete.");
}

async function seedProjectData(demoUserId: string) {
  // Three projects at three points of the process. One carries a custom target
  // length so the demo data covers both shapes the schema allows: a preset with
  // no word count, and CUSTOM with one.
  //
  // None of them names a status, and none may: since CAL-034 the status is a
  // function of the rows. Each project seeds the evidence of the stage it is
  // meant to show, and `reconcileProjectStatus` at the end reads it back.
  const projects = [
    {
      id: "proj_draft_demo",
      title: "Draft Project",
      targetLength: "STANDARD" as const,
      targetWordCount: null,
    },
    {
      id: "proj_outline_demo",
      title: "Outline in Progress",
      targetLength: "SHORT" as const,
      targetWordCount: null,
    },
    {
      id: "proj_writing_demo",
      title: "Writing in Progress",
      targetLength: "CUSTOM" as const,
      targetWordCount: 64_000,
    },
  ];

  for (const proj of projects) {
    await prisma.project.upsert({
      where: { id: proj.id },
      update: {
        targetLength: proj.targetLength,
        targetWordCount: proj.targetWordCount,
      },
      create: {
        id: proj.id,
        title: proj.title,
        userId: demoUserId,
        language: "fr",
        targetLength: proj.targetLength,
        targetWordCount: proj.targetWordCount,
        targetAudience: "Grand public",
        freedomLevel: "BALANCED",
      },
    });
  }
  console.log("Projects: 3 created/updated");

  // Attach a source text to the most advanced project.
  const writingProject = await prisma.project.findUnique({
    where: { id: "proj_writing_demo" },
  });
  if (!writingProject) throw new Error("Writing project not found");

  // Short story: "Le Voyageur Silencieux" (The Silent Traveler)
  const storyContent = `Le Voyageur Silencieux

Marc s'arrêta devant la petite gare de province, sa valise usée à la main. La pluie avait cessé, laissant un léger brouillard sur les rails. Il regarda le panneau : Montpellier, 14h23. Pas de train avant deux heures.

Le quai était désert. Une femme âgée sirotait un café sous l'auvent, ses yeux gris fixés sur rien. Marc s'assit à distance, observant les passants. C'était un jeu pour lui : inventer des histoires sur les inconnus.

Elle avait dû être belle, autrefois. Son châle bordeaux, ses gants de laine blanche, ses cheveux blancs coiffés avec soin racontaient une vie d'ordre et de discipline. Peut-être une institutrice. Peut-être une veuve.

« Vous attendez un train ? » demanda-t-elle soudain.

Marc sursauta. « Oui. Et vous ?

— Quarante ans que je prends le même train, chaque semaine. » Elle sourit. « Je m'appelle Simone.

— Marc. »

Simone raconta son histoire. Elle avait passé sa vie à Montpellier, dans une petite maison près du jardin botanique. Elle voyait son fils à Nîmes, tous les jeudis. Après le décès de son mari, il y a vingt ans, c'était devenu son rituel. Monter, descendre, rentrer.

« Vous trouvez pas ça triste ? » demanda Marc.

Elle regarda les rails. « Non. La routine, c'est comme une ritournelle. Au début, c'est monotone. Puis, ça devient une mélodie. »

Le train arriva. Ils montèrent, l'un après l'autre, dans des wagons différents. Marc gagna son siège, rangea sa valise, et pensa à Simone. Peut-être qu'elle avait raison. Peut-être que la vie n'était jamais aussi simple qu'une histoire d'inconnu.

À Nîmes, il descendit. À travers la vitre, il la vit sur le quai, son fils l'attendant avec un bouquet de chrysanthèmes. Elle lui prit le bras, souriant.

Marc continua son chemin, sa valise à la main, se demandant ce que son propre rituel deviendrait.`;

  // Count words (simple split on spaces)
  const wordCount = storyContent.split(/\s+/).filter((word) => word.length > 0).length;
  console.log(`Story: ${wordCount} words`);

  // Upsert source text and its version.
  const sourceText = await prisma.sourceText.upsert({
    where: { projectId: writingProject.id },
    update: {},
    create: {
      projectId: writingProject.id,
    },
  });

  const sourceTextVersion = await prisma.sourceTextVersion.upsert({
    where: {
      sourceTextId_versionNumber: {
        sourceTextId: sourceText.id,
        versionNumber: 1,
      },
    },
    update: {},
    create: {
      sourceTextId: sourceText.id,
      versionNumber: 1,
      content: storyContent,
      wordCount,
      language: "fr",
      editedById: demoUserId,
    },
  });
  console.log("Source text: version 1 created/updated");

  // The evidence behind the two advanced projects. A stage is *reached* by the
  // rows that prove it, so showing "plan en construction" on a dashboard means
  // seeding a validated analysis, a canonical direction and a validated bible —
  // not writing the words into a column.
  await seedUpToOutline("proj_outline_demo", demoUserId);
  await seedUpToOutline("proj_writing_demo", demoUserId);
  await seedRelationshipGraph("proj_writing_demo");
  await seedFirstChapter("proj_writing_demo", demoUserId);
  await seedAnalysisContent("proj_writing_demo", demoUserId, sourceTextVersion.id);

  await reconcileDerivedState(
    demoUserId,
    projects.map((project) => project.id),
  );
}

/**
 * Everything a project needs before a plan can be written against it: a
 * validated analysis, a canonical direction and a validated bible.
 *
 * The source text is the caller's business — `proj_writing_demo` already has a
 * real one, and `proj_outline_demo` gets a short technical placeholder here.
 */
async function seedUpToOutline(projectId: string, demoUserId: string) {
  const existing = await prisma.sourceText.findUnique({ where: { projectId } });

  if (existing === null) {
    const sourceText = await prisma.sourceText.create({ data: { projectId } });
    await prisma.sourceTextVersion.create({
      data: {
        sourceTextId: sourceText.id,
        versionNumber: 1,
        content: "Texte de démonstration.",
        wordCount: 3,
        language: "fr",
        editedById: demoUserId,
      },
    });
  }

  await prisma.analysis.upsert({
    where: { projectId },
    update: { validatedAt: new Date(), validatedById: demoUserId },
    create: { projectId, validatedAt: new Date(), validatedById: demoUserId },
  });

  const directions = await prisma.creativeDirection.count({ where: { projectId } });

  if (directions === 0) {
    await prisma.creativeDirection.create({
      data: {
        projectId,
        workingTitle: "Direction de démonstration",
        developedPremise: "Prémisse de démonstration.",
        dominantGenre: "Roman contemporain",
        mainConflict: "Conflit de démonstration.",
        protagonistArc: "Trajectoire de démonstration.",
        endingNature: "Fin ouverte",
        novelPotentialAssessment: "Évaluation de démonstration.",
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
  }

  await prisma.bible.upsert({
    where: { projectId },
    update: { validatedAt: new Date(), validatedById: demoUserId },
    create: { projectId, validatedAt: new Date(), validatedById: demoUserId },
  });
}

/**
 * A cast of three and the ties between them (CAL-091).
 *
 * Deliberately not tidy: the three classifications a pair can have are all
 * present, because a demo graph where everyone answers everyone would show the
 * screen working and the *feature* not. Marc and Simone declare the same tie
 * from both sides (`mutual`); Marc has read Julien off a station platform and
 * Julien has never heard of Marc (`one-sided`, carrying the asymmetry); and
 * mother and son name their weekly journey differently (`divergent`).
 *
 * The descriptions are written the way `resolveCharacterRelations` writes
 * them, so what the seed shows is the shape a generated graph would have.
 */
async function seedRelationshipGraph(projectId: string) {
  const bible = await prisma.bible.findUniqueOrThrow({ where: { projectId } });

  const cast = [
    { name: "Marc", importance: "MAIN" as const },
    { name: "Simone", importance: "MAIN" as const },
    { name: "Julien", importance: "SECONDARY" as const },
  ];

  const ids = new Map<string, string>();

  for (const member of cast) {
    const character = await prisma.character.upsert({
      where: { bibleId_name: { bibleId: bible.id, name: member.name } },
      update: {},
      create: { bibleId: bible.id, name: member.name, importance: member.importance },
      select: { id: true },
    });

    ids.set(member.name, character.id);
  }

  const ties = [
    {
      from: "Marc",
      to: "Simone",
      type: "FRIENDSHIP" as const,
      label: "compagnon de quai de",
      description: "Il lui a parlé une fois, et y repense depuis.",
    },
    {
      from: "Simone",
      to: "Marc",
      type: "FRIENDSHIP" as const,
      label: "compagne de quai de",
      description: "Elle lui a raconté quarante ans en dix minutes, sans rien en attendre.",
    },
    {
      from: "Marc",
      to: "Julien",
      type: "OTHER" as const,
      label: "témoin de",
      description:
        "Il l'a vu attendre sa mère avec des chrysanthèmes. Asymétrie : Marc a observé Julien sur le quai de Nîmes — Marc sait ; Julien ignore.",
    },
    {
      from: "Simone",
      to: "Julien",
      type: "FAMILY" as const,
      label: "mère de",
      description: "Le jeudi est la seule chose qu'elle lui demande.",
    },
    {
      from: "Julien",
      to: "Simone",
      type: "OTHER" as const,
      label: "rendez-vous hebdomadaire avec",
      description: "Il n'a jamais dit à personne que c'était devenu une obligation.",
    },
  ];

  for (const tie of ties) {
    const fromCharacterId = ids.get(tie.from);
    const toCharacterId = ids.get(tie.to);

    if (fromCharacterId === undefined || toCharacterId === undefined) continue;

    // No mirror is written for the third tie, and that is the point: the
    // screen must be able to show a relation nobody answered.
    await prisma.relationship.upsert({
      where: {
        fromCharacterId_toCharacterId_type: { fromCharacterId, toCharacterId, type: tie.type },
      },
      update: {},
      create: {
        bibleId: bible.id,
        fromCharacterId,
        toCharacterId,
        type: tie.type,
        label: tie.label,
        description: tie.description,
      },
    });
  }

  console.log("Relationships: 3 characters, 5 directed ties");
}

/** A plan of three chapters, the first of which carries text. */
async function seedFirstChapter(projectId: string, demoUserId: string) {
  const bible = await prisma.bible.findUniqueOrThrow({ where: { projectId } });
  const outline = await prisma.outline.upsert({
    where: { projectId },
    update: {},
    create: { projectId, bibleId: bible.id },
  });

  const parts = await prisma.part.count({ where: { outlineId: outline.id } });
  if (parts > 0) return;

  const part = await prisma.part.create({
    data: { outlineId: outline.id, orderKey: "i", title: "Première partie" },
  });

  const chapters = [];

  for (const orderKey of ["i", "r", "x"]) {
    chapters.push(
      await prisma.chapter.create({
        data: { outlineId: outline.id, bibleId: bible.id, partId: part.id, orderKey },
      }),
    );
  }

  const [first] = chapters;
  if (first === undefined) throw new Error("The demo plan was created without a chapter");

  await prisma.chapterRevision.create({
    data: {
      chapterId: first.id,
      revisionNumber: 1,
      origin: "GENERATED",
      content: "Premier chapitre de démonstration.",
      wordCount: 4,
      createdById: demoUserId,
    },
  });
}

interface AnalysisElementSeed {
  readonly kind: $Enums.AnalysisElementKind;
  readonly label?: string;
  readonly statement: string;
  readonly evidence?: string;
}

interface AnalysisSectionSeed {
  readonly section: $Enums.AnalysisSection;
  readonly elements: readonly AnalysisElementSeed[];
}

/**
 * The seventeen sections of a demo diagnostic, written about the short story
 * `seedProjectData` already seeds ("Le Voyageur Silencieux") rather than
 * invented from nothing — so a `FACTUAL` element's `evidence` below can be a
 * real, checkable quotation from that text (CAL-071's own rule: what CAL-072
 * shows is a passage the author can find in their own source text).
 *
 * `RELATIONSHIPS` is deliberately left empty — its schema minimum is zero —
 * to demonstrate the screen's legitimate per-section empty state.
 */
const ANALYSIS_CONTENT: readonly AnalysisSectionSeed[] = [
  {
    section: "FACTUAL_SUMMARY",
    elements: [
      {
        kind: "FACTUAL",
        statement:
          "Marc attend son train dans une gare de province et engage la conversation avec Simone, une femme âgée qui fait le même trajet chaque semaine depuis quarante ans. Elle explique pourquoi elle ne trouve pas sa routine triste. Ils montent dans des wagons séparés ; à Nîmes, Marc la voit retrouver son fils sur le quai.",
      },
    ],
  },
  {
    section: "PREMISE",
    elements: [
      {
        kind: "INTERPRETATION",
        statement:
          "Une rencontre de hasard entre deux inconnus, sur un quai de gare, devient l'occasion d'une réflexion sur la routine et la solitude.",
      },
    ],
  },
  {
    section: "MAIN_CONFLICT",
    elements: [
      {
        kind: "INTERPRETATION",
        statement:
          "La tension entre le regard de Marc, qui juge d'abord la routine de Simone triste, et la sérénité qu'elle affiche, sans qu'aucun événement extérieur ne les oppose directement.",
      },
    ],
  },
  {
    section: "NARRATIVE_PROMISE",
    elements: [
      {
        kind: "INTERPRETATION",
        statement:
          "Le texte promet un déplacement du regard du lecteur : ce qui semblait triste au début se révèle être une paix choisie.",
      },
    ],
  },
  {
    section: "THEMES",
    elements: [
      {
        kind: "FACTUAL",
        label: "La routine",
        statement:
          "Simone présente sa routine ferroviaire hebdomadaire comme une source d'apaisement plutôt que de tristesse.",
        evidence: "La routine, c'est comme une ritournelle.",
      },
      {
        kind: "INTERPRETATION",
        label: "Le regard sur l'inconnu",
        statement:
          "Le texte explore l'habitude de Marc d'inventer des histoires sur les inconnus qu'il croise, et ce que cela révèle de sa propre solitude.",
      },
    ],
  },
  {
    section: "CHARACTERS",
    elements: [
      {
        kind: "FACTUAL",
        label: "Marc",
        statement:
          "Voyageur qui attend son train ; il observe les passants et invente des histoires sur les inconnus.",
        evidence: "C'était un jeu pour lui : inventer des histoires sur les inconnus.",
      },
      {
        kind: "FACTUAL",
        label: "Simone",
        statement:
          "Femme âgée qui prend le même train chaque semaine depuis la mort de son mari, pour rendre visite à son fils.",
        evidence: "Quarante ans que je prends le même train, chaque semaine.",
      },
    ],
  },
  { section: "RELATIONSHIPS", elements: [] },
  {
    section: "POINT_OF_VIEW",
    elements: [
      {
        kind: "FACTUAL",
        label: "Narrateur externe centré sur Marc",
        statement:
          "Le récit est mené à la troisième personne, en suivant les perceptions et les pensées de Marc.",
      },
    ],
  },
  {
    section: "TENSE",
    elements: [
      {
        kind: "FACTUAL",
        label: "Passé simple et imparfait",
        statement:
          "Le récit est conduit au passé simple pour les actions, avec l'imparfait pour les descriptions et les habitudes.",
      },
    ],
  },
  {
    section: "TONE",
    elements: [
      {
        kind: "INTERPRETATION",
        statement:
          "Un ton feutré et contemplatif, porté par de courts dialogues et des observations sensorielles discrètes.",
      },
    ],
  },
  {
    section: "SINGULAR_ELEMENTS",
    elements: [
      {
        kind: "FACTUAL",
        label: "Le bouquet de chrysanthèmes",
        statement: "Le fils de Simone l'attend à l'arrivée avec un bouquet de chrysanthèmes.",
        evidence: "son fils l'attendant avec un bouquet de chrysanthèmes",
      },
    ],
  },
  {
    section: "AMBIGUITIES",
    elements: [
      {
        kind: "INTERPRETATION",
        label: "Le sens de la fleur",
        statement:
          "Le bouquet de chrysanthèmes, associé aux cérémonies funéraires en France, laisse planer une ambiguïté discrète sur ce que Simone est allée chercher, ou fuir, à Nîmes.",
      },
    ],
  },
  {
    section: "OPEN_QUESTIONS",
    elements: [
      {
        kind: "INTERPRETATION",
        label: "La suite du trajet de Marc",
        statement:
          "Le texte ne dit pas ce que Marc retient de cette rencontre au-delà de la question qu'il se pose en marchant.",
      },
    ],
  },
  {
    section: "ELEMENTS_TO_PRESERVE",
    elements: [
      {
        kind: "INTERPRETATION",
        label: "Le dialogue de la ritournelle",
        statement:
          "L'échange où Simone compare sa routine à une ritournelle est le cœur thématique du texte et mérite d'être conservé tel quel.",
      },
      {
        kind: "INTERPRETATION",
        label: "La scène finale muette",
        statement:
          "La scène où Marc observe Simone retrouver son fils sans qu'aucune parole ne soit échangée porte l'essentiel de la résolution.",
      },
    ],
  },
  {
    section: "WEAKNESSES",
    elements: [
      {
        kind: "INTERPRETATION",
        label: "Une chute un peu appuyée",
        statement:
          "La dernière phrase, qui explicite la question de Marc sur son propre rituel, referme un peu vite ce que la scène du quai suggérait déjà.",
      },
    ],
  },
  {
    section: "CLICHE_RISKS",
    elements: [
      {
        kind: "INTERPRETATION",
        label: "La voyageuse sage de la gare",
        statement:
          "La figure de la voyageuse âgée qui livre une leçon de vie à un inconnu croisé sur un quai est une situation déjà largement explorée.",
      },
    ],
  },
  {
    section: "DEVELOPMENT_POTENTIAL",
    elements: [
      {
        kind: "INTERPRETATION",
        statement:
          "Le texte pourrait être prolongé en explorant davantage le point de vue de Simone elle-même, ou en donnant à Marc un fil narratif propre au-delà de cette rencontre unique.",
      },
    ],
  },
];

/**
 * The diagnostic screen's demo content (CAL-072), for `proj_writing_demo`
 * only — the one seeded project that already carries a real source text.
 * Idempotent like the rest of this file: both the revision and its elements
 * are upserted on their own unique keys.
 */
async function seedAnalysisContent(
  projectId: string,
  demoUserId: string,
  sourceTextVersionId: string,
) {
  const analysis = await prisma.analysis.findUniqueOrThrow({ where: { projectId } });

  for (const { section, elements } of ANALYSIS_CONTENT) {
    const revision = await prisma.analysisSectionRevision.upsert({
      where: {
        analysisId_section_revisionNumber: { analysisId: analysis.id, section, revisionNumber: 1 },
      },
      update: {},
      create: {
        analysisId: analysis.id,
        section,
        revisionNumber: 1,
        origin: "GENERATED",
        sourceTextVersionId,
        createdById: demoUserId,
      },
    });

    for (const [index, element] of elements.entries()) {
      const position = index + 1;
      const data = {
        kind: element.kind,
        label: element.label ?? null,
        statement: element.statement,
        evidence: element.evidence ?? null,
        // Revision 1 is the model's answer, so every element is its proposal
        // (CAL-073). The edited revision below is what puts the other origins
        // on screen.
        origin: "GENERATED",
      } as const;

      await prisma.analysisElement.upsert({
        where: { sectionRevisionId_position: { sectionRevisionId: revision.id, position } },
        update: data,
        create: { sectionRevisionId: revision.id, position, ...data },
      });
    }
  }

  await seedEditedThemes(analysis.id, demoUserId, sourceTextVersionId);

  console.log("Analysis: 17 sections seeded for proj_writing_demo");
}

/**
 * A second revision of `THEMES`, written by the demo author.
 *
 * It exists so the traceability pattern is visible in the demo rather than only
 * in a test: the three elements of revision 1 come through as a proposal kept
 * as is, a proposal reworded, and one the author added — which is every
 * `ProvenanceState` but the one revision 1 already shows on the other sixteen
 * sections. Two annotations hang off it, one of them on the element the author
 * left untouched, so the notes are visibly independent of who wrote what.
 */
async function seedEditedThemes(
  analysisId: string,
  demoUserId: string,
  sourceTextVersionId: string,
) {
  const existing = await prisma.analysisSectionRevision.findUnique({
    where: {
      analysisId_section_revisionNumber: { analysisId, section: "THEMES", revisionNumber: 2 },
    },
    select: { id: true },
  });

  if (existing !== null) return;

  const first = await prisma.analysisSectionRevision.findUniqueOrThrow({
    where: {
      analysisId_section_revisionNumber: { analysisId, section: "THEMES", revisionNumber: 1 },
    },
    select: {
      elements: {
        orderBy: { position: "asc" },
        select: { lineageId: true, kind: true, label: true, statement: true, evidence: true },
      },
    },
  });

  const [kept, reworded] = first.elements;
  if (kept === undefined || reworded === undefined) return;

  const revision = await prisma.analysisSectionRevision.create({
    data: {
      analysisId,
      section: "THEMES",
      revisionNumber: 2,
      origin: "EDITED",
      sourceTextVersionId,
      createdById: demoUserId,
    },
    select: { id: true },
  });

  await prisma.analysisElement.createMany({
    data: [
      // Untouched: still the model's wording, and read as validated because the
      // revision holding it is one the author wrote.
      { sectionRevisionId: revision.id, position: 1, origin: "GENERATED", ...content(kept) },
      {
        sectionRevisionId: revision.id,
        position: 2,
        origin: "EDITED",
        ...content(reworded),
        statement: `${reworded.statement} L'auteur a précisé ce thème.`,
      },
      {
        sectionRevisionId: revision.id,
        position: 3,
        origin: "USER_WRITTEN",
        kind: "INTERPRETATION",
        label: "La ritournelle",
        statement: "Un thème que l'auteur a ajouté lui-même après lecture du diagnostic.",
        evidence: null,
      },
    ],
  });

  await prisma.analysisAnnotation.createMany({
    data: [
      {
        analysisId,
        lineageId: kept.lineageId,
        authorId: demoUserId,
        body: "À garder tel quel : c'est le fil que je veux tenir sur tout le roman.",
      },
      {
        analysisId,
        lineageId: reworded.lineageId,
        authorId: demoUserId,
        body: "Reformulé, la version d'origine était trop générale.",
      },
    ],
  });
}

/**
 * An element carried into the next revision — **lineage included**. That is the
 * whole mechanism: the row is new, the identity is not, so the origin comes
 * across and the notes attached to it stay attached.
 */
function content(element: {
  lineageId: string;
  kind: "FACTUAL" | "INTERPRETATION";
  label: string | null;
  statement: string;
  evidence: string | null;
}) {
  return {
    lineageId: element.lineageId,
    kind: element.kind,
    label: element.label,
    statement: element.statement,
    evidence: element.evidence,
  };
}

/**
 * The counters and the status, rewritten from the rows the seed just wrote.
 *
 * The seed writes rows directly rather than through the domain's write paths, so
 * nothing maintained the derived state along the way — which is exactly the case
 * the two reconciliation functions exist for (CAL-033, CAL-034).
 */
async function reconcileDerivedState(demoUserId: string, projectIds: readonly string[]) {
  for (const projectId of projectIds) {
    const opened = await openProjectScope({ ownerId: demoUserId, projectId });
    if (!opened.ok) throw new Error(`The demo project ${projectId} was not seeded`);

    const aggregates = await reconcileProjectAggregates(opened.value);
    if (!aggregates.ok) throw new Error(`The demo project ${projectId} has no countable rows`);

    const status = await reconcileProjectStatus(opened.value);
    if (!status.ok) throw new Error(`The demo project ${projectId} has no derivable status`);

    console.log(`Project ${projectId}: ${status.value}`);
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
