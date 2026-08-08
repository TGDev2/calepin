import { auditExtension, runWithActor } from "@calepin/shared/audit";
import { configureDatabaseClient } from "@calepin/shared/database";
import {
  openProjectScope,
  reconcileProjectAggregates,
  reconcileProjectStatus,
} from "@calepin/shared/repository";
import { PrismaClient } from "@prisma/client";

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

  await prisma.sourceTextVersion.upsert({
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
  await seedFirstChapter("proj_writing_demo", demoUserId);

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
