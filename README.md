# Calepin

Calepin accompagne l'écriture d'un roman, du texte source au manuscrit exporté :
analyse du texte de départ, exploration de directions romanesques, construction
de la bible narrative et du plan, rédaction chapitre par chapitre, contrôle de
cohérence, export.

Ce dépôt en est le squelette. Les domaines métier existent et sont vides ;
le backlog de réalisation est dans [`calepin-backlog.md`](./calepin-backlog.md).

## Prérequis

- Node.js ≥ 20.9
- pnpm 10.11

## Démarrer

```bash
pnpm install        # installe les 12 projets du workspace
pnpm dev:services    # PostgreSQL, Redis, MinIO — via Docker Compose
cp apps/web/.env.example apps/web/.env        # variables d'environnement locales
cp apps/worker/.env.example apps/worker/.env  # idem, côté worker
pnpm dev             # http://localhost:3000
pnpm worker          # le consommateur BullMQ, dans un second terminal
```

`pnpm dev:services` démarre les trois services en arrière-plan
(`docker compose up -d`) ; `docker compose ps` montre leur état une fois
`healthy`. Les données vivent dans des volumes Docker nommés et survivent à un
`docker compose down` (sans `-v`). `apps/web/.env` et `apps/worker/.env` sont
validés au démarrage par `@calepin/shared/config` (schéma Zod,
`packages/shared/src/config`) ; le `.env` de la racine ne porte que
`DATABASE_URL`, pour la CLI Prisma qui ne lit que celui-là. PostgreSQL est câblé
par le schéma Prisma (`prisma/`) et Redis par la file BullMQ que le worker
consomme (CAL-060) ; S3 attend encore son premier export (E18).

Le chemin complet se vérifie en trois commandes : `pnpm dev:services`, puis
`pnpm worker` dans un terminal, puis `pnpm worker:ping` dans un autre. La tâche
factice est produite par le second processus, consommée par le premier, et le
même `jobId` apparaît dans les deux journaux.

| Service | Port hôte | Identifiants locaux |
|---|---|---|
| PostgreSQL | `5434` (mappé sur `5432` du conteneur) | `calepin` / `calepin`, base `calepin` |
| Redis | `6379` | aucun |
| MinIO (API S3 / console) | `9000` / `9001` | `calepin` / `calepin_local` |

Le port hôte de PostgreSQL est décalé sur `5434` : les ports `5432` et `5433`
sont déjà pris par d'autres projets sur les machines de développement
courantes. Les identifiants ci-dessus sont des valeurs de développement local
en clair, sans portée au-delà de cette machine — `apps/web/.env.example` les
reprend telles quelles.

Autres scripts à la racine : `pnpm typecheck` (tous les paquets, plus
`prisma/`), `pnpm start` (sert le build de production), `pnpm build` (build de
production), `pnpm worker:dev` (worker relancé à chaque modification),
`pnpm worker:ping` (produit une tâche factice et rend la main), `pnpm test`
(Vitest, unitaire), `pnpm test:integration` (Vitest, PostgreSQL **et** Redis
isolés par exécution via Testcontainers, migrations appliquées — nécessite
Docker), `pnpm test:e2e` (Playwright, `apps/web`), `pnpm db:seed`
(peuple la base de données locale avec un utilisateur de démonstration, trois
projets et un texte source de nouvelle courte).

Le client Prisma est généré par le `postinstall` de la racine : pnpm 10 bloque
les scripts d'installation des dépendances, donc sans cela un clone neuf et la
CI importeraient un client jamais généré.

## Arborescence

```
calepin/
├── apps/
│   ├── web/                  @calepin/web — application Next.js 16, App Router
│       ├── next.config.ts    transpilePackages : compile les paquets depuis leurs sources TS
│       ├── playwright.config.ts  configuration Playwright (E2E)
│       ├── public/
│       ├── src/app/          routes, layouts, styles, frontières d'erreur et page 404
│       ├── src/app/api/auth/ points d'entrée Auth.js (`/api/auth/*`)
│       ├── src/components/   composants partagés — écran d'erreur, bandeau de session
│       ├── src/lib/          câblage applicatif — corrélation, report des erreurs
│       │                     serveur, composition du client Prisma
│       ├── src/lib/auth.ts   l'instance Auth.js — sessions en base, durées, rappels
│       ├── src/lib/current-user.ts  `getCurrentUser` / `requireCurrentUser`
│       ├── src/lib/database.ts  le seul fichier de l'application qui nomme la base
│       │                     de données ; tout le reste passe par `@calepin/shared/repository`
│       ├── src/lib/model-provider.ts  composition du port fournisseur, sur `globalThis`
│       ├── src/proxy.ts      attribue `x-correlation-id` à chaque requête
│       ├── src/instrumentation.ts  environnement, niveau du journal, `onRequestError`
│       └── tests/e2e/        specs Playwright
│   └── worker/               @calepin/worker — le consommateur BullMQ, `pnpm worker`
│       ├── .env.example      mêmes variables que l'application ; `envSchema` est unique
│       ├── src/main.ts       la coquille : environnement, journal, base, files, arrêt propre
│       ├── src/database.ts   composition du client Prisma, jumelle de celle du web
│       ├── src/model-provider.ts  composition du port fournisseur, un par processus
│       ├── src/environment.ts  charge `.env` avant tout import qui le lit
│       └── src/ping.ts       produit une tâche factice et rend la main (`pnpm worker:ping`)
│
├── docs/
│   └── adr/                  décisions d'architecture — ADR-001 : forme du
│                             backend, frontière couche IA / couche métier
│
├── prisma/                   schéma Prisma, migrations et seed
│
├── packages/                 le métier, hors de toute application
│   ├── shared/                @calepin/shared — primitives transverses
│   │   ├── src/account/       recensement et suppression d'un compte (`@calepin/shared/account`)
│   │   ├── src/audit/         registre des modèles audités, portée d'acteur, extension Prisma (`@calepin/shared/audit`)
│   │   ├── src/auth/          adaptateur Auth.js et durées de session (`@calepin/shared/auth`)
│   │   ├── src/config/        schéma d'environnement Zod (`@calepin/shared/config`)
│   │   ├── src/database/      point d'injection du client Prisma (`@calepin/shared/database`)
│   │   ├── src/errors/        hiérarchie `AppError`, `Result`, codes HTTP (`@calepin/shared/errors`)
│   │   ├── src/generation/    cycle de vie d'une tentative de génération, clé d'idempotence (`@calepin/shared/generation`)
│   │   ├── src/logging/       journal Pino, corrélation, liste blanche de champs (`@calepin/shared/logging`)
│   │   ├── src/obsolescence/  étapes rendues potentiellement obsolètes par une modification du texte source (`@calepin/shared/obsolescence`)
│   │   ├── src/queue/         connexion Redis, files déclarées, contrats de tâche, arrêt propre (`@calepin/shared/queue`)
│   │   ├── src/repository/    politique d'accès par propriétaire (`@calepin/shared/repository`)
│   │   └── src/testing/       helpers de fabrique de données pour les tests
│   ├── ai/                    @calepin/ai — couche IA : port fournisseur, capacités des
│   │                          modèles, routage des missions, réessais et repli (CAL-048)
│   │   └── src/testing/       clients simulés et prompt figé, pour les suites hors du paquet (`@calepin/ai/testing`)
│   ├── analysis/              @calepin/analysis — diagnostic du texte source
│   ├── direction/             @calepin/direction — directions romanesques divergentes
│   ├── bible/                 @calepin/bible — référence narrative
│   ├── outline/               @calepin/outline — parties, plans de chapitre, fils
│   ├── manuscript/            @calepin/manuscript — rédaction, édition, versions
│   ├── coherence/             @calepin/coherence — mémoire narrative et moteur d'audit
│   └── export/                @calepin/export — composition et rendu par format
│
├── test/
│   ├── integration/          base PostgreSQL isolée par exécution (Testcontainers) et son globalSetup Vitest
│   └── e2e/                  fixtures Playwright qui écrivent en base — hors de `apps/web`,
│                             que la règle de lint de la §3.5 tient à l'écart de la base
│
├── tasks/
│   ├── todo.md               le plan en cours
│   └── lessons.md            les corrections reçues, converties en règles
│
├── CLAUDE.md                 contrat de travail du dépôt
├── calepin-backlog.md        217 tâches, 22 epics
├── docker-compose.yml        PostgreSQL, Redis, MinIO — `pnpm dev:services`
├── package.json              scripts racine, délégués au workspace
├── pnpm-workspace.yaml       apps/* et packages/*
├── tsconfig.base.json        socle TypeScript strict, étendu par chaque paquet
└── vitest.config.ts          projets Vitest « unit » et « integration »
```

Chaque paquet suit la même forme : `package.json`, `tsconfig.json` qui étend le
socle, `README.md` qui décrit le domaine et renvoie à son epic, et `src/index.ts`
qui expose la surface publique du domaine.

## Les domaines

| Paquet | Ce qu'il détient | Epic |
|---|---|---|
| `shared` | Primitives transverses : identifiants, types de résultat et d'erreur, helpers qui doivent se comporter à l'identique côté serveur, navigateur et worker. | — |
| `ai` | Couche IA, jamais le sens narratif : port fournisseur unique, capacités déclarées des modèles, routage mission → modèle, limites de débit, expiration, annulation, repli. Les SDK fournisseurs n'existent que dans ses adaptateurs (règle de lint). | E05 |
| `analysis` | Diagnostic narratif du texte source : résumé, prémisse, conflit, promesse, thèmes, personnages, fragilités, potentiel. Chaque élément porte une marque **factuel / interprétation**. | E07 |
| `direction` | Trois directions romanesques **divergentes** issues de l'analyse validée, douze attributs chacune. L'une devient canonique. | E08 |
| `bible` | La référence narrative : identité, style, personnages, relations, lieux, règles du monde, chronologie, faits canon (vérité, validité temporelle, connaissance par personnage). | E09 |
| `outline` | Le plan : parties, plans de chapitre, calibrage du nombre de chapitres, réordonnancement, fils narratifs, audit des fonctions dramatiques. | E10 |
| `manuscript` | Rédaction des chapitres, paramètres de génération, éditeur, réécritures ciblées, régénération non destructive, comparaison de versions. | E11 / E14 |
| `coherence` | Mémoire narrative (extraction de faits, état des personnages, chronologie) et moteur d'audit (continuité, psychologie, structure, style, originalité). | E12 / E13 |
| `export` | Modèle de composition strictement séparé du rendu par format ; exports asynchrones livrés par liens signés de courte durée. | E15 |

## Règle de dépendance

```
apps/*  ──►  n'importe quel paquet
packages/<domaine>  ──►  @calepin/shared, @calepin/ai  (déclaré explicitement)
@calepin/ai  ──►  @calepin/shared
@calepin/shared  ──►  rien
```

Un domaine qui doit en importer un autre exige d'ajouter explicitement l'entrée
`workspace:*` dans son `package.json`. C'est volontaire : pnpm refuse l'import
tant que la dépendance n'est pas déclarée, ce qui rend la décision visible en
revue au lieu de la laisser passer en silence.

Cette contrainte n'est pas décorative. Un second processus existe depuis
CAL-060 — le worker BullMQ démarré par `pnpm worker` — et il appelle le même
code métier que l'application web. Le métier ne peut donc pas vivre dans
`apps/web`.

## Choix techniques

- **Paquets consommés en TypeScript source.** Chaque paquet expose
  `./src/index.ts` via son champ `exports` ; `apps/web` les compile lui-même
  grâce à `transpilePackages`. Aucun paquet n'a d'étape de build à maintenir.
  Ajouter un paquet suppose de l'ajouter à cette liste dans `next.config.ts`.
- **TypeScript 5.9.3, pas 7.x.** La version publiée la plus récente est 7.0.2,
  mais `create-next-app@16.3.0` fixe lui-même `^5`. On suit le générateur
  officiel plutôt que d'associer TypeScript 7 à `eslint-config-next` sans
  garantie, juste avant que CAL-003 ne configure ESLint.
- **CSS Modules et variables CSS.** Aucune bibliothèque d'interface n'est
  imposée par le backlog. Les valeurs vivent dans `globals.css`, en un seul
  endroit, en attendant le système de design (CAL-181 / CAL-182).
- **`agentRules: false`.** Next régénère sinon `AGENTS.md` et `CLAUDE.md` dans
  `apps/web` à chaque `pnpm dev`, en concurrence avec le `CLAUDE.md` racine.
- **`next typegen` avant `tsc`.** Le script `typecheck` de `apps/web` génère
  d'abord les types de routes, sans quoi il échoue sur un dépôt fraîchement
  cloné.
- **Journal : liste blanche, pas filtrage.** Un appel au journal s'écrit
  `logger.info(événement, champs?)`. Le nom d'événement doit avoir une forme
  d'identifiant et les champs sont retenus en parcourant la liste blanche, pas
  l'objet fourni par l'appelant : aucun contenu littéraire ne peut donc
  atteindre un journal technique. C'est une exigence du cahier des charges,
  vérifiée par `no-literary-content.test.ts`.
- **`proxy.ts`, pas `middleware.ts`.** Next 16.3 déprécie la convention
  `middleware` et avertit à chaque build. Le fichier attribue un
  `x-correlation-id` à chaque requête ; il ne journalise pas lui-même, faute de
  `node:async_hooks` sur le runtime Edge.
- **Erreurs : deux projections, jamais une seule.** Une défaillance devient soit
  une charge utile lisible — code, catégorie, message en français, identifiant
  de corrélation — soit une ligne de journal — code, catégorie, nom de l'erreur
  sous-jacente, cadres de pile, chemin du champ. Aucune des deux ne transporte
  le message technique. Les frontières d'erreur React n'inspectent jamais
  l'erreur reçue ; elles affichent le message français et l'empreinte (`digest`)
  que la ligne de journal porte elle aussi, ce qui permet de relier l'écran à la
  trace.

## Conventions

Les règles de travail du dépôt sont dans [`CLAUDE.md`](./CLAUDE.md).
