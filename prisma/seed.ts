import { auditExtension, runWithActor } from "@calepin/shared/audit";
import { PrismaClient } from "@prisma/client";

// The seed is the first caller shaped like production: it opens an actor scope
// once, and every audited write underneath is credited to it without a single
// call site naming the author (CAL-022).
const prisma = new PrismaClient().$extends(auditExtension());

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
  // Upsert three projects at different statuses. One carries a custom target
  // length so the demo data covers both shapes the schema allows: a preset with
  // no word count, and CUSTOM with one.
  const projects = [
    {
      id: "proj_draft_demo",
      title: "Draft Project",
      status: "DRAFT" as const,
      targetLength: "STANDARD" as const,
      targetWordCount: null,
    },
    {
      id: "proj_outline_demo",
      title: "Outline in Progress",
      status: "OUTLINE_IN_PROGRESS" as const,
      targetLength: "SHORT" as const,
      targetWordCount: null,
    },
    {
      id: "proj_writing_demo",
      title: "Writing in Progress",
      status: "WRITING_IN_PROGRESS" as const,
      targetLength: "CUSTOM" as const,
      targetWordCount: 64_000,
    },
  ];

  for (const proj of projects) {
    await prisma.project.upsert({
      where: { id: proj.id },
      update: {
        status: proj.status,
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
        status: proj.status,
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
