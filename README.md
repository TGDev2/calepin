# Calepin

Calepin accompagne l'écriture d'un roman, du texte source au manuscrit exporté :
analyse du texte de départ, exploration de directions romanesques, construction
de la bible narrative et du plan, rédaction chapitre par chapitre, contrôle de
cohérence, export.

Ce dépôt en est le squelette. Les domaines métier existent et sont vides ;
le backlog de réalisation est dans [`Calepin_backlog.md`](./Calepin_backlog.md).

## Prérequis

- Node.js ≥ 20.9
- pnpm 10.11

## Démarrer

```bash
pnpm install        # installe les 10 projets du workspace
pnpm dev:services    # PostgreSQL, Redis, MinIO — via Docker Compose
cp apps/web/.env.example apps/web/.env  # variables d'environnement locales
pnpm dev             # http://localhost:3000
```

`pnpm dev:services` démarre les trois services en arrière-plan
(`docker compose up -d`) ; `docker compose ps` montre leur état une fois
`healthy`. Les données vivent dans des volumes Docker nommés et survivent à un
`docker compose down` (sans `-v`). `apps/web/.env` est validé au démarrage par
`@calepin/shared/config` (schéma Zod, `packages/shared/src/config`) ; aucun
code applicatif ne se connecte encore aux services eux-mêmes — CAL-011
(schéma Prisma) et CAL-060 (worker) sont les tâches qui les câbleront.

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

Autres scripts à la racine : `pnpm typecheck` (tous les paquets), `pnpm start`
(sert le build de production), `pnpm build` (build de production), `pnpm test`
(Vitest, unitaire), `pnpm test:integration` (Vitest, base PostgreSQL isolée par
exécution via Testcontainers — nécessite Docker), `pnpm test:e2e` (Playwright,
`apps/web`).

## Arborescence

```
calepin/
├── apps/
│   └── web/                  @calepin/web — application Next.js 16, App Router
│       ├── next.config.ts    transpilePackages : compile les paquets depuis leurs sources TS
│       ├── playwright.config.ts  configuration Playwright (E2E)
│       ├── public/
│       ├── src/app/          routes, layouts et styles
│       └── tests/e2e/        specs Playwright
│
├── docs/
│   └── adr/                  décisions d'architecture — ADR-001 : forme du
│                             backend, frontière couche IA / couche métier
│
├── packages/                 le métier, hors de toute application
│   ├── shared/                @calepin/shared — primitives transverses
│   │   ├── src/config/        schéma d'environnement Zod (`@calepin/shared/config`)
│   │   └── src/testing/       helpers de fabrique de données pour les tests
│   ├── analysis/              @calepin/analysis — diagnostic du texte source
│   ├── direction/             @calepin/direction — directions romanesques divergentes
│   ├── bible/                 @calepin/bible — référence narrative
│   ├── outline/               @calepin/outline — parties, plans de chapitre, fils
│   ├── manuscript/            @calepin/manuscript — rédaction, édition, versions
│   ├── coherence/             @calepin/coherence — mémoire narrative et moteur d'audit
│   └── export/                @calepin/export — composition et rendu par format
│
├── test/
│   └── integration/          base PostgreSQL isolée par exécution (Testcontainers) et son globalSetup Vitest
│
├── tasks/
│   ├── todo.md               le plan en cours
│   └── lessons.md            les corrections reçues, converties en règles
│
├── CLAUDE.md                 contrat de travail du dépôt
├── Calepin_backlog.md        207 tâches, 21 epics
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
packages/<domaine>  ──►  @calepin/shared  uniquement
@calepin/shared  ──►  rien
```

Un domaine qui doit en importer un autre exige d'ajouter explicitement l'entrée
`workspace:*` dans son `package.json`. C'est volontaire : pnpm refuse l'import
tant que la dépendance n'est pas déclarée, ce qui rend la décision visible en
revue au lieu de la laisser passer en silence.

Cette contrainte n'est pas décorative. Un second processus est acquis — un
worker BullMQ démarré par `pnpm worker` (CAL-060) — et il appelle le même code
métier que l'application web. Le métier ne peut donc pas vivre dans `apps/web`.

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

## Emplacements réservés

Ces répertoires n'existent pas encore ; ils appartiennent à des tâches à venir
et ne sont pas créés à vide.

| Emplacement | Tâche |
|---|---|
| `apps/worker/` | CAL-060 — worker BullMQ, `pnpm worker` |
| `prisma/` | CAL-011 et suivantes — schéma et `prisma/seed.ts` |

## Conventions

Les règles de travail du dépôt sont dans [`CLAUDE.md`](./CLAUDE.md).
