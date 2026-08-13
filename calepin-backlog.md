# Calepin — Backlog de réalisation, affectation des modèles Claude et commandes Claude Code

> **Version 2 — 13 août 2026.** Document de pilotage dérivé du cahier des charges *Calepin* (v1), **mis à jour d'après l'état réel du dépôt**.
> Chaque tâche est un incrément livrable en une session Claude Code, avec son état d'avancement, le modèle Claude recommandé, le niveau d'effort, la justification du choix et la commande exacte à exécuter.
>
> **Ce qui a changé depuis la version 1 :** 106 tâches marquées faites (dont 20 partielles) · un epic ajouté, **E21 Mise en service des générations** (CAL-208 → CAL-217), placé sur le chemin critique avant E11 · jalons réordonnés · une convention de livraison amendée (§C.7). Aucun identifiant n'a été renuméroté.

---

## Partie A — Doctrine de choix des modèles

### A.1 Les modèles disponibles (données vérifiées, août 2026)

| Modèle | Alias Claude Code | Contexte | Sortie max | Tarif (entrée / sortie, par Mtok) | Connaissances jusqu'à | Niveaux d'effort |
|---|---|---|---|---|---|---|
| **Claude Fable 5** (`claude-fable-5`) | `fable`, `best` | 1 M | 128 k | 10 $ / 50 $ | janvier 2026 | `low` → `max` |
| **Claude Opus 5** (`claude-opus-5`) | `opus` | 1 M | 128 k | 5 $ / 25 $ | **mai 2026** | `low` → `max` |
| **Claude Sonnet 5** (`claude-sonnet-5`) | `sonnet` | 1 M | 128 k | 3 $ / 15 $ *(tarif d'introduction 2 $ / 10 $ jusqu'au 31 août 2026)* | janvier 2026 | `low` → `max` |
| **Claude Haiku 4.5** (`claude-haiku-4-5`) | `haiku` | 200 k | 64 k | 1 $ / 5 $ | février 2025 | **aucun** |

Positionnement officiel de chaque modèle :

- **Fable 5** — « intelligence de nouvelle génération pour les agents à longue durée d'exécution ». C'est le modèle le plus capable disponible dans Claude Code, prévu pour des tâches **plus grandes qu'une seule séance de travail** : il tient des sessions autonomes longues, il enquête avant d'agir et il vérifie son propre travail plus souvent que les modèles plus petits. Son raisonnement est **toujours actif et non désactivable**.
- **Opus 5** — « pour le codage agentique complexe et le travail d'entreprise ». C'est le modèle recommandé par défaut par Anthropic quand on hésite. Il a la **date de connaissance la plus récente des quatre (mai 2026)**, ce qui compte énormément sur une stack Next.js / Prisma / BullMQ dont les API bougent vite.
- **Sonnet 5** — « le meilleur compromis entre vitesse et intelligence ». C'est le cheval de trait du quotidien : CRUD, écrans, endpoints, tests.
- **Haiku 4.5** — « le modèle le plus rapide, avec une intelligence proche de la frontière ». Attention à deux limites structurelles : **fenêtre de 200 k seulement** (contre 1 M pour les trois autres) et **connaissances arrêtées en février 2025**, donc il ne connaît pas les versions récentes de l'écosystème. Il **ne prend pas en charge les niveaux d'effort**.

### A.2 Les niveaux d'effort (données vérifiées)

L'effort pilote le raisonnement adaptatif : le modèle décide, à chaque étape, s'il doit réfléchir et combien.

| Niveau | Quand l'utiliser (formulation officielle) |
|---|---|
| `low` | Tâches courtes, cadrées, sensibles à la latence et **non sensibles à l'intelligence** |
| `medium` | Travail sensible au coût, qui peut céder un peu d'intelligence |
| `high` | **Défaut sur tous les modèles concernés.** Équilibre jetons / intelligence |
| `xhigh` | Raisonnement plus profond, dépense de jetons plus élevée. Cible : tâches agentiques longues (> 30 min) |
| `max` | Capacité maximale sans contrainte. **Session uniquement.** Peut montrer des rendements décroissants et a tendance à la sur-réflexion — à tester avant adoption large |
| `ultracode` | Réglage Claude Code (pas un niveau de modèle) : envoie `xhigh` **et** fait orchestrer des workflows dynamiques. Session uniquement |

Trois points opérationnels qui changent la façon d'écrire les commandes :

1. **L'échelle d'effort est calibrée par modèle.** `high` sur Sonnet 5 et `high` sur Fable 5 ne représentent pas la même dépense réelle.
2. **Haiku 4.5 ignore `--effort`.** Les commandes Haiku de ce backlog ne portent donc pas ce drapeau — c'est volontaire, pas un oubli.
3. **`ultrathink`** placé n'importe où dans le prompt demande un raisonnement plus profond **pour ce tour uniquement**, sans modifier le réglage de session. Les formules « think hard », « think more » ne sont **pas** reconnues comme mots-clés.

### A.3 Règle d'arbitrage appliquée dans tout ce backlog

La question à se poser est celle recommandée par Anthropic : **le modèle a-t-il manqué de savoir, ou manqué d'effort ?** Un manque de savoir se corrige en montant de modèle ; un manque d'effort se corrige en montant le niveau d'effort.

| Nature de la tâche | Modèle | Effort typique |
|---|---|---|
| Problème ambigu, sans bonne réponse connue d'avance ; investigation de cause racine ; décision d'architecture structurante ; travail dépassant une séance | `fable` | `xhigh` (parfois `max`) |
| Codage agentique complexe mais spécifié ; conception de schémas, de prompts, de moteurs de règles ; tout ce qui touche à des API d'écosystème récentes | `opus` | `high` / `xhigh` |
| CRUD, endpoints, écrans, formulaires, tests, câblage, migrations simples | `sonnet` | `high` (ou `medium` si très répétitif) |
| Mécanique pure, courte, sans dépendance à l'écosystème récent : renommages, fixtures, seeds, libellés, scripts jetables | `haiku` | *(non applicable)* |

Deux réserves importantes, vérifiées :

- **Ne pas confier à Haiku 4.5 du code dépendant de versions récentes.** Ses connaissances s'arrêtent en février 2025 : sur Next.js, Prisma ou BullMQ de 2026 il produira du code plausible mais périmé. Il est réservé ici aux tâches où le contenu métier est fourni par le prompt lui-même.
- **Fable 5 déclenche un repli automatique de modèle** quand ses classifieurs de sûreté signalent une requête, le plus souvent dans les domaines cybersécurité et biologie. L'epic E16 (sécurité) est donc volontairement affecté à `opus` et non à `fable` : formuler des tâches de durcissement à Fable 5 expose à un repli silencieux vers un autre modèle.

### A.4 Conventions de commande

Toutes les commandes de ce document supposent :

- Claude Code **v2.1.219 ou plus** (version minimale requise pour qu'Opus 5 apparaisse ; Sonnet 5 exige v2.1.197, Fable 5 exige v2.1.170). Vérifier avec `claude update`.
- Le fournisseur **API Anthropic**, où `opus` résout vers Opus 5 et `sonnet` vers Sonnet 5. Sur Amazon Bedrock, Microsoft Foundry ou Google Cloud, ces alias résolvent vers des versions plus anciennes : dans ce cas, remplacer l'alias par le nom complet (`claude-opus-5`, `claude-sonnet-5`) ou fixer `ANTHROPIC_DEFAULT_OPUS_MODEL`.
- Exécution **depuis la racine du dépôt** `Documents\Projects\calepin`.
- Stack : Next.js + TypeScript, PostgreSQL + Prisma, Redis + BullMQ, stockage compatible S3, pnpm.

Conventions reprises de tes règles de travail habituelles et intégrées aux prompts :

- **Mode plan** (`--permission-mode plan`) sur toutes les tâches de complexité 3/3 et sur celles qui touchent plusieurs couches ; le plan est écrit dans `tasks/todo.md`.
- **Fin de tâche = dépôt commité**, message court, en anglais, au format Conventional Commits, sans aucune mention d'outil ni d'assistant.
- **Sous-agents pour la recherche.** Pour rendre les sous-agents économiques sur les tâches longues, poser une fois par terminal :
  `set CLAUDE_CODE_SUBAGENT_MODEL=haiku` (Windows CMD) ou `$env:CLAUDE_CODE_SUBAGENT_MODEL="haiku"` (PowerShell). Repasser à `inherit` pour les tâches où les sous-agents doivent raisonner.
- **Garde-fou de coût** sur les tâches Fable 5 : `--max-budget-usd` est indiqué dans les commandes concernées.

Deux commandes de session utiles, à connaître avant de dérouler le backlog :

```bash
claude update
claude --model opus --effort high
```

Dans une session ouverte : `/model fable`, `/effort xhigh`, `/effort auto` (retour au défaut du modèle).

### A.5 Répartition prévisionnelle

Le backlog compte **207 tâches réparties sur 21 epics**. Affectation effective :

| Modèle | Tâches | Part | Rôle dans le projet |
|---|---|---|---|
| `opus` | 95 | 45,9 % | Le cœur produit : schémas narratifs, couche IA, orchestration, mémoire, sécurité |
| `sonnet` | 70 | 33,8 % | Le volume : écrans, endpoints, migrations dérivées, tests, instrumentation |
| `fable` | 28 | 13,5 % | Les nœuds : architecture, divergence des directions, missions littéraires, audits |
| `haiku` | 14 | 6,8 % | Le mécanique : seeds, réplications de patron, libellés, rendus dérivés |

Le point à retenir sur le coût : sur une tâche routinière, le petit modèle coûte moins par jeton ; sur un travail complexe en plusieurs étapes, le grand modèle atteint la cible de qualité plus vite et peut donc coûter **moins cher au total** — et surtout, il accomplit des tâches que le petit modèle n'accomplit pas du tout.

---

## Partie A bis — État d'avancement du dépôt

*Établi le 13 août 2026 par lecture du dépôt `Documents\Projects\Calepin` : 214 commits sur `main`, arbre de travail propre, `tasks/todo.md` (1,0 Mo) et `tasks/lessons.md` (78 ko) tenus à jour.*

### A bis.1 Ce qui est réellement fait

| Epic | Tâches | Fait | Reste | Commentaire |
|---|---|---|---|---|
| E00 Fondations | 11 | 11 | 0 | Monorepo, CI, ADR-001, journalisation à liste blanche, hiérarchie d'erreurs |
| E01 Données | 12 | 12 | 0 | 46 modèles Prisma, bloc d'audit, portée par propriétaire (`ProjectScope`) |
| E02 Authentification | 8 | 8 | 0 | Auth.js, lien courriel, Google, GitHub, suppression de compte |
| E03 Tableau de bord | 8 | 8 | 0 | Statut dérivé, agrégats maintenus à l'écriture, duplication profonde |
| E04 Création de projet | 8 | 8 | 0 | Comptage de mots français partagé, obsolescence en aval, import de fichier |
| E05 Couche IA | 12 | 12 | 0 | Port fournisseur, registre de 25 missions, contexte dynamique, idempotence |
| E06 Orchestration | 10 | 10 | 0 | BullMQ, bail, réconciliation, annulation, verrou par cible d'écriture |
| E07 Analyse | 9 | 9 | 0 | Diagnostic 17 sections, vérification des citations, écran, validation |
| E08 Directions | 9 | 9 | 0 | Moteur narratif, portail de divergence, remplacement, combinaison |
| E09 Bible | 13 | 13 | 0 | Identité, style, personnages, relations, monde, chronologie, faits, verrous |
| E10 Plan | 11 | **6** | **5** | CAL-101 → CAL-106 faits ; CAL-107 → CAL-111 restants |
| E11 → E20 | 96 | 0 | 96 | Non commencés |
| **E21 Mise en service** *(nouvel epic)* | **10** | **0** | **10** | Créé par cette mise à jour — voir ci-dessous |
| **Total** | **217** | **106** | **111** | |

**Preuves relevées.** `pnpm test` : 4 040 tests unitaires sur 212 fichiers. `pnpm test:integration` : 1 226 tests sur 53 fichiers, contre PostgreSQL et Redis éphémères. `pnpm test:e2e` : 123 tests Playwright. `pnpm lint`, `pnpm build` et `prisma migrate diff --exit-code` propres. La qualité d'exécution est nettement au-dessus de ce que le backlog exigeait : glossaire de domaine, ADR, frontières de couches tenues par des règles de lint testées, aucun contenu littéraire dans les journaux.

### A bis.2 Le constat qui commande la suite

**Le dépôt est à 49 % du backlog en nombre de tâches et à 0 % de fonction produit de bout en bout.** Aucune génération ne peut aboutir aujourd'hui, pour une raison unique et parfaitement circonscrite :

- Les **25 missions** sont déclarées dans l'énumération `GenerationMission`, et les **25 prompts** existent dans `packages/ai/src/prompts/missions/`, avec leurs contrats Zod, leurs vérificateurs et leurs tests.
- `apps/worker/src/main.ts` compose **`NO_GENERATION_EXECUTORS`**. Aucun `GenerationExecutor` n'est enregistré, donc aucune mission ne s'exécute — une génération mise en file est laissée en attente d'un travailleur qui saurait la traiter, comportement volontaire et documenté.
- Aucun processus ne compose de `ModelProviderPort` : `ANTHROPIC_API_KEY` n'est même pas déclaré dans `envSchema` (§13 du `CLAUDE.md` le reconnaît explicitement et en attribue la charge à « la première tâche qui enregistre un exécuteur »).
- **Aucun chemin d'écriture d'un résultat généré n'existe.** Vérifié : ni `writeAnalysis`, ni `writeDirectionProposals`, ni `writeNovelIdentity`, ni `writeCharacterSheet`, ni `writeWorldBible`, ni `writeTimeline`, ni `writeInitialCanonFacts`, ni `writePartStructure`, ni `writeChapterOutlineBatch`. Les domaines produisent des fonctions `resolve*` qui rendent des valeurs de colonnes — que rien ne persiste.
- Le seul déclenchement de génération présent dans l'interface est le **rejeu** d'une génération existante. Aucun écran n'en crée.
- Les écrans qui existent — analyse, directions, bible, faits, relations, cohérence, plan — affichent des données fabriquées par `prisma/seed.ts` (1 101 lignes). Le produit se démontre sur un jeu d'amorçage, pas sur une génération.

Ce n'est pas un défaut de qualité, c'est une **frontière tenue avec méthode** : chaque revue de tâche note « no executor and no provider key (§13) » et livre le contrat plutôt qu'un demi-câblage. Mais la conséquence est qu'un seul chaînon manquant bloque la totalité du parcours du MVP, et le backlog initial ne l'avait pas isolé — il supposait ce câblage absorbé par CAL-051, CAL-060 et CAL-061.

### A bis.3 Trois amendements au backlog

1. **Nouvel epic E21 — Mise en service des générations (CAL-208 → CAL-217).** Il est numéroté en fin de document mais **s'exécute immédiatement, avant E11**. Numérotation et ordre d'exécution sont deux choses distinctes : les identifiants sont cités par 214 commits, par `tasks/todo.md` et par le glossaire du `CLAUDE.md`, donc **aucun n'est renuméroté**.
2. **La règle « une mission se livre comme un contrat » s'arrête à CAL-208.** À partir de là, toute tâche dont le livrable est une mission livre aussi **son exécuteur et son chemin d'écriture**, et le prouve par une génération réellement exécutée. Cela concerne toutes les missions restantes de E11, E12 et E13 : `write-scene`, `extract-facts`, `check-coherence`, `fix-issue`, `summarize-chapter`, `summarize-part`, dont les prompts sont déjà écrits.
3. **Deux tâches sont terminées sans section de revue** dans `tasks/todo.md` — CAL-013 et CAL-038 — ce qui contrevient à la définition de terminé du `CLAUDE.md`. CAL-217 rattrape cette dette.

---

## Partie B — Backlog

Légende : **Complexité** 1 = mécanique · 2 = standard · 3 = structurante.
Les identifiants `CAL-xxx` sont stables et réutilisables comme références de commit et de branche — ils ne sont **jamais** renumérotés.

État : ✅ terminé · 🟡 partiel, avec la raison et la tâche qui le débloque · ⬜ à faire.

### E00 — Cadrage, dépôt et fondations *(Phase 1)*

##### CAL-001 · Initialiser le dépôt Next.js + TypeScript
- **État** : ✅ **Terminé** — commité, revu dans `tasks/todo.md`
- **Contenu** : monorepo pnpm, application Next.js en App Router, TypeScript strict, structure de dossiers par domaine métier (`analysis`, `direction`, `bible`, `outline`, `manuscript`, `coherence`, `export`).
- **Fini quand** : `pnpm dev` démarre, `pnpm build` passe, l'arborescence est documentée dans le README.
- **Modèle** : `opus` (Claude Opus 5) · **Effort** : `high` · **Complexité** : 2/3
- **Pourquoi ce modèle** : l'initialisation d'un projet Next.js en 2026 dépend de conventions récentes (App Router, Server Actions, configuration TypeScript). Opus 5 est le seul des quatre modèles dont les connaissances vont jusqu'à mai 2026 ; Sonnet 5 et Fable 5 s'arrêtent en janvier 2026 et Haiku 4.5 en février 2025, ce qui produit ici du code d'amorçage périmé et coûteux à corriger. `high` suffit : la tâche est spécifiée, elle n'est pas ambiguë.
- **Commande** :

```bash
claude --model opus --effort high "Initialise le dépôt Calepin : monorepo pnpm, application Next.js en App Router avec TypeScript en mode strict, structure de dossiers par domaine métier (analysis, direction, bible, outline, manuscript, coherence, export, shared). Documente l arborescence dans le README. Vérifie que pnpm dev et pnpm build passent avant de conclure. Termine par un commit Conventional Commits en anglais."
```

##### CAL-002 · Rédiger le CLAUDE.md racine
- **État** : ✅ **Terminé** — commité, revu dans `tasks/todo.md`
- **Contenu** : conventions du projet (nommage, couches, gestion d'erreurs, tests obligatoires, règle de commit, interdiction d'écrire du texte littéraire dans les journaux), à respecter par toutes les sessions suivantes.
- **Fini quand** : `CLAUDE.md` couvre architecture, conventions, tests, git, et interdits ; il est référencé dans le README.
- **Modèle** : `opus` (Claude Opus 5) · **Effort** : `high` · **Complexité** : 2/3
- **Pourquoi ce modèle** : ce fichier conditionne la qualité de **toutes** les sessions suivantes ; c'est un investissement à fort effet de levier où une formulation imprécise coûte cher en aval. Opus 5 est le modèle recommandé par défaut pour le travail agentique complexe et rédige des consignes opérationnelles denses. Un modèle plus petit produit des conventions génériques et peu contraignantes.
- **Commande** :

```bash
claude --model opus --effort high "Rédige le CLAUDE.md racine du projet Calepin. Couvre : architecture par domaine métier, conventions de nommage, séparation stricte entre couche IA et couche métier, sorties structurées validées par schéma, gestion d erreurs, tests obligatoires pour toute logique métier, interdiction absolue d écrire du contenu littéraire dans les journaux techniques, règle de commit Conventional Commits en anglais sans mention d outil. Termine par un commit Conventional Commits en anglais."
```

##### CAL-003 · Configurer ESLint, Prettier et les règles TypeScript strictes
- **État** : ✅ **Terminé** — commité, revu dans `tasks/todo.md`
- **Contenu** : configuration partagée, règles d'import, interdiction du `any`, tri des imports, script `pnpm lint`.
- **Fini quand** : `pnpm lint` et `pnpm typecheck` passent sur le dépôt vide.
- **Modèle** : `sonnet` (Claude Sonnet 5) · **Effort** : `medium` · **Complexité** : 1/3
- **Pourquoi ce modèle** : configuration d'outillage bien documentée, sans ambiguïté de conception. Sonnet 5 offre le meilleur rapport vitesse/intelligence pour ce type de travail et coûte trois fois moins qu'Opus 5 en sortie. `medium` est justifié : l'énoncé officiel de ce niveau vise précisément le travail sensible au coût qui peut céder un peu d'intelligence.
- **Commande** :

```bash
claude --model sonnet --effort medium "Configure ESLint, Prettier et les règles TypeScript strictes du projet Calepin : interdiction de any, imports triés, règles d import par domaine, scripts pnpm lint, pnpm lint:fix et pnpm typecheck. Vérifie que lint et typecheck passent. Termine par un commit Conventional Commits en anglais."
```

##### CAL-004 · Mettre en place le socle de tests (Vitest + Playwright)
- **État** : ✅ **Terminé** — commité, revu dans `tasks/todo.md`
- **Contenu** : Vitest pour l'unitaire et l'intégration, Playwright pour l'E2E, base de test isolée, helpers de fabrique.
- **Fini quand** : un test unitaire et un test E2E d'exemple passent en local et en CI.
- **Modèle** : `sonnet` (Claude Sonnet 5) · **Effort** : `high` · **Complexité** : 2/3
- **Pourquoi ce modèle** : câblage d'outillage standard, largement représenté dans les données d'entraînement, mais avec des points de friction réels (base isolée, cycle de vie Playwright) qui justifient l'effort par défaut plutôt que `medium`.
- **Commande** :

```bash
claude --model sonnet --effort high "Mets en place le socle de tests de Calepin : Vitest pour l unitaire et l intégration avec une base PostgreSQL de test isolée par exécution, Playwright pour l end-to-end, helpers de fabrique de données. Ajoute un test unitaire et un test E2E d exemple. Vérifie qu ils passent avant de conclure. Termine par un commit Conventional Commits en anglais."
```

##### CAL-005 · Environnement local Docker Compose (PostgreSQL, Redis, MinIO)
- **État** : ✅ **Terminé** — commité, revu dans `tasks/todo.md`
- **Contenu** : `docker-compose.yml`, volumes persistants, script `pnpm dev:services`, documentation de démarrage.
- **Fini quand** : les trois services démarrent, l'application s'y connecte, la procédure tient en trois commandes dans le README.
- **Modèle** : `sonnet` (Claude Sonnet 5) · **Effort** : `medium` · **Complexité** : 1/3
- **Pourquoi ce modèle** : composition d'images officielles, tâche mécanique et bien balisée. Haiku 4.5 conviendrait au fichier seul, mais le câblage avec la configuration applicative dépend de versions récentes de Prisma et du SDK S3 qu'il ne connaît pas (connaissances arrêtées en février 2025).
- **Commande** :

```bash
claude --model sonnet --effort medium "Crée l environnement local de Calepin avec Docker Compose : PostgreSQL, Redis et MinIO compatible S3, avec volumes persistants et healthchecks. Ajoute le script pnpm dev:services et documente le démarrage en trois commandes dans le README. Termine par un commit Conventional Commits en anglais."
```

##### CAL-006 · Validation des variables d'environnement au démarrage
- **État** : ✅ **Terminé** — commité, revu dans `tasks/todo.md`
- **Contenu** : schéma Zod des variables, échec explicite au boot, `.env.example` complet, typage exporté.
- **Fini quand** : le démarrage échoue avec un message lisible si une variable manque ; aucune lecture directe de `process.env` ailleurs dans le code.
- **Modèle** : `sonnet` (Claude Sonnet 5) · **Effort** : `high` · **Complexité** : 1/3
- **Pourquoi ce modèle** : périmètre étroit, résultat vérifiable mécaniquement. Sonnet 5 est calibré pour ce type de tâche quotidienne.
- **Commande** :

```bash
claude --model sonnet --effort high "Ajoute la validation des variables d environnement de Calepin avec Zod : schéma unique, échec au démarrage avec message lisible listant les variables manquantes, typage exporté, .env.example complet. Interdis toute lecture directe de process.env ailleurs dans le code et ajoute une règle ESLint qui le vérifie. Termine par un commit Conventional Commits en anglais."
```

##### CAL-007 · Pipeline d'intégration continue
- **État** : ✅ **Terminé** — commité, revu dans `tasks/todo.md`
- **Contenu** : GitHub Actions — install, lint, typecheck, tests unitaires, tests E2E, build, cache pnpm.
- **Fini quand** : le pipeline passe au vert sur une pull request de test en moins de dix minutes.
- **Modèle** : `sonnet` (Claude Sonnet 5) · **Effort** : `high` · **Complexité** : 2/3
- **Pourquoi ce modèle** : travail d'intégration classique où la difficulté est l'itération sur les erreurs, pas la conception. Sonnet 5 est adapté ; monter à Opus 5 n'apporterait rien de mesurable ici.
- **Commande** :

```bash
claude --model sonnet --effort high "Crée le pipeline GitHub Actions de Calepin : installation avec cache pnpm, lint, typecheck, tests unitaires avec services PostgreSQL et Redis, tests E2E Playwright, build. Objectif : moins de dix minutes. Termine par un commit Conventional Commits en anglais."
```

##### CAL-008 · Décision d'architecture applicative (ADR-001)
- **État** : ✅ **Terminé** — commité, revu dans `tasks/todo.md`
- **Contenu** : arbitrage backend intégré à Next.js contre service séparé, frontière entre couche IA et couche métier, stratégie de versionnement des entités, conséquences sur le déploiement.
- **Fini quand** : `docs/adr/001-architecture.md` expose le contexte, deux options écartées avec motifs, la décision et ses conséquences.
- **Modèle** : `fable` (Claude Fable 5) · **Effort** : `xhigh` · **Complexité** : 3/3
- **Pourquoi ce modèle** : c'est exactement le profil de tâche pour lequel Fable 5 est conçu — un problème ambigu, sans bonne réponse connue d'avance, dont les conséquences se paient pendant toute la vie du produit. La documentation officielle cite les décisions d'architecture comme le cas où son surcroît d'investigation et de vérification est rentable. `xhigh` correspond au travail à long horizon. Le budget est plafonné car Fable 5 coûte 50 $ par million de jetons de sortie.
- **Commande** :

```bash
claude --model fable --effort xhigh --permission-mode plan --max-budget-usd 8 "ultrathink Rédige l ADR-001 de Calepin dans docs/adr/001-architecture.md. Arbitre entre backend intégré aux routes Next.js et service backend séparé, en tenant compte des générations longues, de la file BullMQ, du versionnement de toutes les entités narratives et de la contrainte de rester déployable par une seule personne. Définis la frontière entre couche IA et couche métier. Expose le contexte, au moins deux options écartées avec leurs motifs, la décision retenue et ses conséquences. Écris ton plan dans tasks/todo.md avant d agir. Termine par un commit Conventional Commits en anglais."
```

##### CAL-009 · Journalisation structurée et corrélation des requêtes
- **État** : ✅ **Terminé** — commité, revu dans `tasks/todo.md`
- **Contenu** : logger Pino, identifiant de corrélation par requête et par génération, niveaux, redaction automatique.
- **Fini quand** : chaque requête et chaque génération portent un identifiant traçable ; **aucun contenu littéraire n'apparaît dans les journaux**, garanti par un test.
- **Modèle** : `opus` (Claude Opus 5) · **Effort** : `high` · **Complexité** : 2/3
- **Pourquoi ce modèle** : l'exigence du cahier des charges — ne jamais journaliser intégralement les contenus littéraires — impose une politique de rédaction fine et une discipline transverse, pas seulement un `logger.info`. Opus 5 tient ce genre de contrainte croisée mieux que Sonnet 5, et sa fraîcheur de connaissances couvre les API de journalisation récentes de Next.js.
- **Commande** :

```bash
claude --model opus --effort high "Mets en place la journalisation structurée de Calepin avec Pino : identifiant de corrélation par requête HTTP et par génération IA, niveaux configurables, redaction automatique des champs sensibles. Règle absolue : aucun contenu littéraire ne doit apparaître dans les journaux techniques, seulement des métriques et des identifiants. Ajoute un test qui échoue si un champ de prose est journalisé. Termine par un commit Conventional Commits en anglais."
```

##### CAL-010 · Gestion d'erreurs unifiée
- **État** : ✅ **Terminé** — commité, revu dans `tasks/todo.md`
- **Contenu** : hiérarchie d'erreurs applicatives, mapping vers codes HTTP, frontières d'erreur React, messages utilisateur en français.
- **Fini quand** : toute erreur remonte un message compréhensible sans détail technique, et le journal conserve la trace complète.
- **Modèle** : `opus` (Claude Opus 5) · **Effort** : `high` · **Complexité** : 2/3
- **Pourquoi ce modèle** : la tâche touche à la fois le serveur, le client et la file de tâches, et le cahier des charges exige qu'un échec de génération ne corrompe jamais le projet. C'est du codage agentique complexe multicouche, cas d'usage annoncé d'Opus 5.
- **Commande** :

```bash
claude --model opus --effort high "Mets en place la gestion d erreurs unifiée de Calepin : hiérarchie d erreurs applicatives typées, mapping vers codes HTTP, frontières d erreur React, messages utilisateur en français sans détail technique, trace complète côté journal. Garantis qu un échec de génération laisse le projet dans un état valide et relançable. Termine par un commit Conventional Commits en anglais."
```

##### CAL-011 · Jeu de données de démonstration et script de seed
- **État** : ✅ **Terminé** — commité, revu dans `tasks/todo.md`
- **Contenu** : un utilisateur de test, trois projets à des étapes différentes, une nouvelle courte libre de droits comme texte source.
- **Fini quand** : `pnpm db:seed` recrée un environnement de démonstration reproductible.
- **Modèle** : `haiku` (Claude Haiku 4.5) · **Effort** : *n/a* · **Complexité** : 1/3
- **Pourquoi ce modèle** : tâche purement mécanique une fois le schéma Prisma figé — remplir des tables selon un modèle déjà écrit. C'est le profil visé par Haiku 4.5 : le plus rapide, à 1 $ / 5 $ par million de jetons contre 5 $ / 25 $ pour Opus 5. Sa fenêtre de 200 k suffit largement, et l'absence de niveau d'effort est sans conséquence sur une tâche non sensible à l'intelligence. **Haiku 4.5 ne prend pas en charge `--effort` : le drapeau est volontairement absent.**
- **Commande** :

```bash
claude --model haiku "Écris le script de seed de Calepin dans prisma/seed.ts : un utilisateur de test, trois projets aux statuts brouillon, plan en construction et rédaction en cours, un texte source de nouvelle courte libre de droits de moins de 2000 mots. Le script doit être idempotent et exposé via pnpm db:seed. Suis strictement le schéma Prisma existant sans l inventer. Termine par un commit Conventional Commits en anglais."
```

---

### E01 — Modèle de données et persistance *(Phase 1)*

##### CAL-012 · Schéma Prisma — socle utilisateur et projet
- **État** : ✅ **Terminé** — commité, revu dans `tasks/todo.md`
- **Contenu** : `User`, `Project`, énumération des dix statuts du cahier des charges, langue, longueur cible, public visé, degré de liberté.
- **Fini quand** : la migration s'applique, les statuts correspondent exactement à la liste du cahier des charges, les index de listing existent.
- **Modèle** : `opus` (Claude Opus 5) · **Effort** : `high` · **Complexité** : 2/3
- **Pourquoi ce modèle** : le schéma est la fondation de tout le reste ; une erreur de modélisation ici se propage à vingt tâches. Opus 5 est le modèle recommandé pour le travail structurant, et ses connaissances de mai 2026 couvrent les évolutions récentes de Prisma.
- **Commande** :

```bash
claude --model opus --effort high "Crée le schéma Prisma socle de Calepin : modèles User et Project. Le projet porte titre, langue, longueur cible avec les quatre options du cahier des charges dont personnalisée, public visé, degré de liberté faible équilibré ou élevé, et un statut parmi brouillon, analyse en cours, direction à choisir, bible à valider, plan en construction, rédaction en cours, révision, terminé, publié, archivé. Ajoute les index nécessaires au listing du tableau de bord. Génère et applique la migration. Termine par un commit Conventional Commits en anglais."
```

##### CAL-013 · Schéma Prisma — texte source et ses versions
- **État** : ✅ **Terminé** — commité, mais **sans section de revue** dans `tasks/todo.md` (dette reprise par CAL-217)
- **Contenu** : `SourceText`, `SourceTextVersion`, comptage de mots stocké, contrainte de 2 000 mots.
- **Fini quand** : la limite est vérifiée en base et à l'écriture ; l'historique des versions est consultable.
- **Modèle** : `sonnet` (Claude Sonnet 5) · **Effort** : `high` · **Complexité** : 2/3
- **Pourquoi ce modèle** : modélisation dérivée du socle posé en CAL-012, avec un patron de versionnement déjà décidé. Le travail est spécifié : Sonnet 5 suffit et coûte trois fois moins en sortie.
- **Commande** :

```bash
claude --model sonnet --effort high "Ajoute au schéma Prisma de Calepin les modèles SourceText et SourceTextVersion : contenu, nombre de mots stocké, langue, numéro de version, horodatages, auteur de la modification. Applique la contrainte de 2000 mots au niveau base et au niveau écriture. Génère et applique la migration, ajoute les tests d intégration. Termine par un commit Conventional Commits en anglais."
```

##### CAL-014 · Schéma Prisma — analyse narrative
- **État** : ✅ **Terminé** — commité, revu dans `tasks/todo.md`
- **Contenu** : `NarrativeAnalysis` avec les dix-sept sections du cahier des charges, distinction fait explicite / interprétation, annotations utilisateur, statut de validation.
- **Fini quand** : chaque section du cahier des charges est représentée, chaque élément porte son marqueur `factuel` ou `interprétation`.
- **Modèle** : `opus` (Claude Opus 5) · **Effort** : `xhigh` · **Complexité** : 3/3
- **Pourquoi ce modèle** : dix-sept sections hétérogènes, dont certaines sont des listes d'objets annotables, plus une distinction fait/interprétation qui doit être portée par le modèle de données et non par la présentation. C'est de la conception de schéma dense — cas d'usage explicite d'Opus 5. `xhigh` parce que la tâche demande de tenir simultanément dix-sept structures cohérentes entre elles.
- **Commande** :

```bash
claude --model opus --effort xhigh --permission-mode plan "ultrathink Conçois le modèle de données de l analyse narrative de Calepin. Il doit couvrir les dix-sept sections du cahier des charges : résumé factuel, prémisse, conflit principal, promesse du récit, thèmes, personnages identifiés, relations, point de vue, temps verbal, tonalité, éléments singuliers, ambiguïtés, questions non résolues, éléments à préserver, fragilités, risques de clichés, potentiel de développement. Chaque élément doit porter un marqueur factuel ou interprétation, être annotable par l utilisateur et versionnable. Écris ton plan dans tasks/todo.md avant d agir. Génère et applique la migration. Termine par un commit Conventional Commits en anglais."
```

##### CAL-015 · Schéma Prisma — directions créatives
- **État** : ✅ **Terminé** — commité, revu dans `tasks/todo.md`
- **Contenu** : `CreativeDirection` avec les douze attributs du cahier des charges, marqueur de direction canonique, origine (proposée, modifiée, rédigée par l'utilisateur).
- **Fini quand** : trois directions coexistent par projet, une seule peut être canonique, la contrainte est garantie en base.
- **Modèle** : `sonnet` (Claude Sonnet 5) · **Effort** : `high` · **Complexité** : 2/3
- **Pourquoi ce modèle** : structure plate, bien définie par le cahier des charges, avec une seule contrainte d'unicité partielle à poser. Sonnet 5 est calibré pour ce niveau.
- **Commande** :

```bash
claude --model sonnet --effort high "Ajoute au schéma Prisma de Calepin le modèle CreativeDirection avec titre de travail, prémisse développée, genre dominant, conflit principal, trajectoire du protagoniste, nouveaux enjeux, personnages à introduire, nature de la fin, risques principaux, éléments conservés du texte source, éléments transformés, évaluation du potentiel romanesque, plus l origine proposée modifiée ou rédigée par l utilisateur. Garantis en base qu une seule direction par projet peut être canonique. Génère et applique la migration. Termine par un commit Conventional Commits en anglais."
```

##### CAL-016 · Schéma Prisma — bible, personnages, relations, lieux
- **État** : ✅ **Terminé** — commité, revu dans `tasks/todo.md`
- **Contenu** : `Bible` (identité et style), `Character` (dix-sept champs de fiche), `Relationship`, `Place`, `WorldRule`, verrouillage par élément.
- **Fini quand** : une fiche personnage complète est persistable, les relations sont bidirectionnelles et typées, chaque élément peut être verrouillé.
- **Modèle** : `opus` (Claude Opus 5) · **Effort** : `xhigh` · **Complexité** : 3/3
- **Pourquoi ce modèle** : c'est le cœur de la mémoire narrative ; le graphe personnages / relations / lieux / règles du monde doit rester interrogeable efficacement pour composer le contexte de chaque génération. Conception structurante à conséquences durables : Opus 5 à `xhigh`.
- **Commande** :

```bash
claude --model opus --effort xhigh --permission-mode plan "ultrathink Conçois le modèle de données de la bible narrative de Calepin : Bible avec identité du roman et section style, Character avec nom, âge, rôle, apparence utile, situation initiale, désir apparent, besoin profond, peur, contradiction, secret, passé, évolution prévue, manière de parler, connaissances détenues et éléments à ne pas modifier, Relationship typée et orientée, Place, WorldRule avec ses limites. Chaque élément doit être verrouillable individuellement pour empêcher toute modification automatique. Optimise pour la lecture sélective lors de la composition du contexte de génération. Écris ton plan dans tasks/todo.md avant d agir. Génère et applique la migration. Termine par un commit Conventional Commits en anglais."
```

##### CAL-017 · Schéma Prisma — chronologie et événements
- **État** : ✅ **Terminé** — commité, revu dans `tasks/todo.md`
- **Contenu** : `TimelineEvent` distinguant antérieur au roman / raconté / prévu, âge des personnages à l'événement, durées entre événements.
- **Fini quand** : une chronologie est reconstituable dans l'ordre, avec calcul automatique de l'âge des personnages présents.
- **Modèle** : `opus` (Claude Opus 5) · **Effort** : `high` · **Complexité** : 3/3
- **Pourquoi ce modèle** : le temps narratif est le piège classique — dates floues, durées relatives, événements sans date absolue mais ordonnés. Modéliser cela sans se rendre incapable de détecter plus tard un âge incompatible demande un raisonnement soigné. Opus 5 est le bon niveau ; Sonnet 5 tend à modéliser une simple date et à perdre l'ordonnancement relatif.
- **Commande** :

```bash
claude --model opus --effort high --permission-mode plan "Conçois le modèle de chronologie de Calepin : TimelineEvent avec catégorie antérieur au roman, raconté ou prévu, datation qui accepte à la fois une date absolue et un ordonnancement relatif avec durée depuis un autre événement, personnages présents et calcul de leur âge à cet instant. La structure doit permettre plus tard de détecter un âge incompatible ou une durée incohérente. Écris ton plan dans tasks/todo.md avant d agir. Génère et applique la migration avec les tests. Termine par un commit Conventional Commits en anglais."
```

##### CAL-018 · Schéma Prisma — faits canoniques
- **État** : ✅ **Terminé** — commité, revu dans `tasks/todo.md`
- **Contenu** : `CanonFact` atomique, portée temporelle (permanent / vrai pendant une période / faux après un événement), connaissance par personnage, verrou, source.
- **Fini quand** : les trois exemples du cahier des charges sont représentables, y compris « Nora ignore que son père est encore vivant ».
- **Modèle** : `fable` (Claude Fable 5) · **Effort** : `xhigh` · **Complexité** : 3/3
- **Pourquoi ce modèle** : c'est le point le plus subtil de tout le produit. Un fait canonique porte une valeur de vérité **dans le monde**, une valeur de vérité **dans la connaissance de chaque personnage**, et une **validité temporelle** — trois dimensions orthogonales dont dépendent ensuite la détection de contradictions et la composition du contexte. La documentation officielle décrit Fable 5 comme le modèle qui enquête avant d'agir et vérifie son travail, sur des problèmes qu'on découperait normalement en morceaux. Une erreur de modélisation ici rend l'epic E13 impossible à écrire correctement.
- **Commande** :

```bash
claude --model fable --effort xhigh --permission-mode plan --max-budget-usd 10 "ultrathink Conçois le modèle des faits canoniques de Calepin. Un fait est atomique et doit porter trois dimensions indépendantes : sa valeur de vérité dans le monde du roman, sa validité temporelle avec les cas permanent, vrai pendant une période et faux après un événement donné, et la connaissance qu en a chaque personnage. Le modèle doit rendre représentables les exemples suivants : la maison ne possède pas de cave, Nora ignore que son père est encore vivant, l accident s est produit en novembre 1998. Chaque fait porte sa source, son statut et un verrou empêchant toute modification automatique. Ce modèle conditionne la détection de contradictions et la composition du contexte de génération : conçois-le pour ces usages. Écris ton plan dans tasks/todo.md avant d agir. Génère la migration et les tests couvrant les trois exemples. Termine par un commit Conventional Commits en anglais."
```

##### CAL-019 · Schéma Prisma — parties, plans de chapitre, chapitres, versions
- **État** : ✅ **Terminé** — commité, revu dans `tasks/todo.md`
- **Contenu** : `Part`, `ChapterPlan` (seize attributs), `Chapter`, `ChapterVersion`, statuts de chapitre, ordonnancement stable.
- **Fini quand** : réordonner, fusionner ou scinder un chapitre ne casse pas les références ; chaque génération crée une version distincte.
- **Modèle** : `opus` (Claude Opus 5) · **Effort** : `xhigh` · **Complexité** : 3/3
- **Pourquoi ce modèle** : l'ordonnancement stable sous insertion, fusion et scission est un problème classique où une modélisation naïve par entier se paie immédiatement. S'y ajoute le versionnement non destructif exigé par le cahier des charges. Codage complexe mais spécifié : Opus 5, `xhigh`.
- **Commande** :

```bash
claude --model opus --effort xhigh --permission-mode plan "ultrathink Conçois le modèle de plan et de manuscrit de Calepin : Part avec objectif dramatique, état initial, basculement, état final et fils narratifs concernés ; ChapterPlan avec numéro, titre provisoire, longueur cible, personnage focal, lieu, période, fonction dramatique, objectif immédiat, obstacle, décision, révélation éventuelle, conséquence, personnages présents, faits canoniques concernés, fils narratifs ouverts poursuivis ou fermés, résumé détaillé ; Chapter avec statut parmi planifié, à rédiger, génération en cours, premier jet, à corriger, validé, verrouillé ; ChapterVersion non destructive. L ordonnancement doit rester stable sous insertion, déplacement, fusion et scission sans casser les références. Écris ton plan dans tasks/todo.md avant d agir. Génère la migration et les tests d ordonnancement. Termine par un commit Conventional Commits en anglais."
```

##### CAL-020 · Schéma Prisma — fils narratifs
- **État** : ✅ **Terminé** — commité, revu dans `tasks/todo.md`
- **Contenu** : `Thread` avec état ouvert / poursuivi / fermé, rattachement aux chapitres, promesse narrative associée.
- **Fini quand** : on peut lister à tout moment les fils ouverts et le chapitre où chacun a été ouvert.
- **Modèle** : `sonnet` (Claude Sonnet 5) · **Effort** : `high` · **Complexité** : 2/3
- **Pourquoi ce modèle** : structure de graphe simple une fois CAL-019 posé, dont la difficulté a déjà été absorbée par les tâches précédentes.
- **Commande** :

```bash
claude --model sonnet --effort high "Ajoute au schéma Prisma de Calepin le modèle Thread des fils narratifs : libellé, promesse narrative associée, chapitre d ouverture, chapitres de poursuite, chapitre de fermeture, état ouvert poursuivi ou fermé. Ajoute une requête qui liste à tout instant les fils encore ouverts avec leur chapitre d origine. Génère la migration et les tests. Termine par un commit Conventional Commits en anglais."
```

##### CAL-021 · Schéma Prisma — générations, problèmes qualité, exports, publications
- **État** : ✅ **Terminé** — commité, revu dans `tasks/todo.md`
- **Contenu** : `Generation` (tâche, modèle, jetons, coût, tentatives, statut), `QualityIssue` (catégorie, gravité, passages, statut), `Export`, `Publication`.
- **Fini quand** : une génération échouée est rejouable depuis sa trace ; un problème qualité porte les cinq statuts du cahier des charges.
- **Modèle** : `opus` (Claude Opus 5) · **Effort** : `high` · **Complexité** : 2/3
- **Pourquoi ce modèle** : ces tables sont la colonne vertébrale de l'observabilité et de la reprise après erreur ; leur conception détermine ce qu'on pourra mesurer (indicateurs de la section 17 du cahier des charges). Opus 5 anticipe mieux ces besoins d'exploitation que Sonnet 5.
- **Commande** :

```bash
claude --model opus --effort high "Ajoute au schéma Prisma de Calepin les modèles d exploitation : Generation avec type de tâche, modèle utilisé, jetons entrée et sortie, coût estimé, nombre de tentatives, durée, statut et charge utile de reprise ; QualityIssue avec catégorie continuité factuelle psychologique structure style ou originalité, gravité, explication, passages concernés, proposition de correction et statut parmi détecté accepté à corriger corrigé ignoré ; Export ; Publication. Conçois Generation pour que les indicateurs de la section 17 du cahier des charges soient calculables et qu une génération échouée soit rejouable depuis sa trace. Génère la migration. Termine par un commit Conventional Commits en anglais."
```

##### CAL-022 · Champs d'audit génériques et traçabilité
- **État** : ✅ **Terminé** — commité, revu dans `tasks/todo.md`
- **Contenu** : identifiant, date de création, date de modification, auteur de la modification, statut, numéro de version sur chaque entité importante ; extension Prisma qui les renseigne.
- **Fini quand** : aucune entité importante ne peut être écrite sans auteur de modification ; un test le garantit.
- **Modèle** : `opus` (Claude Opus 5) · **Effort** : `high` · **Complexité** : 2/3
- **Pourquoi ce modèle** : exigence transverse de la section 7 du cahier des charges, qui touche toutes les tables à la fois. La difficulté est la couverture exhaustive, pas la logique unitaire ; Opus 5 tient mieux ce type de balayage complet.
- **Commande** :

```bash
claude --model opus --effort high "Généralise la traçabilité dans Calepin : chaque entité importante doit porter identifiant, date de création, date de modification, auteur de la modification, statut, et numéro de version là où c est nécessaire. Implémente une extension Prisma qui renseigne automatiquement ces champs à partir du contexte de requête. Ajoute un test qui échoue si une entité importante est écrite sans auteur de modification. Termine par un commit Conventional Commits en anglais."
```

##### CAL-023 · Politique d'accès par propriétaire dans la couche d'accès aux données
- **État** : ✅ **Terminé** — commité, revu dans `tasks/todo.md`
- **Contenu** : toute lecture et écriture passe par un dépôt qui exige l'identifiant du propriétaire ; interdiction des appels Prisma directs depuis les routes.
- **Fini quand** : un test tente d'accéder au projet d'un autre utilisateur par tous les points d'entrée et échoue partout.
- **Modèle** : `opus` (Claude Opus 5) · **Effort** : `xhigh` · **Complexité** : 3/3
- **Pourquoi ce modèle** : c'est un critère d'acceptation explicite du MVP et une faille classique où une seule route oubliée suffit. La tâche demande d'auditer tous les points d'entrée existants et futurs. Opus 5 à `xhigh` — et non Fable 5, dont les classifieurs de sûreté peuvent déclencher un repli automatique sur les formulations orientées sécurité.
- **Commande** :

```bash
claude --model opus --effort xhigh --permission-mode plan "ultrathink Mets en place la politique d accès par propriétaire de Calepin. Toute lecture et écriture de données de projet doit passer par une couche de dépôt qui exige explicitement l identifiant du propriétaire ; les appels Prisma directs depuis les routes et les actions serveur doivent être interdits par une règle de lint. Écris une suite de tests qui, pour chaque point d entrée exposé, tente d accéder au projet d un autre utilisateur et vérifie l échec. Écris ton plan dans tasks/todo.md avant d agir. Termine par un commit Conventional Commits en anglais."
```

---

### E02 — Authentification et comptes *(Phase 1)*

##### CAL-024 · Socle d'authentification et session
- **État** : ✅ **Terminé** — commité, revu dans `tasks/todo.md`
- **Contenu** : Auth.js, adaptateur Prisma, session serveur, helper `getCurrentUser` typé.
- **Fini quand** : une session persiste entre deux rechargements et est lisible côté serveur et côté client.
- **Modèle** : `opus` (Claude Opus 5) · **Effort** : `high` · **Complexité** : 2/3
- **Pourquoi ce modèle** : l'intégration Auth.js avec l'App Router a beaucoup évolué en 2025-2026 ; c'est précisément le terrain où la date de connaissance de mai 2026 d'Opus 5 fait une différence mesurable face à Sonnet 5 (janvier 2026) et surtout Haiku 4.5 (février 2025).
- **Commande** :

```bash
claude --model opus --effort high "Mets en place le socle d authentification de Calepin avec Auth.js et l adaptateur Prisma : session serveur, helper getCurrentUser typé utilisable dans les composants serveur et les actions, rafraîchissement et expiration. Vérifie qu une session persiste entre deux rechargements. Termine par un commit Conventional Commits en anglais."
```

##### CAL-025 · Connexion par lien envoyé par courriel
- **État** : ✅ **Terminé** — commité, revu dans `tasks/todo.md`
- **Contenu** : fournisseur e-mail, gabarit de message en français, expiration du lien, limitation de fréquence.
- **Fini quand** : un lien reçu connecte l'utilisateur, expire après usage et après délai, et ne peut être demandé plus de N fois par heure.
- **Modèle** : `sonnet` (Claude Sonnet 5) · **Effort** : `high` · **Complexité** : 2/3
- **Pourquoi ce modèle** : chemin balisé une fois CAL-024 posé ; l'essentiel du travail est du câblage et de la rédaction de gabarit. Sonnet 5 est le bon compromis.
- **Commande** :

```bash
claude --model sonnet --effort high "Ajoute à Calepin la connexion par lien envoyé par courriel : fournisseur e-mail Auth.js, gabarit de message en français sobre, expiration du lien après usage unique et après quinze minutes, limitation à cinq demandes par heure et par adresse. Ajoute les tests d intégration. Termine par un commit Conventional Commits en anglais."
```

##### CAL-026 · Connexion Google
- **État** : ✅ **Terminé** — commité, revu dans `tasks/todo.md`
- **Contenu** : fournisseur OAuth Google, rattachement au compte existant par courriel vérifié.
- **Fini quand** : un utilisateur déjà inscrit par courriel se connecte par Google sans créer de doublon.
- **Modèle** : `sonnet` (Claude Sonnet 5) · **Effort** : `high` · **Complexité** : 2/3
- **Pourquoi ce modèle** : configuration standard ; le seul point délicat, le rattachement de comptes, est un patron documenté que Sonnet 5 maîtrise.
- **Commande** :

```bash
claude --model sonnet --effort high "Ajoute à Calepin la connexion Google via Auth.js, avec rattachement au compte existant lorsque l adresse électronique est vérifiée et identique, sans créer de doublon. Documente les variables d environnement nécessaires dans .env.example. Ajoute un test de rattachement. Termine par un commit Conventional Commits en anglais."
```

##### CAL-027 · Connexion GitHub
- **État** : ✅ **Terminé** — commité, revu dans `tasks/todo.md`
- **Contenu** : fournisseur OAuth GitHub, même règle de rattachement.
- **Fini quand** : les trois méthodes de connexion mènent au même compte pour une même adresse vérifiée.
- **Modèle** : `haiku` (Claude Haiku 4.5) · **Effort** : *n/a* · **Complexité** : 1/3
- **Pourquoi ce modèle** : réplication quasi littérale de CAL-026, déjà présent dans le dépôt et donc fourni par le contexte plutôt que par la mémoire du modèle. C'est le cas idéal pour Haiku 4.5 : rapide, à un cinquième du prix d'Opus 5, sans dépendance à des connaissances postérieures à février 2025 puisque le patron est sous ses yeux. **Pas de `--effort` : Haiku 4.5 ne le prend pas en charge.**
- **Commande** :

```bash
claude --model haiku "Ajoute à Calepin la connexion GitHub via Auth.js en répliquant exactement le patron déjà implémenté pour Google, y compris la règle de rattachement par adresse vérifiée et le test correspondant. Ne réinvente pas la structure : suis le fichier Google existant. Termine par un commit Conventional Commits en anglais."
```

##### CAL-028 · Écrans de connexion et d'inscription
- **État** : ✅ **Terminé** — commité, revu dans `tasks/todo.md`
- **Contenu** : page unique avec les trois méthodes, états de chargement, erreurs lisibles, page de vérification du courriel.
- **Fini quand** : les écrans sont navigables au clavier, les champs sont associés à leurs intitulés, les erreurs sont annoncées aux lecteurs d'écran.
- **Modèle** : `sonnet` (Claude Sonnet 5) · **Effort** : `high` · **Complexité** : 2/3
- **Pourquoi ce modèle** : interface classique avec exigences d'accessibilité explicites mais standard. Sonnet 5 est le cheval de trait attendu sur ce type d'écran.
- **Commande** :

```bash
claude --model sonnet --effort high "Crée les écrans de connexion et d inscription de Calepin : page unique proposant lien par courriel, Google et GitHub, états de chargement, messages d erreur lisibles en français, page de confirmation d envoi du lien. Exigences d accessibilité : navigation complète au clavier, champs associés à leurs intitulés, erreurs annoncées aux lecteurs d écran, aucune information portée par la seule couleur. Termine par un commit Conventional Commits en anglais."
```

##### CAL-029 · Page de compte
- **État** : ✅ **Terminé** — commité, revu dans `tasks/todo.md`
- **Contenu** : affichage de l'adresse, méthodes liées, déconnexion, point d'entrée vers la suppression de compte.
- **Fini quand** : la page affiche les données réelles et la déconnexion invalide la session.
- **Modèle** : `haiku` (Claude Haiku 4.5) · **Effort** : *n/a* · **Complexité** : 1/3
- **Pourquoi ce modèle** : écran de lecture simple s'appuyant sur des composants et des helpers déjà écrits. Aucune décision de conception, aucune dépendance à des API récentes non présentes dans le dépôt. **Pas de `--effort`.**
- **Commande** :

```bash
claude --model haiku "Crée la page de compte de Calepin : adresse électronique, méthodes de connexion liées, bouton de déconnexion qui invalide la session, lien vers la suppression de compte. Réutilise strictement les composants d interface et les helpers de session déjà présents dans le dépôt. Termine par un commit Conventional Commits en anglais."
```

##### CAL-030 · Protection des routes et redirection
- **État** : ✅ **Terminé** — commité, revu dans `tasks/todo.md`
- **Contenu** : middleware, routes publiques déclarées, redirection vers la page demandée après connexion.
- **Fini quand** : aucune route de projet n'est atteignable sans session ; la redirection post-connexion préserve la destination initiale.
- **Modèle** : `sonnet` (Claude Sonnet 5) · **Effort** : `high` · **Complexité** : 2/3
- **Pourquoi ce modèle** : logique bien délimitée, testable, sans ambiguïté de conception.
- **Commande** :

```bash
claude --model sonnet --effort high "Ajoute à Calepin la protection des routes : middleware Next.js avec liste explicite des routes publiques, redirection vers la connexion pour toute autre route, puis retour à la destination initiale après connexion. Ajoute les tests end-to-end correspondants. Termine par un commit Conventional Commits en anglais."
```

##### CAL-031 · Suppression de compte et anonymisation
- **État** : ✅ **Terminé** — commité, revu dans `tasks/todo.md`
- **Contenu** : suppression en cascade ou anonymisation selon la politique, confirmation explicite, purge des fichiers S3 associés, journal d'opération.
- **Fini quand** : après suppression, aucune donnée du compte n'est lisible ni par l'API ni en base, et les exports stockés sont purgés.
- **Modèle** : `opus` (Claude Opus 5) · **Effort** : `xhigh` · **Complexité** : 3/3
- **Pourquoi ce modèle** : obligation réglementaire, irréversible, qui traverse la base, le stockage objet et la file de tâches. Une suppression partielle est un défaut de conformité silencieux. Opus 5 à `xhigh` pour la couverture exhaustive des dépendances.
- **Commande** :

```bash
claude --model opus --effort xhigh --permission-mode plan "ultrathink Implémente la suppression de compte de Calepin. Recense d abord toutes les données rattachées à un utilisateur : projets, versions, générations, exports stockés sur S3, publications, tâches en file. Implémente ensuite la suppression avec confirmation explicite par saisie, purge des objets S3, annulation des tâches en file, et journal d opération sans contenu littéraire. Vérifie par un test qu après suppression aucune donnée du compte n est lisible par l API ni présente en base. Écris ton plan dans tasks/todo.md avant d agir. Termine par un commit Conventional Commits en anglais."
```

---

### E03 — Tableau de bord et cycle de vie des projets *(Phase 1)*

##### CAL-032 · Liste des projets
- **État** : ✅ **Terminé** — commité, revu dans `tasks/todo.md`
- **Contenu** : cartes ou tableau affichant titre, statut, date de dernière modification, chapitres prévus, chapitres rédigés, nombre total de mots, étape actuelle.
- **Fini quand** : les sept informations exigées par le cahier des charges sont affichées et exactes.
- **Modèle** : `sonnet` (Claude Sonnet 5) · **Effort** : `high` · **Complexité** : 2/3
- **Pourquoi ce modèle** : écran de listing standard, requête unique, aucune ambiguïté. C'est le profil quotidien pour lequel Sonnet 5 offre le meilleur rapport vitesse/intelligence, à un tarif de sortie trois fois inférieur à Opus 5.
- **Commande** :

```bash
claude --model sonnet --effort high "Crée le tableau de bord de Calepin listant les projets de l utilisateur connecté avec, pour chacun : titre, statut, date de dernière modification, nombre de chapitres prévus, nombre de chapitres rédigés, nombre total de mots, étape actuelle du processus. Requête unique sans N plus un. Ajoute les tests. Termine par un commit Conventional Commits en anglais."
```

##### CAL-033 · Agrégats de projet calculés et maintenus
- **État** : ✅ **Terminé** — commité, revu dans `tasks/todo.md`
- **Contenu** : compteurs dénormalisés (chapitres, mots) maintenus à l'écriture, et non recalculés à chaque affichage.
- **Fini quand** : les compteurs restent exacts après génération, édition manuelle, suppression et restauration de version.
- **Modèle** : `opus` (Claude Opus 5) · **Effort** : `high` · **Complexité** : 2/3
- **Pourquoi ce modèle** : la dénormalisation correcte sous restauration de version est un piège de cohérence — un compteur faux après un retour arrière est un bug difficile à repérer. Opus 5 raisonne mieux sur les invariants croisés que Sonnet 5.
- **Commande** :

```bash
claude --model opus --effort high "Implémente dans Calepin les agrégats de projet maintenus à l écriture : nombre de chapitres rédigés et nombre total de mots, mis à jour lors d une génération, d une édition manuelle, d une suppression de chapitre et d une restauration de version antérieure. Ajoute des tests qui vérifient l exactitude des compteurs après chacune de ces opérations, y compris la restauration. Termine par un commit Conventional Commits en anglais."
```

##### CAL-034 · Machine à états des statuts de projet
- **État** : ✅ **Terminé** — commité, revu dans `tasks/todo.md`
- **Contenu** : les dix statuts du cahier des charges, transitions autorisées, statut dérivé de l'avancement réel.
- **Fini quand** : aucune transition illégale n'est possible par l'API ; le statut reflète toujours l'étape réellement atteinte.
- **Modèle** : `opus` (Claude Opus 5) · **Effort** : `high` · **Complexité** : 3/3
- **Pourquoi ce modèle** : la machine à états pilote toute la navigation du produit et les indicateurs de réussite de la section 17. Les transitions doivent être exhaustives et cohérentes avec neuf étapes de génération progressive. Conception structurante mais spécifiée : Opus 5.
- **Commande** :

```bash
claude --model opus --effort high --permission-mode plan "Implémente la machine à états des projets Calepin. Statuts : brouillon, analyse en cours, direction à choisir, bible à valider, plan en construction, rédaction en cours, révision, terminé, publié, archivé. Définis la table complète des transitions autorisées, dérive le statut de l avancement réel plutôt que d un champ posé à la main, et refuse toute transition illégale au niveau de la couche métier. Écris ton plan dans tasks/todo.md avant d agir. Couvre chaque transition par un test. Termine par un commit Conventional Commits en anglais."
```

##### CAL-035 · Actions sur un projet
- **État** : ✅ **Terminé** — commité, revu dans `tasks/todo.md`
- **Contenu** : ouvrir, renommer, dupliquer, archiver, supprimer, avec confirmations et annulation temporaire.
- **Fini quand** : la duplication copie l'intégralité de l'arbre narratif sans référence croisée vers l'original.
- **Modèle** : `opus` (Claude Opus 5) · **Effort** : `high` · **Complexité** : 2/3
- **Pourquoi ce modèle** : la duplication profonde d'un graphe (bible, personnages, faits, plan, chapitres, versions, fils) avec remappage complet des identifiants est le point dur ; une copie partielle produirait deux projets qui se corrompent mutuellement. Opus 5 pour la rigueur du remappage.
- **Commande** :

```bash
claude --model opus --effort high "Implémente les actions de projet de Calepin : ouvrir, renommer, dupliquer, archiver, supprimer. La duplication doit copier en profondeur l intégralité de l arbre narratif, bible, personnages, relations, lieux, faits canoniques, chronologie, parties, plans de chapitre, chapitres, versions et fils narratifs, en remappant tous les identifiants pour qu aucune référence ne pointe vers le projet d origine. Ajoute un test qui vérifie l absence totale de référence croisée après duplication. Termine par un commit Conventional Commits en anglais."
```

##### CAL-036 · Recherche, tri et filtres du tableau de bord
- **État** : ✅ **Terminé** — commité, revu dans `tasks/todo.md`
- **Contenu** : recherche par titre, tri par date ou avancement, filtre par statut, état conservé dans l'URL.
- **Fini quand** : un lien partagé restitue exactement la même vue filtrée.
- **Modèle** : `sonnet` (Claude Sonnet 5) · **Effort** : `medium` · **Complexité** : 1/3
- **Pourquoi ce modèle** : fonctionnalité répétitive et bien connue. `medium` réduit la dépense de jetons sur un travail qui n'est pas sensible à l'intelligence, ce qui est l'usage officiellement recommandé de ce niveau.
- **Commande** :

```bash
claude --model sonnet --effort medium "Ajoute au tableau de bord de Calepin la recherche par titre, le tri par date de modification ou par avancement, et le filtre par statut. Conserve l état complet dans les paramètres d URL pour qu un lien restitue la même vue. Termine par un commit Conventional Commits en anglais."
```

##### CAL-037 · Fil d'étapes du processus
- **État** : ✅ **Terminé** — commité, revu dans `tasks/todo.md`
- **Contenu** : composant montrant les neuf étapes (analyse, exploration, choix, bible, planification, rédaction, contrôle, révision, export), étape courante, étapes accessibles.
- **Fini quand** : le composant est réutilisé sur toutes les pages de projet et reflète le statut réel.
- **Modèle** : `sonnet` (Claude Sonnet 5) · **Effort** : `high` · **Complexité** : 2/3
- **Pourquoi ce modèle** : composant d'interface avec une logique d'accessibilité d'étape simple, dérivée de la machine à états déjà écrite en CAL-034.
- **Commande** :

```bash
claude --model sonnet --effort high "Crée le composant de fil d étapes de Calepin affichant les neuf étapes du processus : analyse, exploration, choix narratif, création de la bible, planification, rédaction, contrôle, révision, export. Il indique l étape courante, les étapes franchies et les étapes encore inaccessibles, en dérivant tout de la machine à états existante. Rends-le navigable au clavier et compréhensible sans recours à la couleur seule. Termine par un commit Conventional Commits en anglais."
```

##### CAL-038 · États vides et prise en main
- **État** : ✅ **Terminé** — commité, mais **sans section de revue** dans `tasks/todo.md` (dette reprise par CAL-217)
- **Contenu** : écran de premier usage, appel à l'action de création, courte explication du parcours.
- **Fini quand** : un nouvel utilisateur comprend en un écran ce que fait le produit et par où commencer.
- **Modèle** : `haiku` (Claude Haiku 4.5) · **Effort** : *n/a* · **Complexité** : 1/3
- **Pourquoi ce modèle** : composition de composants existants et rédaction de quelques libellés. Aucune logique, aucune dépendance à des API récentes. Haiku 4.5 est le choix économique évident à 1 $ / 5 $ par million de jetons. **Pas de `--effort`.**
- **Commande** :

```bash
claude --model haiku "Crée les états vides de Calepin : écran affiché quand l utilisateur n a aucun projet, avec une phrase expliquant que Calepin transforme une fiction courte en projet de roman structuré, un aperçu en trois lignes du parcours, et un bouton de création. Réutilise strictement les composants d interface existants. Termine par un commit Conventional Commits en anglais."
```

##### CAL-039 · États de chargement et retours immédiats
- **État** : ✅ **Terminé** — commité, revu dans `tasks/todo.md`
- **Contenu** : squelettes de chargement, mises à jour optimistes sur les actions rapides, indicateurs de tâche en cours.
- **Fini quand** : aucune action ne laisse l'interface sans retour visible pendant plus de 200 ms.
- **Modèle** : `sonnet` (Claude Sonnet 5) · **Effort** : `high` · **Complexité** : 2/3
- **Pourquoi ce modèle** : travail d'interface réactif standard mais transverse à plusieurs écrans, ce qui justifie l'effort par défaut plutôt que `medium`.
- **Commande** :

```bash
claude --model sonnet --effort high "Ajoute à Calepin les états de chargement : squelettes sur les listes et les pages de projet, mises à jour optimistes sur renommage et archivage, indicateur persistant pour les tâches de génération en cours. Aucune action ne doit laisser l interface sans retour visible plus de 200 millisecondes. Termine par un commit Conventional Commits en anglais."
```

---

### E04 — Création de projet et texte source *(Phase 1)*

##### CAL-040 · Formulaire de création de projet
- **État** : ✅ **Terminé** — commité, revu dans `tasks/todo.md`
- **Contenu** : parcours en étapes — titre provisoire, texte source, langue, longueur cible, public visé, degré de liberté ; brouillon conservé.
- **Fini quand** : un rechargement en cours de saisie ne perd rien ; la création aboutit à un projet au statut brouillon.
- **Modèle** : `sonnet` (Claude Sonnet 5) · **Effort** : `high` · **Complexité** : 2/3
- **Pourquoi ce modèle** : formulaire multi-étapes avec conservation de brouillon — patron très répandu, entièrement spécifié par le cahier des charges.
- **Commande** :

```bash
claude --model sonnet --effort high "Crée le formulaire de création de projet de Calepin en étapes : titre provisoire, texte source, langue du texte, longueur souhaitée, public visé, degré de liberté laissé à l intelligence artificielle. Conserve un brouillon local pour qu un rechargement en cours de saisie ne perde rien. La création aboutit à un projet au statut brouillon. Ajoute les tests end-to-end. Termine par un commit Conventional Commits en anglais."
```

##### CAL-041 · Compteur de mots en temps réel et limite de 2 000 mots
- **État** : ✅ **Terminé** — commité, revu dans `tasks/todo.md`
- **Contenu** : comptage identique côté client et côté serveur, avertissement progressif, refus explicite au-delà de la limite.
- **Fini quand** : un texte de 2 001 mots est refusé avec un message explicite, et le comptage client et serveur ne divergent jamais.
- **Modèle** : `opus` (Claude Opus 5) · **Effort** : `high` · **Complexité** : 2/3
- **Pourquoi ce modèle** : c'est un critère d'acceptation formel du MVP, et le comptage de mots est un faux problème simple — apostrophes, tirets, dialogues, ponctuation française, espaces insécables produisent des divergences client/serveur si la règle n'est pas unique et testée. Opus 5 anticipe ces cas ; Sonnet 5 tend à écrire deux implémentations divergentes.
- **Commande** :

```bash
claude --model opus --effort high "Implémente le comptage de mots de Calepin comme une fonction unique partagée entre client et serveur, robuste aux spécificités du français : apostrophes, tirets de dialogue, guillemets français, espaces insécables, points de suspension. Affiche le compteur en temps réel avec avertissement progressif, et refuse tout texte de plus de 2000 mots avec un message explicite. Ajoute une suite de tests couvrant ces cas et vérifiant que client et serveur ne divergent jamais. Termine par un commit Conventional Commits en anglais."
```

##### CAL-042 · Langue du texte et propagation
- **État** : ✅ **Terminé** — commité, revu dans `tasks/todo.md`
- **Contenu** : détection proposée, sélection manuelle prioritaire, propagation de la langue à toutes les générations.
- **Fini quand** : la langue choisie est transmise à chaque appel de génération et respectée dans les sorties.
- **Modèle** : `sonnet` (Claude Sonnet 5) · **Effort** : `high` · **Complexité** : 2/3
- **Pourquoi ce modèle** : logique de propagation simple, testable directement ; la détection s'appuie sur une bibliothèque existante.
- **Commande** :

```bash
claude --model sonnet --effort high "Ajoute à Calepin la gestion de la langue du texte source : détection automatique proposée à la création, sélection manuelle qui prévaut toujours, propagation de la langue retenue à toutes les générations ultérieures via le contexte de génération. Ajoute un test vérifiant que la langue est présente dans le contexte transmis. Termine par un commit Conventional Commits en anglais."
```

##### CAL-043 · Choix de la longueur cible
- **État** : ✅ **Terminé** — commité, revu dans `tasks/todo.md`
- **Contenu** : roman court 30–45 k, standard 50–80 k, long 80–110 k, personnalisé ; conséquence sur le nombre de chapitres estimé.
- **Fini quand** : le choix influence réellement le plan généré et la longueur cible des chapitres.
- **Modèle** : `sonnet` (Claude Sonnet 5) · **Effort** : `high` · **Complexité** : 2/3
- **Pourquoi ce modèle** : mapping de valeurs vers des paramètres de génération, avec une règle de calcul simple à écrire et à tester.
- **Commande** :

```bash
claude --model sonnet --effort high "Ajoute à Calepin le choix de longueur cible du roman : roman court 30000 à 45000 mots, roman standard 50000 à 80000, roman long 80000 à 110000, ou longueur personnalisée avec bornes de validation. Dérive de ce choix une estimation du nombre de chapitres et une longueur cible par chapitre, exposées dans le contexte de génération du plan. Ajoute les tests. Termine par un commit Conventional Commits en anglais."
```

##### CAL-044 · Degré de liberté laissé à l'intelligence artificielle
- **État** : ✅ **Terminé** — commité, revu dans `tasks/todo.md`
- **Contenu** : trois niveaux (faible, équilibré, élevé) avec explication courte, traduits en contraintes effectives dans les prompts.
- **Fini quand** : le niveau `faible` produit des directions mesurablement plus proches du texte source que le niveau `élevé`.
- **Modèle** : `opus` (Claude Opus 5) · **Effort** : `xhigh` · **Complexité** : 3/3
- **Pourquoi ce modèle** : ce réglage n'a de valeur que s'il a un effet réel — traduire « faible / équilibré / élevé » en contraintes de prompt qui changent effectivement les sorties relève de la conception d'instructions, pas du câblage. Opus 5 est le modèle de conception de prompts recommandé pour le travail agentique complexe, et `xhigh` se justifie parce que la tâche exige de raisonner sur l'effet des consignes, pas seulement de les écrire.
- **Commande** :

```bash
claude --model opus --effort xhigh --permission-mode plan "ultrathink Implémente le degré de liberté de Calepin avec trois niveaux : faible pour un développement très fidèle au texte initial, équilibré pour la conservation du noyau avec ajouts significatifs, élevé pour une réinterprétation autorisée tant que les thèmes essentiels sont conservés. Traduis chaque niveau en contraintes explicites et vérifiables injectées dans les prompts d analyse, de direction, de bible et de plan. Ajoute pour chaque niveau une courte explication affichée à l utilisateur en vocabulaire littéraire accessible. Écris ton plan dans tasks/todo.md avant d agir. Termine par un commit Conventional Commits en anglais."
```

##### CAL-045 · Public visé
- **État** : ✅ **Terminé** — commité, revu dans `tasks/todo.md`
- **Contenu** : sélection du lectorat cible, propagation aux prompts, incidence sur le niveau de langue de la bible.
- **Fini quand** : le public visé apparaît dans la section style de la bible générée.
- **Modèle** : `sonnet` (Claude Sonnet 5) · **Effort** : `high` · **Complexité** : 1/3
- **Pourquoi ce modèle** : extension du patron de propagation posé en CAL-042 ; travail dérivé, sans conception nouvelle.
- **Commande** :

```bash
claude --model sonnet --effort high "Ajoute à Calepin la sélection du public visé du roman, avec une liste courte et une option libre, propagée au contexte de génération et reprise dans la section style de la bible. Réutilise le mécanisme de propagation déjà en place pour la langue. Termine par un commit Conventional Commits en anglais."
```

##### CAL-046 · Édition ultérieure du texte source et versionnement
- **État** : ✅ **Terminé** — commité, revu dans `tasks/todo.md`
- **Contenu** : modification du texte source après création, nouvelle version, avertissement sur l'invalidation possible de l'analyse.
- **Fini quand** : modifier le texte source crée une version et signale explicitement quelles étapes en aval deviennent obsolètes.
- **Modèle** : `opus` (Claude Opus 5) · **Effort** : `high` · **Complexité** : 3/3
- **Pourquoi ce modèle** : la propagation d'obsolescence en aval — analyse, direction, bible, plan, chapitres — est une logique de dépendances qu'il faut concevoir, pas seulement coder. C'est aussi le premier endroit où le principe de traçabilité du cahier des charges se matérialise. Opus 5.
- **Commande** :

```bash
claude --model opus --effort high --permission-mode plan "Implémente dans Calepin l édition du texte source après création. Chaque modification crée une nouvelle version conservée. Implémente ensuite la propagation d obsolescence : détermine et affiche quelles étapes en aval, analyse, direction, bible, plan, chapitres, deviennent potentiellement obsolètes, sans jamais les supprimer ni les régénérer automatiquement. Écris ton plan dans tasks/todo.md avant d agir. Ajoute les tests. Termine par un commit Conventional Commits en anglais."
```

##### CAL-047 · Import du texte source depuis un fichier
- **État** : ✅ **Terminé** — commité, revu dans `tasks/todo.md`
- **Contenu** : import `.txt`, `.md`, `.docx`, nettoyage des artefacts de mise en forme, contrôle de la limite de mots.
- **Fini quand** : un `.docx` de nouvelle importe proprement, sans balises résiduelles ni doubles espaces.
- **Modèle** : `sonnet` (Claude Sonnet 5) · **Effort** : `high` · **Complexité** : 2/3
- **Pourquoi ce modèle** : extraction via bibliothèque, plus une passe de nettoyage. Travail concret et vérifiable, sans décision d'architecture.
- **Commande** :

```bash
claude --model sonnet --effort high "Ajoute à Calepin l import du texte source depuis un fichier txt, md ou docx : extraction du texte, nettoyage des artefacts de mise en forme, normalisation des espaces et des tirets de dialogue français, contrôle de la limite de 2000 mots avant enregistrement. Ajoute des tests avec des fichiers d exemple. Termine par un commit Conventional Commits en anglais."
```

---

### E05 — Couche d'intelligence artificielle : abstraction, schémas, contexte, coûts *(Phase 2)*

##### CAL-048 · Interface d'abstraction des fournisseurs de modèles
- **État** : ✅ **Terminé** — commité, revu dans `tasks/todo.md`
- **Contenu** : port unique (`generateStructured`, `generateProse`), types de capacités, gestion des limites de débit, expiration, annulation.
- **Fini quand** : aucun code métier n'importe directement un SDK de fournisseur ; une règle de lint le garantit.
- **Modèle** : `fable` (Claude Fable 5) · **Effort** : `xhigh` · **Complexité** : 3/3
- **Pourquoi ce modèle** : le cahier des charges pose l'indépendance vis-à-vis d'un fournisseur unique comme un risque majeur, et cette interface est le point où cette indépendance se gagne ou se perd définitivement. Le problème est ambigu — il faut anticiper des capacités hétérogènes (sorties structurées, raisonnement, fenêtres de contexte différentes) sans sur-abstraire. La documentation officielle recommande Fable 5 pour les décisions d'architecture et pour les travaux qu'on découperait normalement en plusieurs morceaux. Budget plafonné.
- **Commande** :

```bash
claude --model fable --effort xhigh --permission-mode plan --max-budget-usd 12 "ultrathink Conçois et implémente la couche d abstraction des fournisseurs de modèles de Calepin. Elle doit exposer un port unique offrant génération de sortie structurée validée par schéma et génération de prose, avec description explicite des capacités de chaque modèle, gestion des limites de débit, expiration, annulation propre et repli sur un modèle de secours. Elle doit permettre de changer de modèle par tâche sans toucher au code métier, et rester juste : ne sur-abstrais pas ce qui n a qu une seule implémentation plausible. Interdis par une règle de lint tout import direct d un SDK de fournisseur hors de cette couche. Écris ton plan dans tasks/todo.md avant d agir. Termine par un commit Conventional Commits en anglais."
```

##### CAL-049 · Adaptateur du fournisseur principal
- **État** : 🟡 **Partiel** — adaptateur écrit et testé, mais **aucun processus ne compose de `ModelProviderPort`** (composition livrée par CAL-208)
- **Contenu** : implémentation du port, gestion des sorties structurées natives, flux, décompte des jetons.
- **Fini quand** : les deux méthodes du port fonctionnent, les jetons consommés sont remontés exactement.
- **Modèle** : `opus` (Claude Opus 5) · **Effort** : `high` · **Complexité** : 2/3
- **Pourquoi ce modèle** : implémentation d'API dont la surface a évolué récemment. La date de connaissance de mai 2026 d'Opus 5 est ici un avantage direct sur Sonnet 5 et Fable 5, arrêtés en janvier 2026.
- **Commande** :

```bash
claude --model opus --effort high "Implémente l adaptateur du fournisseur principal derrière le port d abstraction de Calepin : sorties structurées validées par schéma, génération de prose en flux, remontée exacte des jetons d entrée et de sortie, gestion des erreurs de limite de débit avec réessai exponentiel. Ajoute des tests avec un client simulé. Termine par un commit Conventional Commits en anglais."
```

##### CAL-050 · Adaptateur de repli et bascule automatique
- **État** : 🟡 **Partiel** — adaptateur écrit et testé, mais **aucun processus ne compose de `ModelProviderPort`** (composition livrée par CAL-208)
- **Contenu** : second fournisseur, détection d'indisponibilité, bascule, journalisation de l'événement.
- **Fini quand** : une indisponibilité simulée du fournisseur principal n'interrompt pas une génération en cours.
- **Modèle** : `opus` (Claude Opus 5) · **Effort** : `high` · **Complexité** : 3/3
- **Pourquoi ce modèle** : logique de résilience où l'erreur classique est de basculer trop tôt, trop tard, ou de perdre l'état partiel de la génération. Raisonnement sur les modes de défaillance : Opus 5.
- **Commande** :

```bash
claude --model opus --effort high --permission-mode plan "Implémente dans Calepin l adaptateur de repli et la bascule automatique entre fournisseurs de modèles : détection d indisponibilité distinguant erreur transitoire, limite de débit et panne durable, bascule sans perte de l état partiel de la génération, journalisation de l événement avec le modèle finalement utilisé. Ajoute un test qui simule une panne du fournisseur principal en cours de génération et vérifie que la génération aboutit. Écris ton plan dans tasks/todo.md avant d agir. Termine par un commit Conventional Commits en anglais."
```

##### CAL-051 · Registre des missions et routage des modèles
- **État** : ✅ **Terminé** — commité, revu dans `tasks/todo.md`
- **Contenu** : table associant chaque mission (analyser, proposer des directions, évaluer, créer une fiche, construire un chapitre, rédiger une scène, extraire les faits, contrôler la cohérence, corriger un problème) à un modèle et à des paramètres.
- **Fini quand** : changer le modèle d'une mission se fait dans un seul fichier, sans toucher au code appelant.
- **Modèle** : `opus` (Claude Opus 5) · **Effort** : `xhigh` · **Complexité** : 3/3
- **Pourquoi ce modèle** : c'est la matérialisation du principe 6.2 du cahier des charges — une mission, un traitement, jamais un prompt généraliste unique. Le registre détermine le coût d'exploitation du produit entier. Conception dense et spécifiée : Opus 5, `xhigh`.
- **Commande** :

```bash
claude --model opus --effort xhigh --permission-mode plan "ultrathink Implémente le registre des missions d intelligence artificielle de Calepin. Chaque mission est déclarée séparément : analyser le texte, proposer des directions, évaluer une direction, créer une fiche personnage, construire un plan de chapitre, rédiger une scène, extraire les faits, contrôler la cohérence, corriger un problème ciblé, résumer un chapitre. Chaque entrée porte son modèle, ses paramètres, son schéma de sortie, son budget de contexte et son coût attendu. Aucune mission ne doit être fusionnée dans un prompt généraliste. Changer le modèle d une mission doit se faire dans ce seul fichier. Écris ton plan dans tasks/todo.md avant d agir. Termine par un commit Conventional Commits en anglais."
```

##### CAL-052 · Sorties structurées, validation et réparation
- **État** : ✅ **Terminé** — commité, revu dans `tasks/todo.md`
- **Contenu** : schémas Zod par mission, validation stricte, stratégie de réparation en cas de sortie invalide, échec propre après N tentatives.
- **Fini quand** : une sortie invalide n'écrit jamais en base et déclenche une réparation puis un échec explicite.
- **Modèle** : `opus` (Claude Opus 5) · **Effort** : `xhigh` · **Complexité** : 3/3
- **Pourquoi ce modèle** : c'est la barrière qui protège toutes les données narratives d'une sortie malformée. La stratégie de réparation doit distinguer erreur de forme (réparable) et erreur de fond (non réparable) — un raisonnement que Sonnet 5 simplifie souvent en réessai aveugle.
- **Commande** :

```bash
claude --model opus --effort xhigh --permission-mode plan "ultrathink Implémente dans Calepin la validation des sorties structurées : un schéma Zod par mission, validation stricte avant toute écriture en base, stratégie de réparation qui distingue erreur de forme réparable par une relance ciblée et erreur de fond non réparable, échec propre et explicite après un nombre borné de tentatives, sans jamais écrire de donnée partielle. Journalise le type d échec sans journaliser le contenu littéraire. Écris ton plan dans tasks/todo.md avant d agir. Ajoute les tests couvrant sortie valide, sortie malformée et sortie hors sujet. Termine par un commit Conventional Commits en anglais."
```

##### CAL-053 · Registre des prompts versionnés
- **État** : ✅ **Terminé** — commité, revu dans `tasks/todo.md`
- **Contenu** : prompts stockés comme ressources versionnées, identifiant de version enregistré dans chaque génération, possibilité de comparer deux versions de prompt.
- **Fini quand** : toute génération enregistre la version exacte du prompt qui l'a produite.
- **Modèle** : `opus` (Claude Opus 5) · **Effort** : `high` · **Complexité** : 2/3
- **Pourquoi ce modèle** : brique d'ingénierie de prompts indispensable pour améliorer la qualité littéraire de façon mesurable. Conception claire, exécution soignée : Opus 5 à effort par défaut.
- **Commande** :

```bash
claude --model opus --effort high "Implémente le registre des prompts de Calepin : chaque prompt est une ressource versionnée avec identifiant, version, mission associée et variables attendues typées. Toute génération enregistre la version exacte du prompt utilisé. Ajoute un outil de comparaison de deux versions d un même prompt. Termine par un commit Conventional Commits en anglais."
```

##### CAL-054 · Composeur de contexte dynamique
- **État** : ✅ **Terminé** — commité, revu dans `tasks/todo.md`
- **Contenu** : construction du contexte à partir des instructions permanentes, de la bible, du plan, des faits concernés, des résumés précédents, des extraits nécessaires et de la demande utilisateur.
- **Fini quand** : le contexte transmis pour rédiger le chapitre 12 ne contient jamais l'intégralité des onze chapitres précédents.
- **Modèle** : `fable` (Claude Fable 5) · **Effort** : `xhigh` · **Complexité** : 3/3
- **Pourquoi ce modèle** : c'est le composant qui décide de la qualité **et** du coût de chaque génération, et le cahier des charges en fait un risque majeur — « une simple fenêtre de contexte ne suffit pas à garantir la cohérence d'un roman ». Le problème est ambigu par nature : quels faits sont pertinents pour ce chapitre, quel extrait antérieur est nécessaire à la continuité, que couper en premier quand le budget est atteint. Fable 5 est le modèle décrit comme enquêtant avant d'agir sur ce type de problème sans bonne réponse connue. Budget plafonné explicitement.
- **Commande** :

```bash
claude --model fable --effort xhigh --permission-mode plan --max-budget-usd 15 "ultrathink Conçois et implémente le composeur de contexte dynamique de Calepin. Pour une mission donnée il assemble : les instructions permanentes, les sections pertinentes de la bible, le plan du chapitre visé, les faits canoniques réellement concernés, les résumés des chapitres précédents, les extraits de texte strictement nécessaires à la continuité, et la demande de l utilisateur. Règle absolue : ne jamais transmettre l intégralité du roman quand ce n est pas nécessaire. Définis une politique de sélection des faits et des extraits, un budget de jetons par mission, et un ordre de dégradation quand le budget est atteint. Ajoute un test vérifiant que le contexte de rédaction du chapitre 12 ne contient pas le texte intégral des onze chapitres précédents. Écris ton plan dans tasks/todo.md avant d agir. Termine par un commit Conventional Commits en anglais."
```

##### CAL-055 · Résumés hiérarchiques des chapitres
- **État** : ✅ **Terminé** — commité, revu dans `tasks/todo.md`
- **Contenu** : résumé court et résumé détaillé par chapitre, résumé de partie, régénérés à la validation.
- **Fini quand** : le contexte long s'appuie sur des résumés et non sur le texte intégral.
- **Modèle** : `opus` (Claude Opus 5) · **Effort** : `high` · **Complexité** : 2/3
- **Pourquoi ce modèle** : mission de compression sémantique dont la qualité conditionne la cohérence à long terme ; le prompt doit préserver les éléments porteurs de conséquence et écarter le décor. Opus 5 conçoit ce type d'instruction avec précision.
- **Commande** :

```bash
claude --model opus --effort high "Implémente dans Calepin les résumés hiérarchiques : à la validation d un chapitre, générer un résumé court d environ cinquante mots et un résumé détaillé d environ deux cents mots, puis mettre à jour le résumé de la partie. Le prompt doit privilégier ce qui porte des conséquences, décisions, révélations, changements d état et de relation, et écarter le décor sans effet narratif. Stocke ces résumés comme entités versionnées et utilise-les dans le composeur de contexte. Termine par un commit Conventional Commits en anglais."
```

##### CAL-056 · Comptabilisation des jetons et estimation de coût
- **État** : ✅ **Terminé** — commité, revu dans `tasks/todo.md`
- **Contenu** : mesure par génération, agrégation par projet et par mission, tarif configurable par modèle.
- **Fini quand** : le coût cumulé d'un projet est consultable et concorde avec la facturation du fournisseur à moins de 5 %.
- **Modèle** : `sonnet` (Claude Sonnet 5) · **Effort** : `high` · **Complexité** : 2/3
- **Pourquoi ce modèle** : comptabilité déterministe une fois les tarifs déclarés ; le travail est de l'agrégation testable, pas du raisonnement.
- **Commande** :

```bash
claude --model sonnet --effort high "Implémente dans Calepin la comptabilisation des jetons et l estimation de coût : mesure des jetons d entrée et de sortie par génération, table de tarifs configurable par modèle, agrégation par projet, par mission et par période. Expose le coût cumulé d un projet. Ajoute des tests d agrégation. Termine par un commit Conventional Commits en anglais."
```

##### CAL-057 · Estimation affichée avant opération coûteuse
- **État** : ✅ **Terminé** — commité, revu dans `tasks/todo.md`
- **Contenu** : estimation de durée et de coût avant génération du plan, d'un chapitre ou d'un audit complet ; confirmation explicite.
- **Fini quand** : aucune opération coûteuse ne démarre sans estimation affichée et confirmation.
- **Modèle** : `opus` (Claude Opus 5) · **Effort** : `high` · **Complexité** : 2/3
- **Pourquoi ce modèle** : le cahier des charges impose que le coût ne soit pas calculé au seul nombre de mots produits, puisque l'analyse et le contrôle consomment aussi. Concevoir une estimation honnête sur cette base demande de modéliser le coût de chaque phase — raisonnement, pas câblage.
- **Commande** :

```bash
claude --model opus --effort high "Implémente dans Calepin l estimation affichée avant toute opération coûteuse : génération du plan, rédaction d un chapitre, audit complet, régénération. L estimation doit intégrer le coût des phases d analyse et de contrôle, et pas seulement le nombre de mots produits. Fonde-la sur les mesures réelles déjà enregistrées pour des opérations comparables, avec repli sur une valeur théorique en l absence d historique. Affiche durée estimée et coût estimé, et exige une confirmation explicite. Termine par un commit Conventional Commits en anglais."
```

##### CAL-058 · Idempotence des générations et absence de double comptage
- **État** : ✅ **Terminé** — commité, revu dans `tasks/todo.md`
- **Contenu** : clé d'idempotence par génération, reprise sans réexécution, garantie qu'un échec système ne débite pas deux fois.
- **Fini quand** : rejouer une génération échouée n'incrémente pas deux fois le coût comptabilisé.
- **Modèle** : `opus` (Claude Opus 5) · **Effort** : `xhigh` · **Complexité** : 3/3
- **Pourquoi ce modèle** : exigence explicite du cahier des charges (« aucune facturation interne ne doit être comptabilisée deux fois si l'échec provient du système »). L'idempotence sous file de tâches, réessai et bascule de fournisseur est un problème de systèmes distribués classique et piégeux. Opus 5 à `xhigh`.
- **Commande** :

```bash
claude --model opus --effort xhigh --permission-mode plan "ultrathink Implémente l idempotence des générations de Calepin : clé d idempotence dérivée de la mission, du projet, de la cible et de la version des entrées ; reprise d une génération interrompue sans réexécution de la partie déjà aboutie ; garantie qu un échec provenant du système ne comptabilise jamais deux fois le coût. Prends en compte les réessais de la file, la bascule de fournisseur et le redémarrage du travailleur. Écris ton plan dans tasks/todo.md avant d agir. Ajoute des tests couvrant réessai, redémarrage en cours de génération et bascule de fournisseur. Termine par un commit Conventional Commits en anglais."
```

##### CAL-059 · Banc d'évaluation des prompts
- **État** : ✅ **Terminé** — commité, revu dans `tasks/todo.md`
- **Contenu** : jeu de textes sources de référence, exécution d'une mission sur tout le jeu, comparaison entre deux versions de prompt, critères notés.
- **Fini quand** : modifier un prompt permet de mesurer l'effet du changement avant de l'adopter.
- **Modèle** : `fable` (Claude Fable 5) · **Effort** : `xhigh` · **Complexité** : 3/3
- **Pourquoi ce modèle** : le cahier des charges identifie la qualité littéraire variable comme un risque majeur et exige de séparer rédaction et critique. Concevoir des critères d'évaluation littéraire qui ne se réduisent pas à un score arbitraire — ce que le document interdit explicitement — est un problème ouvert. C'est le terrain de Fable 5. Budget plafonné.
- **Commande** :

```bash
claude --model fable --effort xhigh --permission-mode plan --max-budget-usd 12 "ultrathink Conçois et implémente le banc d évaluation des prompts de Calepin. Il doit permettre d exécuter une mission sur un jeu de textes sources de référence, de comparer deux versions d un même prompt et de restituer une évaluation argumentée. Contrainte du cahier des charges : ne jamais produire un score arbitraire présenté comme preuve de qualité ou de singularité ; chaque critique doit être argumentée et reliée à des éléments précis du texte évalué. Définis les critères, la procédure de comparaison et le format de restitution. Écris ton plan dans tasks/todo.md avant d agir. Termine par un commit Conventional Commits en anglais."
```

---

### E06 — Orchestration asynchrone et cycle de vie des générations *(Phase 2)*

##### CAL-060 · Socle BullMQ et travailleur
- **État** : ✅ **Terminé** — commité, revu dans `tasks/todo.md`
- **Contenu** : connexion Redis, déclaration des files, processus travailleur séparé, arrêt propre.
- **Fini quand** : une tâche factice est produite, consommée et tracée ; l'arrêt du travailleur ne perd aucune tâche.
- **Modèle** : `opus` (Claude Opus 5) · **Effort** : `high` · **Complexité** : 2/3
- **Pourquoi ce modèle** : la mise en place BullMQ avec arrêt propre et gestion des signaux dépend de versions récentes de la bibliothèque ; la fraîcheur de connaissances d'Opus 5 (mai 2026) évite les API dépréciées que produirait Haiku 4.5 (février 2025).
- **Commande** :

```bash
claude --model opus --effort high "Mets en place le socle de tâches asynchrones de Calepin avec BullMQ et Redis : connexion partagée, déclaration des files, processus travailleur séparé lancé par pnpm worker, arrêt propre sur signal sans perdre de tâche en cours. Ajoute une tâche factice de bout en bout et son test d intégration. Termine par un commit Conventional Commits en anglais."
```

##### CAL-061 · Cycle de vie d'une génération
- **État** : ✅ **Terminé** — commité, revu dans `tasks/todo.md`
- **Contenu** : entité `Generation` pilotée par la file — en attente, en cours, réussie, échouée, annulée ; persistance de la charge utile de reprise.
- **Fini quand** : l'état d'une génération est toujours lisible en base, même après redémarrage du travailleur.
- **Modèle** : `opus` (Claude Opus 5) · **Effort** : `xhigh` · **Complexité** : 3/3
- **Pourquoi ce modèle** : la synchronisation entre l'état de la file (volatile, dans Redis) et l'état persistant en base est la source classique d'états fantômes — génération marquée « en cours » pour toujours. Exigence directe du cahier des charges : le projet ne doit jamais être corrompu par un échec. Opus 5 à `xhigh`.
- **Commande** :

```bash
claude --model opus --effort xhigh --permission-mode plan "ultrathink Implémente le cycle de vie des générations de Calepin. L entité Generation en base est la source de vérité : en attente, en cours, réussie, échouée, annulée, avec charge utile de reprise. Synchronise-la avec l état BullMQ de façon à ce qu aucun redémarrage du travailleur, aucune perte de connexion Redis et aucun arrêt brutal ne laisse une génération bloquée en cours. Prévois une tâche de réconciliation périodique. Écris ton plan dans tasks/todo.md avant d agir. Ajoute des tests simulant un redémarrage en cours de génération. Termine par un commit Conventional Commits en anglais."
```

##### CAL-062 · Progression en temps réel
- **État** : ✅ **Terminé** — commité, revu dans `tasks/todo.md`
- **Contenu** : flux d'événements serveur, étapes nommées, pourcentage indicatif, reprise de l'affichage après rechargement.
- **Fini quand** : l'utilisateur peut quitter la page et revenir sans interrompre ni perdre la progression.
- **Modèle** : `sonnet` (Claude Sonnet 5) · **Effort** : `high` · **Complexité** : 2/3
- **Pourquoi ce modèle** : transport d'événements et affichage, patron bien établi ; la partie difficile (état persistant) a été traitée en CAL-061.
- **Commande** :

```bash
claude --model sonnet --effort high "Implémente l affichage de progression des générations de Calepin : flux d événements serveur diffusant les étapes nommées et un pourcentage indicatif, reconnexion automatique, restitution de l état courant au rechargement de la page. L utilisateur doit pouvoir quitter la page sans interrompre la tâche et retrouver la progression en revenant. Ajoute un test end-to-end. Termine par un commit Conventional Commits en anglais."
```

##### CAL-063 · Reprise après échec et rejeu manuel
- **État** : ✅ **Terminé** — commité, revu dans `tasks/todo.md`
- **Contenu** : politique de réessai avec recul exponentiel, distinction erreur transitoire / erreur définitive, bouton de rejeu.
- **Fini quand** : une tâche échouée est rejouable depuis l'interface sans perdre la dernière version valide.
- **Modèle** : `opus` (Claude Opus 5) · **Effort** : `high` · **Complexité** : 2/3
- **Pourquoi ce modèle** : la classification des erreurs conditionne la robustesse perçue du produit ; réessayer une erreur définitive gaspille du budget, abandonner une erreur transitoire dégrade l'expérience. Raisonnement sur les modes de défaillance : Opus 5.
- **Commande** :

```bash
claude --model opus --effort high "Implémente dans Calepin la reprise après échec des générations : classification des erreurs en transitoires, limites de débit et définitives, réessai automatique avec recul exponentiel pour les seules erreurs transitoires, conservation systématique de la dernière version valide, bouton de rejeu manuel dans l interface avec message d erreur compréhensible. Ajoute les tests par classe d erreur. Termine par un commit Conventional Commits en anglais."
```

##### CAL-064 · Annulation d'une génération en cours
- **État** : ✅ **Terminé** — commité, revu dans `tasks/todo.md`
- **Contenu** : annulation depuis l'interface, propagation au travailleur, libération des verrous, absence de comptabilisation partielle abusive.
- **Fini quand** : annuler une rédaction de chapitre laisse le chapitre dans son état antérieur intact.
- **Modèle** : `opus` (Claude Opus 5) · **Effort** : `high` · **Complexité** : 3/3
- **Pourquoi ce modèle** : l'annulation coopérative traversant l'interface, la file, le travailleur et l'appel au fournisseur est un point où les fuites de ressources et les états intermédiaires sont fréquents. Opus 5.
- **Commande** :

```bash
claude --model opus --effort high --permission-mode plan "Implémente l annulation d une génération en cours dans Calepin : demande depuis l interface, propagation jusqu au travailleur et jusqu à l appel au fournisseur de modèle, libération des verrous, aucune écriture partielle en base, comptabilisation uniquement des jetons réellement consommés. Vérifie par un test qu annuler une rédaction de chapitre laisse ce chapitre exactement dans son état antérieur. Écris ton plan dans tasks/todo.md avant d agir. Termine par un commit Conventional Commits en anglais."
```

##### CAL-065 · Limitation de concurrence
- **État** : ✅ **Terminé** — commité, revu dans `tasks/todo.md`
- **Contenu** : plafond de générations simultanées par utilisateur et par projet, file d'attente lisible.
- **Fini quand** : lancer six générations en même temps n'écroule ni la base ni le budget.
- **Modèle** : `sonnet` (Claude Sonnet 5) · **Effort** : `high` · **Complexité** : 2/3
- **Pourquoi ce modèle** : BullMQ fournit les primitives de limitation ; la tâche est de les configurer et de les exposer. Travail de câblage testable.
- **Commande** :

```bash
claude --model sonnet --effort high "Ajoute à Calepin la limitation de concurrence des générations : plafond configurable par utilisateur et par projet en utilisant les limiteurs BullMQ, file d attente visible dans l interface avec la position de chaque tâche. Ajoute les tests de plafonnement. Termine par un commit Conventional Commits en anglais."
```

##### CAL-066 · Files distinctes et priorités par mission
- **État** : ✅ **Terminé** — commité, revu dans `tasks/todo.md`
- **Contenu** : file rapide (extraction, résumé), file lente (rédaction, plan), file d'audit ; priorités et concurrence propres.
- **Fini quand** : une extraction de faits n'attend jamais derrière une génération de plan.
- **Modèle** : `sonnet` (Claude Sonnet 5) · **Effort** : `high` · **Complexité** : 2/3
- **Pourquoi ce modèle** : configuration dérivée du registre des missions déjà écrit en CAL-051 ; aucune décision nouvelle.
- **Commande** :

```bash
claude --model sonnet --effort high "Sépare les files de tâches de Calepin par profil de mission : une file rapide pour extraction de faits et résumés, une file lente pour rédaction et génération de plan, une file d audit. Attribue à chacune sa concurrence et sa priorité en te fondant sur le registre des missions existant. Vérifie par un test qu une extraction de faits ne reste pas bloquée derrière une génération de plan. Termine par un commit Conventional Commits en anglais."
```

##### CAL-067 · Verrou d'écriture par cible
- **État** : ✅ **Terminé** — commité, revu dans `tasks/todo.md`
- **Contenu** : verrou empêchant deux générations simultanées sur le même chapitre, la même bible ou le même plan.
- **Fini quand** : deux demandes concurrentes sur le même chapitre produisent une file, jamais un écrasement.
- **Modèle** : `opus` (Claude Opus 5) · **Effort** : `high` · **Complexité** : 3/3
- **Pourquoi ce modèle** : condition de concurrence classique aux conséquences graves (perte de texte utilisateur). Le cahier des charges exige qu'aucune génération n'écrase un texte non sauvegardé. Opus 5.
- **Commande** :

```bash
claude --model opus --effort high --permission-mode plan "Implémente dans Calepin un verrou d écriture par cible narrative : deux générations ne peuvent jamais s exécuter simultanément sur le même chapitre, la même bible ou le même plan. Le verrou doit expirer automatiquement si le travailleur meurt, et une demande concurrente doit être mise en attente et non refusée silencieusement. Garantis qu aucune génération n écrase un texte non sauvegardé. Écris ton plan dans tasks/todo.md avant d agir. Ajoute un test de concurrence. Termine par un commit Conventional Commits en anglais."
```

##### CAL-068 · Vue d'exploitation des tâches
- **État** : ✅ **Terminé** — commité, revu dans `tasks/todo.md`
- **Contenu** : page listant les générations récentes avec statut, durée, modèle, jetons, coût, tentatives ; rejeu et annulation.
- **Fini quand** : la page permet de diagnostiquer un échec sans ouvrir la base.
- **Modèle** : `sonnet` (Claude Sonnet 5) · **Effort** : `high` · **Complexité** : 2/3
- **Pourquoi ce modèle** : écran de listing et d'actions au-dessus de données déjà modélisées.
- **Commande** :

```bash
claude --model sonnet --effort high "Crée dans Calepin la vue d exploitation des générations : liste des générations récentes de l utilisateur avec mission, statut, durée, modèle utilisé, jetons, coût estimé, nombre de tentatives et message d erreur éventuel, plus les actions de rejeu et d annulation. Aucun contenu littéraire ne doit apparaître dans cette vue. Termine par un commit Conventional Commits en anglais."
```

##### CAL-069 · Rétention et nettoyage des tâches terminées
- **État** : ✅ **Terminé** — commité, revu dans `tasks/todo.md`
- **Contenu** : purge des tâches BullMQ terminées, conservation des traces `Generation` en base, tâche planifiée.
- **Fini quand** : Redis ne croît pas indéfiniment et l'historique reste consultable en base.
- **Modèle** : `haiku` (Claude Haiku 4.5) · **Effort** : *n/a* · **Complexité** : 1/3
- **Pourquoi ce modèle** : configuration de rétention et tâche planifiée, entièrement dictée par le prompt et par le code existant. Pas de conception, pas de dépendance à des API récentes hors dépôt. **Pas de `--effort`.**
- **Commande** :

```bash
claude --model haiku "Configure la rétention des tâches de Calepin : purge automatique des tâches BullMQ terminées et échouées au-delà d un seuil configurable, en conservant les traces Generation en base qui restent la source d historique. Ajoute une tâche planifiée de nettoyage. Suis les conventions du dépôt existant. Termine par un commit Conventional Commits en anglais."
```

---

### E07 — Analyse du texte source *(Phase 2)*

##### CAL-070 · Mission d'analyse — prompt et schéma
- **État** : 🟡 **Partiel** — contrat, schéma, vérificateurs et prompt livrés et testés ; **aucun exécuteur ne lance la mission** (débloqué par CAL-208, exécuteur livré par CAL-209)
- **Contenu** : prompt dédié produisant les dix-sept sections du diagnostic, schéma de sortie strict, langue respectée.
- **Fini quand** : l'analyse d'un texte de référence remplit les dix-sept sections sans champ vide injustifié.
- **Modèle** : `fable` (Claude Fable 5) · **Effort** : `xhigh` · **Complexité** : 3/3
- **Pourquoi ce modèle** : c'est la première mission proprement littéraire du produit, et sa qualité conditionne tout l'aval — une analyse plate produit des directions plates et une bible plate. Il faut concevoir un prompt qui fasse émerger ce qui rend un texte singulier, ce qui n'a pas de bonne réponse connue d'avance. La documentation officielle recommande Fable 5 précisément pour les problèmes ambigus, et note qu'il enquête davantage avant d'agir. Budget plafonné.
- **Commande** :

```bash
claude --model fable --effort xhigh --permission-mode plan --max-budget-usd 12 "ultrathink Conçois la mission d analyse du texte source de Calepin : prompt et schéma de sortie strict produisant résumé factuel, prémisse, conflit principal, promesse du récit, thèmes, personnages identifiés, relations, point de vue, temps verbal, tonalité, éléments singuliers, ambiguïtés, questions non résolues, éléments à préserver, fragilités, risques de clichés, potentiel de développement en roman. Le prompt doit chercher ce qui rend le texte singulier plutôt que ce qui le rend classable, et respecter la langue du texte. Éprouve-le sur au moins trois nouvelles courtes de registres différents et itère sur les résultats avant de conclure. Écris ton plan dans tasks/todo.md avant d agir. Termine par un commit Conventional Commits en anglais."
```

##### CAL-071 · Distinction entre fait explicite et interprétation
- **État** : ✅ **Terminé** — commité, revu dans `tasks/todo.md`
- **Contenu** : chaque élément d'analyse porte son marqueur, avec le passage source qui l'appuie quand il est factuel.
- **Fini quand** : un affirmation non appuyée par le texte est systématiquement marquée comme interprétation.
- **Modèle** : `opus` (Claude Opus 5) · **Effort** : `xhigh` · **Complexité** : 3/3
- **Pourquoi ce modèle** : c'est un critère d'acceptation formel du MVP et une exigence d'honnêteté du produit. Faire tenir cette distinction à un modèle demande une conception d'instruction rigoureuse et une validation qui la contrôle vraiment. Opus 5 est le modèle de conception de prompts adapté, à `xhigh` pour la rigueur.
- **Commande** :

```bash
claude --model opus --effort xhigh --permission-mode plan "ultrathink Implémente dans l analyse de Calepin la distinction stricte entre fait explicite et interprétation. Chaque élément produit porte son marqueur ; un élément factuel doit citer le passage du texte source qui l appuie, un élément non appuyé doit obligatoirement être marqué comme interprétation. Renforce le prompt dans ce sens et ajoute une validation post-génération qui reclasse en interprétation tout élément factuel dont la citation est absente du texte source. Ajoute des tests avec des cas limites. Écris ton plan dans tasks/todo.md avant d agir. Termine par un commit Conventional Commits en anglais."
```

##### CAL-072 · Écran de diagnostic narratif
- **État** : ✅ **Terminé** — commité, revu dans `tasks/todo.md`
- **Contenu** : présentation des dix-sept sections, marquage visuel fait/interprétation ne reposant pas sur la seule couleur, explications courtes des notions spécialisées.
- **Fini quand** : un utilisateur non initié comprend « point de vue » et « focalisation » sans quitter la page.
- **Modèle** : `sonnet` (Claude Sonnet 5) · **Effort** : `high` · **Complexité** : 2/3
- **Pourquoi ce modèle** : écran dense mais sans logique complexe ; la matière est déjà produite par les tâches précédentes.
- **Commande** :

```bash
claude --model sonnet --effort high "Crée l écran de diagnostic narratif de Calepin présentant les dix-sept sections de l analyse. Distingue visuellement faits explicites et interprétations sans recourir à la seule couleur, avec libellé et icône. Ajoute une explication courte au survol et au focus clavier pour les notions spécialisées comme point de vue, focalisation, arc dramatique et promesse narrative. Vocabulaire littéraire accessible, aucun jargon technique. Termine par un commit Conventional Commits en anglais."
```

##### CAL-073 · Édition et annotation de l'analyse
- **État** : ✅ **Terminé** — commité, revu dans `tasks/todo.md`
- **Contenu** : modification de chaque section, annotation libre, marquage des modifications manuelles distinct des propositions du modèle.
- **Fini quand** : l'origine de chaque élément — modèle ou utilisateur — reste lisible après édition.
- **Modèle** : `opus` (Claude Opus 5) · **Effort** : `high` · **Complexité** : 2/3
- **Pourquoi ce modèle** : c'est le principe de traçabilité 4.2 du cahier des charges appliqué pour la première fois ; le patron retenu ici sera répliqué sur la bible, le plan et les chapitres. Il vaut d'être conçu correctement une fois.
- **Commande** :

```bash
claude --model opus --effort high --permission-mode plan "Implémente l édition de l analyse de Calepin section par section, avec annotation libre. Établis ici le patron de traçabilité réutilisable dans tout le produit : chaque élément conserve son origine, proposition du modèle, modification manuelle ou élément validé, et cette origine reste lisible après édition. Conçois ce patron pour être réutilisé ensuite sur la bible, le plan et les chapitres. Écris ton plan dans tasks/todo.md avant d agir. Termine par un commit Conventional Commits en anglais."
```

##### CAL-074 · Validation de l'analyse
- **État** : ✅ **Terminé** — commité, revu dans `tasks/todo.md`
- **Contenu** : action de validation explicite, verrouillage de l'analyse validée, transition de statut, passage à l'exploration.
- **Fini quand** : l'étape suivante est inaccessible tant que l'analyse n'est pas validée.
- **Modèle** : `sonnet` (Claude Sonnet 5) · **Effort** : `high` · **Complexité** : 1/3
- **Pourquoi ce modèle** : action métier simple s'appuyant sur la machine à états déjà écrite.
- **Commande** :

```bash
claude --model sonnet --effort high "Implémente la validation de l analyse dans Calepin : action explicite de l utilisateur, création d une version validée, transition du statut de projet vers direction à choisir via la machine à états existante, et blocage de l accès à l étape d exploration tant que l analyse n est pas validée. Ajoute les tests. Termine par un commit Conventional Commits en anglais."
```

##### CAL-075 · Détection des risques de clichés dans le texte source
- **État** : 🟡 **Partiel** — contrat, schéma, vérificateurs et prompt livrés et testés ; **aucun exécuteur ne lance la mission** (débloqué par CAL-208, exécuteur livré par CAL-214)
- **Contenu** : mission dédiée identifiant les éléments convenus, avec justification rattachée à un passage.
- **Fini quand** : chaque cliché signalé cite le passage concerné et explique pourquoi il est convenu.
- **Modèle** : `fable` (Claude Fable 5) · **Effort** : `high` · **Complexité** : 3/3
- **Pourquoi ce modèle** : reconnaître ce qui est convenu suppose une culture littéraire large et un jugement fin ; c'est précisément le profil « spécialiste ayant vu des problèmes que presque personne n'a vus » pour lequel Fable 5 est positionné. Le cahier des charges interdit par ailleurs le score arbitraire, ce qui exige une critique argumentée. Effort `high` — le raisonnement de Fable 5 étant toujours actif, `xhigh` n'est pas nécessaire sur une mission de ce périmètre.
- **Commande** :

```bash
claude --model fable --effort high --max-budget-usd 8 "Conçois la mission de détection des risques de clichés de Calepin. Elle identifie dans le texte source les éléments convenus, situations, personnages, formules et retournements, et pour chacun cite le passage concerné et explique pourquoi il est convenu et ce qu il empêche. Interdiction formelle de produire un score de banalité ou d originalité : chaque remarque doit être argumentée et rattachée à un élément précis du texte. Éprouve la mission sur des textes volontairement convenus et sur des textes singuliers. Termine par un commit Conventional Commits en anglais."
```

##### CAL-076 · Évaluation du potentiel de développement en roman
- **État** : 🟡 **Partiel** — contrat, schéma, vérificateurs et prompt livrés et testés ; **aucun exécuteur ne lance la mission** (débloqué par CAL-208, exécuteur livré par CAL-214)
- **Contenu** : appréciation argumentée de ce que le texte peut soutenir sur 50 000 mots, et de ce qui manque.
- **Fini quand** : l'évaluation nomme au moins trois éléments à développer et deux fragilités à traiter.
- **Modèle** : `fable` (Claude Fable 5) · **Effort** : `high` · **Complexité** : 3/3
- **Pourquoi ce modèle** : jugement éditorial ouvert, sans réponse vérifiable — le cas où la profondeur d'analyse du modèle se voit directement dans la valeur perçue du produit.
- **Commande** :

```bash
claude --model fable --effort high --max-budget-usd 8 "Conçois la mission d évaluation du potentiel romanesque de Calepin. À partir de l analyse validée, elle apprécie ce que le texte source peut réellement soutenir sur la longueur cible : quels éléments portent une expansion, lesquels s épuiseraient, ce qui manque pour tenir la durée, et quelles fragilités devront être traitées. Elle nomme au moins trois éléments à développer et deux fragilités. Aucune note chiffrée présentée comme mesure de qualité : uniquement des appréciations argumentées rattachées à des éléments du texte. Termine par un commit Conventional Commits en anglais."
```

##### CAL-077 · Régénération ciblée d'une section d'analyse
- **État** : 🟡 **Partiel** — contrat, schéma, vérificateurs et prompt livrés et testés ; **aucun exécuteur ne lance la mission** (débloqué par CAL-208, exécuteur livré par CAL-214)
- **Contenu** : relance d'une seule section sans écraser les autres, avec instruction complémentaire de l'utilisateur.
- **Fini quand** : régénérer la section « thèmes » ne modifie aucune autre section ni les annotations existantes.
- **Modèle** : `opus` (Claude Opus 5) · **Effort** : `high` · **Complexité** : 2/3
- **Pourquoi ce modèle** : la régénération partielle sans effet de bord est une exigence forte du principe de contrôle utilisateur 4.1 ; elle demande une composition de contexte ciblée et une écriture partielle sûre.
- **Commande** :

```bash
claude --model opus --effort high "Implémente dans Calepin la régénération ciblée d une seule section de l analyse, avec instruction complémentaire optionnelle de l utilisateur. La régénération ne doit modifier ni les autres sections ni les annotations existantes, et doit créer une version plutôt qu écraser. Ajoute un test vérifiant l absence totale d effet de bord. Termine par un commit Conventional Commits en anglais."
```

##### CAL-078 · Corpus de référence et tests de l'analyse
- **État** : ✅ **Terminé** — commité, revu dans `tasks/todo.md`
- **Contenu** : cinq nouvelles courtes libres de droits, résultats attendus annotés, exécution du banc d'évaluation.
- **Fini quand** : une régression de qualité d'analyse est détectable avant mise en production.
- **Modèle** : `sonnet` (Claude Sonnet 5) · **Effort** : `high` · **Complexité** : 2/3
- **Pourquoi ce modèle** : constitution de corpus et câblage sur le banc déjà construit en CAL-059 ; le jugement littéraire est délégué au banc, pas au modèle qui écrit ce code.
- **Commande** :

```bash
claude --model sonnet --effort high "Constitue le corpus de référence de Calepin : cinq nouvelles courtes libres de droits de registres différents, stockées dans le dépôt avec leur mention de domaine public, accompagnées des attentes qualitatives annotées pour chaque section d analyse. Câble ce corpus sur le banc d évaluation existant et ajoute une commande pnpm eval:analysis. Termine par un commit Conventional Commits en anglais."
```

---

### E08 — Exploration des directions romanesques *(Phase 3)*

##### CAL-079 · Mission de génération des trois directions
- **État** : 🟡 **Partiel** — contrat, schéma, vérificateurs et prompt livrés et testés ; **aucun exécuteur ne lance la mission** (débloqué par CAL-208, exécuteur livré par CAL-210)
- **Contenu** : prompt produisant trois directions complètes avec les douze attributs exigés, à partir de l'analyse validée et du degré de liberté.
- **Fini quand** : les trois directions sont complètes, exploitables et conformes au schéma.
- **Modèle** : `fable` (Claude Fable 5) · **Effort** : `xhigh` · **Complexité** : 3/3
- **Pourquoi ce modèle** : le cahier des charges définit la réussite du produit par la capacité à faire choisir « une direction qu'il n'aurait pas nécessairement trouvée seul ». C'est une exigence de créativité sous contrainte, sans bonne réponse connue — le cas d'usage central de Fable 5, dont le raisonnement toujours actif et l'investigation préalable produisent des propositions moins immédiates. `xhigh` pour un travail à long horizon impliquant plusieurs passes internes. Budget plafonné.
- **Commande** :

```bash
claude --model fable --effort xhigh --permission-mode plan --max-budget-usd 15 "ultrathink Conçois la mission de génération des directions romanesques de Calepin. À partir de l analyse validée, du degré de liberté et de la longueur cible, elle produit trois directions complètes comportant chacune titre de travail, prémisse développée, genre dominant, conflit principal, trajectoire du protagoniste, nouveaux enjeux, personnages à introduire, nature de la fin, risques principaux, éléments du texte source conservés, éléments transformés et évaluation argumentée du potentiel romanesque. Objectif de qualité : proposer des développements que l auteur n aurait pas nécessairement trouvés seul, sans trahir la promesse émotionnelle du texte source. Éprouve la mission sur le corpus de référence et itère avant de conclure. Écris ton plan dans tasks/todo.md avant d agir. Termine par un commit Conventional Commits en anglais."
```

##### CAL-080 · Contrainte de divergence des moteurs narratifs
- **État** : ✅ **Terminé** — commité, revu dans `tasks/todo.md`
- **Contenu** : garantie que les trois directions diffèrent par leur moteur narratif et non par leur décor ; contrôle automatique et relance si la divergence est insuffisante.
- **Fini quand** : trois variations de décor sur un même moteur sont détectées et rejetées automatiquement.
- **Modèle** : `fable` (Claude Fable 5) · **Effort** : `xhigh` · **Complexité** : 3/3
- **Pourquoi ce modèle** : c'est le critère d'acceptation le plus difficile du MVP — « chaque direction est suffisamment différente des autres » — parce qu'il faut définir opérationnellement ce qu'est un moteur narratif distinct. Problème conceptuel ouvert, sans référence toute faite : Fable 5. Budget plafonné.
- **Commande** :

```bash
claude --model fable --effort xhigh --permission-mode plan --max-budget-usd 15 "ultrathink Implémente dans Calepin la contrainte de divergence des directions romanesques. Définis d abord opérationnellement ce qui distingue deux moteurs narratifs : nature du conflit, source de la tension, ce que le protagoniste risque, ce qui provoque le basculement, nature de la résolution. Implémente ensuite un contrôle automatique qui compare les trois directions produites sur ces axes et déclenche une relance ciblée quand deux directions partagent le même moteur en ne différant que par le décor. Ajoute un test avec trois directions volontairement quasi identiques qui doivent être rejetées. Écris ton plan dans tasks/todo.md avant d agir. Termine par un commit Conventional Commits en anglais."
```

##### CAL-081 · Évaluation critique de chaque direction
- **État** : 🟡 **Partiel** — contrat, schéma, vérificateurs et prompt livrés et testés ; **aucun exécuteur ne lance la mission** (débloqué par CAL-208, exécuteur livré par CAL-214)
- **Contenu** : mission séparée qui évalue une direction et explique pourquoi elle est moins intéressante que les autres, sans note globale.
- **Fini quand** : chaque direction porte une critique argumentée reliée à des éléments précis du projet.
- **Modèle** : `fable` (Claude Fable 5) · **Effort** : `high` · **Complexité** : 3/3
- **Pourquoi ce modèle** : le cahier des charges impose la séparation entre production et critique et interdit l'illusion d'originalité chiffrée. Une critique littéraire utile suppose de la profondeur de jugement — c'est la valeur ajoutée de Fable 5. Mission séparée conformément au principe 6.2.
- **Commande** :

```bash
claude --model fable --effort high --max-budget-usd 8 "Conçois la mission d évaluation critique d une direction romanesque de Calepin, strictement séparée de la mission qui les produit. Pour une direction donnée elle expose ce qu elle promet, ce qu elle risque de ne pas tenir, ce qui y est convenu, et pourquoi elle peut être moins intéressante que les autres. Interdiction de produire un score global présenté comme mesure de qualité ou d originalité : chaque critique doit être argumentée et rattachée à un élément précis de la direction ou du texte source. Termine par un commit Conventional Commits en anglais."
```

##### CAL-082 · Écran de comparaison des directions
- **État** : ✅ **Terminé** — commité, revu dans `tasks/todo.md`
- **Contenu** : présentation côte à côte des trois directions, mise en évidence des différences de moteur, critique associée.
- **Fini quand** : la différence entre les trois directions est lisible en moins de trente secondes.
- **Modèle** : `sonnet` (Claude Sonnet 5) · **Effort** : `high` · **Complexité** : 2/3
- **Pourquoi ce modèle** : écran de comparaison dense mais sans logique nouvelle ; les données et les évaluations sont déjà produites.
- **Commande** :

```bash
claude --model sonnet --effort high "Crée l écran de comparaison des directions romanesques de Calepin : les trois directions côte à côte sur ordinateur et empilées sur tablette, avec mise en évidence des axes où leurs moteurs narratifs diffèrent, la critique argumentée de chacune, et les éléments du texte source conservés ou transformés. La différence entre les trois doit être lisible immédiatement. Navigation clavier complète. Termine par un commit Conventional Commits en anglais."
```

##### CAL-083 · Remplacement d'une proposition
- **État** : 🟡 **Partiel** — contrat, schéma, vérificateurs et prompt livrés et testés ; **aucun exécuteur ne lance la mission** (débloqué par CAL-208, exécuteur livré par CAL-214)
- **Contenu** : demande de remplacement d'une direction, en excluant explicitement le moteur narratif de celle qui est écartée.
- **Fini quand** : la direction de remplacement ne reproduit pas le moteur de celle qui a été rejetée.
- **Modèle** : `opus` (Claude Opus 5) · **Effort** : `high` · **Complexité** : 2/3
- **Pourquoi ce modèle** : la logique d'exclusion s'appuie sur les axes de divergence déjà définis en CAL-080 ; il s'agit de composer un contexte correct et de câbler la relance. Opus 5 suffit, Fable 5 n'est plus nécessaire une fois le cadre conceptuel posé.
- **Commande** :

```bash
claude --model opus --effort high "Implémente dans Calepin le remplacement d une direction romanesque : l utilisateur écarte une proposition, éventuellement en indiquant pourquoi, et une nouvelle est générée en excluant explicitement le moteur narratif de la direction écartée et ceux des deux directions conservées, sur la base des axes de divergence déjà définis. La direction écartée reste consultable dans l historique. Termine par un commit Conventional Commits en anglais."
```

##### CAL-084 · Combinaison d'éléments de plusieurs directions
- **État** : 🟡 **Partiel** — contrat, schéma, vérificateurs et prompt livrés et testés ; **aucun exécuteur ne lance la mission** (débloqué par CAL-208, exécuteur livré par CAL-214)
- **Contenu** : sélection d'éléments issus de directions différentes, génération d'une direction fusionnée cohérente, signalement des incompatibilités.
- **Fini quand** : combiner deux moteurs incompatibles produit un avertissement explicite plutôt qu'une fusion incohérente.
- **Modèle** : `fable` (Claude Fable 5) · **Effort** : `xhigh` · **Complexité** : 3/3
- **Pourquoi ce modèle** : fusionner des directions volontairement incompatibles tout en détectant les incompatibilités irréductibles est un problème ouvert qui demande un vrai jugement narratif ; une fusion naïve produit exactement le texte mou que le produit cherche à éviter.
- **Commande** :

```bash
claude --model fable --effort xhigh --permission-mode plan --max-budget-usd 12 "ultrathink Implémente dans Calepin la combinaison d éléments issus de plusieurs directions romanesques. L utilisateur sélectionne des éléments dans deux ou trois directions ; le système produit une direction fusionnée qui reste dramatiquement cohérente, ou signale explicitement pourquoi la combinaison demandée est irréductible en nommant les éléments qui s excluent. Les directions étant conçues pour diverger par leur moteur narratif, la fusion doit choisir un moteur dominant plutôt que produire un compromis mou. Écris ton plan dans tasks/todo.md avant d agir. Termine par un commit Conventional Commits en anglais."
```

##### CAL-085 · Édition manuelle et direction rédigée par l'utilisateur
- **État** : ✅ **Terminé** — commité, revu dans `tasks/todo.md`
- **Contenu** : modification libre d'une direction proposée, ou saisie complète d'une direction personnelle.
- **Fini quand** : une direction entièrement rédigée par l'utilisateur alimente la bible aussi bien qu'une direction générée.
- **Modèle** : `sonnet` (Claude Sonnet 5) · **Effort** : `high` · **Complexité** : 2/3
- **Pourquoi ce modèle** : formulaire d'édition sur une structure déjà définie, avec le patron de traçabilité déjà établi en CAL-073.
- **Commande** :

```bash
claude --model sonnet --effort high "Implémente dans Calepin l édition manuelle d une direction romanesque et la saisie complète d une direction personnelle par l utilisateur, en réutilisant le patron de traçabilité déjà en place. Une direction rédigée par l utilisateur doit alimenter la génération de bible exactement comme une direction générée. Ajoute les tests. Termine par un commit Conventional Commits en anglais."
```

##### CAL-086 · Sélection de la direction canonique
- **État** : ✅ **Terminé** — commité, revu dans `tasks/todo.md`
- **Contenu** : choix unique, verrouillage, transition de statut, avertissement sur les conséquences d'un changement ultérieur.
- **Fini quand** : changer de direction canonique après génération de la bible avertit explicitement de ce qui devient obsolète.
- **Modèle** : `opus` (Claude Opus 5) · **Effort** : `high` · **Complexité** : 2/3
- **Pourquoi ce modèle** : réutilise la propagation d'obsolescence conçue en CAL-046 et l'étend à un point de bascule majeur du projet ; la cohérence entre les deux mécanismes justifie Opus 5.
- **Commande** :

```bash
claude --model opus --effort high "Implémente dans Calepin la sélection de la direction canonique : une seule direction par projet, transition du statut vers bible à valider, et réutilisation du mécanisme de propagation d obsolescence pour avertir explicitement, lors d un changement ultérieur, de ce qui devient obsolète en aval, bible, plan et chapitres, sans jamais supprimer ni régénérer automatiquement. Termine par un commit Conventional Commits en anglais."
```

##### CAL-087 · Historique des directions explorées
- **État** : ✅ **Terminé** — commité, revu dans `tasks/todo.md`
- **Contenu** : conservation de toutes les directions générées, écartées et remplacées, consultables après coup.
- **Fini quand** : aucune direction produite n'est perdue, y compris celles remplacées.
- **Modèle** : `haiku` (Claude Haiku 4.5) · **Effort** : *n/a* · **Complexité** : 1/3
- **Pourquoi ce modèle** : lecture et affichage d'un historique déjà persistant, en réutilisant des composants existants. Tâche courte, cadrée, non sensible à l'intelligence — exactement le créneau de Haiku 4.5. **Pas de `--effort`.**
- **Commande** :

```bash
claude --model haiku "Ajoute à Calepin l historique des directions romanesques : liste de toutes les directions générées, écartées, remplacées ou modifiées, avec leur date et leur origine, consultables en lecture seule depuis l écran de comparaison. Réutilise strictement les composants d affichage de direction existants. Termine par un commit Conventional Commits en anglais."
```

---

### E09 — Bible narrative *(Phase 3)*

##### CAL-088 · Mission — identité du roman
- **État** : 🟡 **Partiel** — contrat, schéma, vérificateurs et prompt livrés et testés ; **aucun exécuteur ne lance la mission** (débloqué par CAL-208, exécuteur livré par CAL-211)
- **Contenu** : titre provisoire, genre, sous-genre, public, longueur cible, tonalité, promesse narrative, thèmes, contre-thèmes, question centrale, type de fin.
- **Fini quand** : les onze champs sont produits et cohérents avec la direction canonique.
- **Modèle** : `opus` (Claude Opus 5) · **Effort** : `high` · **Complexité** : 2/3
- **Pourquoi ce modèle** : section largement déterminée par la direction canonique déjà choisie ; il s'agit de transposition rigoureuse plutôt que d'invention. Opus 5 assure la cohérence avec l'amont sans le coût de Fable 5 (25 $ contre 50 $ par million de jetons de sortie).
- **Commande** :

```bash
claude --model opus --effort high "Conçois la mission d identité du roman de Calepin : à partir de la direction canonique et de l analyse validée, produire titre provisoire, genre, sous-genre, public, longueur cible, tonalité, promesse narrative, thèmes, contre-thèmes, question centrale et type de fin envisagé. Chaque champ doit être traçable à un élément de la direction ou de l analyse, sans invention non motivée. Schéma de sortie strict. Termine par un commit Conventional Commits en anglais."
```

##### CAL-089 · Mission — section style
- **État** : 🟡 **Partiel** — contrat, schéma, vérificateurs et prompt livrés et testés ; **aucun exécuteur ne lance la mission** (débloqué par CAL-208, exécuteur livré par CAL-211)
- **Contenu** : point de vue, focalisation, temps verbal, niveau de langue, densité descriptive, rythme, place du dialogue, motifs récurrents, éléments stylistiques à éviter.
- **Fini quand** : la section style est réellement utilisée comme contrainte lors de la rédaction, pas seulement affichée.
- **Modèle** : `fable` (Claude Fable 5) · **Effort** : `high` · **Complexité** : 3/3
- **Pourquoi ce modèle** : la section style est ce qui empêchera plus tard la prose interchangeable identifiée comme risque majeur. Formuler des contraintes stylistiques qui ont un effet réel sur la génération — et non des adjectifs décoratifs — demande un jugement littéraire fin. Fable 5 pour la conception ; `high` suffit car son raisonnement est de toute façon toujours actif.
- **Commande** :

```bash
claude --model fable --effort high --max-budget-usd 8 "Conçois la mission de section style de la bible de Calepin : point de vue, focalisation, temps verbal, niveau de langue, densité descriptive, rythme, place du dialogue, motifs récurrents et éléments stylistiques à éviter. Exigence centrale : chaque élément doit être formulé comme une contrainte opérationnelle vérifiable lors de la rédaction, pas comme un adjectif décoratif. Vérifie en générant deux paragraphes sous deux sections style différentes que la prose obtenue diffère réellement. Termine par un commit Conventional Commits en anglais."
```

##### CAL-090 · Mission — fiches personnages
- **État** : 🟡 **Partiel** — contrat, schéma, vérificateurs et prompt livrés et testés ; **aucun exécuteur ne lance la mission** (débloqué par CAL-208, exécuteur livré par CAL-211)
- **Contenu** : génération des dix-sept champs par personnage, dont désir apparent, besoin profond, contradiction, secret, connaissances détenues.
- **Fini quand** : chaque personnage principal a une contradiction interne explicite et un besoin distinct de son désir.
- **Modèle** : `fable` (Claude Fable 5) · **Effort** : `xhigh` · **Complexité** : 3/3
- **Pourquoi ce modèle** : la distinction désir apparent / besoin profond et la contradiction interne sont ce qui sépare un personnage d'une fonction narrative — le cahier des charges cite justement le « personnage uniquement fonctionnel » parmi les défauts à détecter. Produire cela de façon non générique est un problème de jugement, pas de format. Fable 5, `xhigh`, budget plafonné.
- **Commande** :

```bash
claude --model fable --effort xhigh --permission-mode plan --max-budget-usd 15 "ultrathink Conçois la mission de génération des fiches personnages de Calepin. Chaque fiche comporte nom, âge, rôle, apparence utile au récit, situation initiale, désir apparent, besoin profond, peur, contradiction, secret, passé, relations, évolution prévue, manière de parler, connaissances détenues et éléments à ne pas modifier. Exigences de qualité : le besoin profond doit différer du désir apparent, la contradiction doit être active et créer des choix difficiles, la manière de parler doit être suffisamment spécifiée pour rendre les dialogues non interchangeables, et les connaissances détenues doivent être exploitables par le contrôle de cohérence. Aucun personnage ne doit se réduire à une fonction narrative. Éprouve la mission sur le corpus de référence. Écris ton plan dans tasks/todo.md avant d agir. Termine par un commit Conventional Commits en anglais."
```

##### CAL-091 · Relations entre personnages
- **État** : 🟡 **Partiel** — contrat, schéma, vérificateurs et prompt livrés et testés ; **aucun exécuteur ne lance la mission** (débloqué par CAL-208, exécuteur livré par CAL-211)
- **Contenu** : génération et édition des relations typées et orientées, avec asymétries (ce que A sait de B et non l'inverse).
- **Fini quand** : une relation asymétrique est représentable et exploitable par le contrôle de cohérence.
- **Modèle** : `opus` (Claude Opus 5) · **Effort** : `high` · **Complexité** : 2/3
- **Pourquoi ce modèle** : la structure de graphe orienté a été conçue en CAL-016 ; il s'agit ici de la peupler correctement et d'assurer l'exploitation. Codage complexe mais spécifié.
- **Commande** :

```bash
claude --model opus --effort high "Implémente dans Calepin la génération et l édition des relations entre personnages : relations typées, orientées et asymétriques permettant de représenter que A sait de B quelque chose que B ignore. Assure que ces asymétries sont lisibles par le composeur de contexte et par le futur contrôle de cohérence. Ajoute un écran de visualisation simple du réseau de relations. Termine par un commit Conventional Commits en anglais."
```

##### CAL-092 · Mission — bible du monde
- **État** : 🟡 **Partiel** — contrat, schéma, vérificateurs et prompt livrés et testés ; **aucun exécuteur ne lance la mission** (débloqué par CAL-208, exécuteur livré par CAL-211)
- **Contenu** : époque, lieux, contexte social, contexte politique, règles du monde, technologies, institutions, contraintes, éléments surnaturels et **leurs limites**.
- **Fini quand** : tout élément surnaturel déclaré porte des limites explicites et vérifiables.
- **Modèle** : `opus` (Claude Opus 5) · **Effort** : `high` · **Complexité** : 3/3
- **Pourquoi ce modèle** : l'exigence de déclarer les limites de tout élément surnaturel est ce qui rendra possible la détection ultérieure de résolutions par coïncidence ou par pouvoir opportun. C'est une contrainte de conception que le prompt doit imposer fermement. Opus 5.
- **Commande** :

```bash
claude --model opus --effort high --permission-mode plan "Conçois la mission de bible du monde de Calepin : époque, lieux, contexte social, contexte politique éventuel, règles du monde, technologies, institutions, contraintes, éléments surnaturels éventuels et limites de ces éléments. Exigence impérative : tout élément surnaturel ou toute capacité hors norme doit être accompagné de limites explicites, de coûts et de conditions d échec, afin de rendre détectable plus tard une résolution reposant sur une commodité. Refuse la génération si un élément surnaturel est déclaré sans limites. Écris ton plan dans tasks/todo.md avant d agir. Termine par un commit Conventional Commits en anglais."
```

##### CAL-093 · Chronologie initiale
- **État** : 🟡 **Partiel** — contrat, schéma, vérificateurs et prompt livrés et testés ; **aucun exécuteur ne lance la mission** (débloqué par CAL-208, exécuteur livré par CAL-211)
- **Contenu** : génération des événements antérieurs au roman et des événements prévus, âges, durées.
- **Fini quand** : la chronologie générée ne contient aucun âge ni aucune durée incompatible.
- **Modèle** : `opus` (Claude Opus 5) · **Effort** : `xhigh` · **Complexité** : 3/3
- **Pourquoi ce modèle** : c'est l'endroit où les modèles produisent le plus d'erreurs arithmétiques silencieuses (un personnage de 34 ans qui avait 12 ans il y a 30 ans). Il faut à la fois un prompt contraignant et une validation calculatoire post-génération. `xhigh` pour la rigueur du contrôle croisé.
- **Commande** :

```bash
claude --model opus --effort xhigh --permission-mode plan "ultrathink Conçois la mission de chronologie initiale de Calepin : événements antérieurs au roman, événements prévus, âge de chaque personnage à chaque événement et durées entre événements. Ajoute une validation calculatoire post-génération, indépendante du modèle, qui vérifie la cohérence arithmétique des âges, des dates et des durées et rejette toute chronologie incohérente en signalant précisément l incohérence. Ajoute des tests avec des chronologies volontairement fausses. Écris ton plan dans tasks/todo.md avant d agir. Termine par un commit Conventional Commits en anglais."
```

##### CAL-094 · Extraction des faits canoniques initiaux
- **État** : 🟡 **Partiel** — contrat, schéma, vérificateurs et prompt livrés et testés ; **aucun exécuteur ne lance la mission** (débloqué par CAL-208, exécuteur livré par CAL-211)
- **Contenu** : dérivation de faits atomiques à partir de la bible et du texte source, avec portée temporelle et connaissance par personnage.
- **Fini quand** : les faits produits sont atomiques, non redondants et correctement portés temporellement.
- **Modèle** : `opus` (Claude Opus 5) · **Effort** : `xhigh` · **Complexité** : 3/3
- **Pourquoi ce modèle** : l'atomicité est la condition de tout le contrôle de cohérence en aval ; un fait composé (« Nora vit seule depuis l'accident de 1998 ») rend la détection de contradiction impossible. Discipline de décomposition rigoureuse : Opus 5, `xhigh`.
- **Commande** :

```bash
claude --model opus --effort xhigh --permission-mode plan "ultrathink Conçois la mission d extraction des faits canoniques initiaux de Calepin, à partir de la bible validée et du texte source. Chaque fait doit être strictement atomique : un fait composé comme Nora vit seule depuis l accident de 1998 doit être décomposé en faits élémentaires liés. Chaque fait porte sa portée temporelle, permanent, vrai pendant une période ou faux après un événement, et la liste des personnages qui le connaissent. Ajoute une déduplication sémantique et une validation d atomicité qui rejette les faits composés. Écris ton plan dans tasks/todo.md avant d agir. Ajoute des tests de décomposition. Termine par un commit Conventional Commits en anglais."
```

##### CAL-095 · Verrouillage des éléments de bible
- **État** : ✅ **Terminé** — commité, revu dans `tasks/todo.md`
- **Contenu** : verrou par élément (fait, personnage, règle, champ de fiche), effet réel sur les générations ultérieures.
- **Fini quand** : une génération qui contredirait un élément verrouillé est bloquée avant exécution, pas corrigée après.
- **Modèle** : `opus` (Claude Opus 5) · **Effort** : `xhigh` · **Complexité** : 3/3
- **Pourquoi ce modèle** : c'est le mécanisme central du principe de contrôle utilisateur 4.1 et un critère d'acceptation du MVP. Le verrou doit agir **en amont** de la génération — logique de garde traversant contexte, prompt et validation. Opus 5 à `xhigh`.
- **Commande** :

```bash
claude --model opus --effort xhigh --permission-mode plan "ultrathink Implémente le verrouillage des éléments de la bible de Calepin : un fait canonique, un personnage, un champ de fiche, une règle du monde ou un événement de chronologie peut être verrouillé individuellement. Un élément verrouillé ne doit jamais être modifié silencieusement. Le verrou doit agir en amont : lorsqu une instruction utilisateur ou un contexte de génération contredit un élément verrouillé, le système le signale avant la génération et demande si le verrou doit être levé, plutôt que de corriger après coup. Écris ton plan dans tasks/todo.md avant d agir. Ajoute les tests de blocage préalable. Termine par un commit Conventional Commits en anglais."
```

##### CAL-096 · Écran de la bible
- **État** : ✅ **Terminé** — commité, revu dans `tasks/todo.md`
- **Contenu** : navigation par sections (identité, style, personnages, monde, chronologie, faits), recherche, indicateurs de verrouillage.
- **Fini quand** : retrouver un fait canonique précis prend moins de dix secondes.
- **Modèle** : `sonnet` (Claude Sonnet 5) · **Effort** : `high` · **Complexité** : 2/3
- **Pourquoi ce modèle** : interface de consultation et de navigation, volumineuse mais sans logique nouvelle.
- **Commande** :

```bash
claude --model sonnet --effort high "Crée l écran de la bible narrative de Calepin : navigation latérale par sections identité, style, personnages, monde, chronologie et faits canoniques, recherche transverse, indicateur visuel de verrouillage ne reposant pas sur la seule couleur, et indicateur d origine proposition modèle, modification manuelle ou élément validé. Navigation clavier complète. Termine par un commit Conventional Commits en anglais."
```

##### CAL-097 · Éditeur de fiche personnage
- **État** : ✅ **Terminé** — commité, revu dans `tasks/todo.md`
- **Contenu** : édition des dix-sept champs, verrouillage par champ, historique des modifications, relations rattachées.
- **Fini quand** : modifier un champ verrouillé est impossible sans lever explicitement le verrou.
- **Modèle** : `sonnet` (Claude Sonnet 5) · **Effort** : `high` · **Complexité** : 2/3
- **Pourquoi ce modèle** : formulaire riche s'appuyant sur des mécanismes déjà en place (traçabilité, verrous, versions).
- **Commande** :

```bash
claude --model sonnet --effort high "Crée l éditeur de fiche personnage de Calepin : édition des dix-sept champs de la fiche, verrouillage par champ, historique des modifications, relations rattachées avec accès direct aux autres fiches. Modifier un champ verrouillé doit exiger une levée explicite du verrou. Sauvegarde automatique. Termine par un commit Conventional Commits en anglais."
```

##### CAL-098 · Éditeur de faits canoniques
- **État** : ✅ **Terminé** — commité, revu dans `tasks/todo.md`
- **Contenu** : liste filtrable, création manuelle, édition de la portée temporelle et de la connaissance par personnage, verrouillage.
- **Fini quand** : l'utilisateur peut créer à la main le fait « Nora ignore que son père est encore vivant » en moins d'une minute.
- **Modèle** : `opus` (Claude Opus 5) · **Effort** : `high` · **Complexité** : 3/3
- **Pourquoi ce modèle** : rendre éditable une structure à trois dimensions (vérité, temps, connaissance) sans produire une interface illisible est un problème d'ergonomie non trivial adossé à une logique fine.
- **Commande** :

```bash
claude --model opus --effort high --permission-mode plan "Crée l éditeur de faits canoniques de Calepin : liste filtrable par personnage, par période et par statut, création manuelle, édition de la portée temporelle et de la connaissance par personnage, verrouillage. L interface doit rendre simple la saisie d un fait à trois dimensions comme Nora ignore que son père est encore vivant, sans exposer la complexité du modèle de données. Vocabulaire littéraire accessible. Écris ton plan dans tasks/todo.md avant d agir. Termine par un commit Conventional Commits en anglais."
```

##### CAL-099 · Contrôle de cohérence interne de la bible
- **État** : 🟡 **Partiel** — contrat, schéma, vérificateurs et prompt livrés et testés ; **aucun exécuteur ne lance la mission** (débloqué par CAL-208, exécuteur livré par CAL-215)
- **Contenu** : détection des contradictions internes avant validation (âges, relations, règles du monde, faits opposés).
- **Fini quand** : une bible contenant deux faits contradictoires ne peut pas être validée sans arbitrage explicite.
- **Modèle** : `opus` (Claude Opus 5) · **Effort** : `xhigh` · **Complexité** : 3/3
- **Pourquoi ce modèle** : premier moteur de détection du produit ; sa structure sera réemployée dans l'epic E13. Il combine règles déterministes (arithmétique des âges) et jugement du modèle (faits opposés en langue naturelle). Opus 5 à `xhigh`.
- **Commande** :

```bash
claude --model opus --effort xhigh --permission-mode plan "ultrathink Implémente le contrôle de cohérence interne de la bible de Calepin, exécuté avant validation. Il combine des règles déterministes, cohérence arithmétique des âges et des dates, relations symétriques manquantes, personnage référencé et inexistant, lieu inexistant, et une mission de modèle qui repère les faits canoniques sémantiquement opposés et les règles du monde contradictoires. Une bible contenant une contradiction ne peut pas être validée sans arbitrage explicite de l utilisateur. Conçois la structure de ce moteur pour être réutilisée par le contrôle de cohérence du manuscrit. Écris ton plan dans tasks/todo.md avant d agir. Termine par un commit Conventional Commits en anglais."
```

##### CAL-100 · Validation de la bible
- **État** : ✅ **Terminé** — commité, revu dans `tasks/todo.md`
- **Contenu** : validation explicite, création d'une version nommée, transition de statut vers la planification.
- **Fini quand** : la bible validée devient la référence utilisée par toutes les générations suivantes.
- **Modèle** : `sonnet` (Claude Sonnet 5) · **Effort** : `high` · **Complexité** : 1/3
- **Pourquoi ce modèle** : action métier simple réutilisant validation, versionnement et machine à états déjà écrits.
- **Commande** :

```bash
claude --model sonnet --effort high "Implémente la validation de la bible de Calepin : action explicite, création d une version nommée servant de point de sauvegarde, transition du statut vers plan en construction, et bascule du composeur de contexte sur cette version validée comme référence de toutes les générations suivantes. Ajoute les tests. Termine par un commit Conventional Commits en anglais."
```

---

### E10 — Construction du plan *(Phase 4)*

##### CAL-101 · Mission — découpage en parties
- **État** : 🟡 **Partiel** — contrat, calibrage et vérificateur livrés ; `resolve*` produit des valeurs de colonnes que **rien n'écrit** (persistance et exécuteur livrés par CAL-212)
- **Contenu** : parties avec objectif dramatique, état initial, basculement, état final, fils narratifs concernés.
- **Fini quand** : chaque partie a un basculement identifiable et un état final différent de son état initial.
- **Modèle** : `fable` (Claude Fable 5) · **Effort** : `xhigh` · **Complexité** : 3/3
- **Pourquoi ce modèle** : l'architecture dramatique d'ensemble est la décision structurante du roman ; c'est là que se joue l'absence de progression et la fin précipitée identifiées comme défauts majeurs. Problème de conception globale sur une longue portée — profil pour lequel Fable 5 est explicitement recommandé (« donne-lui le travail que tu découperais normalement »). Budget plafonné.
- **Commande** :

```bash
claude --model fable --effort xhigh --permission-mode plan --max-budget-usd 15 "ultrathink Conçois la mission de découpage en parties de Calepin. À partir de la bible validée, de la direction canonique et de la longueur cible, elle produit les parties du roman avec pour chacune objectif dramatique, état initial, basculement, état final et fils narratifs concernés. Exigences de qualité : chaque partie doit avoir un basculement identifiable, son état final doit différer de son état initial, la progression d ensemble doit éviter la répétition du même enjeu et la résolution précipitée. Éprouve la mission sur plusieurs longueurs cibles et vérifie que le découpage s adapte réellement. Écris ton plan dans tasks/todo.md avant d agir. Termine par un commit Conventional Commits en anglais."
```

##### CAL-102 · Mission — plans de chapitre
- **État** : 🟡 **Partiel** — contrat, calibrage et vérificateur livrés ; `resolve*` produit des valeurs de colonnes que **rien n'écrit** (persistance et exécuteur livrés par CAL-212)
- **Contenu** : génération des seize attributs par chapitre, en cohérence avec la partie qui le contient.
- **Fini quand** : chaque chapitre a une fonction dramatique et une conséquence, critère d'acceptation formel du MVP.
- **Modèle** : `fable` (Claude Fable 5) · **Effort** : `xhigh` · **Complexité** : 3/3
- **Pourquoi ce modèle** : le cahier des charges fait du « chapitre sans conséquence » un défaut à détecter ; garantir qu'aucun chapitre n'est décoratif sur cinquante chapitres est un problème de cohérence à longue portée. Fable 5 tient les longues sessions sans perdre le fil, ce qui est ici la difficulté principale. Budget plafonné plus haut car la mission génère beaucoup.
- **Commande** :

```bash
claude --model fable --effort xhigh --permission-mode plan --max-budget-usd 20 "ultrathink Conçois la mission de génération des plans de chapitre de Calepin. Pour chaque chapitre : numéro, titre provisoire, longueur cible, personnage focal, lieu, période, fonction dramatique, objectif immédiat, obstacle, décision, révélation éventuelle, conséquence, personnages présents, faits canoniques concernés, fils narratifs ouverts poursuivis ou fermés, résumé détaillé. Exigences impératives : aucun chapitre sans fonction dramatique ni sans conséquence, aucune répétition du même enjeu d un chapitre à l autre, chaque révélation préparée, aucun fil narratif ouvert sans chapitre de fermeture prévu. Génère par lots cohérents à l échelle de la partie pour tenir la cohérence sur toute la longueur. Écris ton plan dans tasks/todo.md avant d agir. Termine par un commit Conventional Commits en anglais."
```

##### CAL-103 · Calibrage du nombre de chapitres
- **État** : ✅ **Terminé** — commité, revu dans `tasks/todo.md`
- **Contenu** : dérivation du nombre de chapitres et de leur longueur cible depuis la longueur du roman, avec ajustement.
- **Fini quand** : la somme des longueurs cibles de chapitres correspond à la longueur cible du roman à 10 % près.
- **Modèle** : `sonnet` (Claude Sonnet 5) · **Effort** : `high` · **Complexité** : 1/3
- **Pourquoi ce modèle** : calcul déterministe, entièrement testable, sans dimension littéraire.
- **Commande** :

```bash
claude --model sonnet --effort high "Implémente dans Calepin le calibrage du nombre de chapitres : dérive du choix de longueur cible un nombre de chapitres et une longueur cible par chapitre, autorise l ajustement manuel, et vérifie que la somme des longueurs cibles reste à moins de dix pour cent de la longueur visée. Affiche l écart en temps réel. Ajoute les tests de calcul. Termine par un commit Conventional Commits en anglais."
```

##### CAL-104 · Écran du plan
- **État** : ✅ **Terminé** — commité, revu dans `tasks/todo.md`
- **Contenu** : vue d'ensemble par parties et chapitres, aperçu de la fonction dramatique, fils narratifs, longueur cumulée.
- **Fini quand** : la structure de cinquante chapitres reste lisible sans défilement infini.
- **Modèle** : `sonnet` (Claude Sonnet 5) · **Effort** : `high` · **Complexité** : 2/3
- **Pourquoi ce modèle** : interface d'affichage dense mais classique ; la matière est déjà produite.
- **Commande** :

```bash
claude --model sonnet --effort high "Crée l écran du plan de Calepin : vue d ensemble par parties et chapitres avec repli et dépli, aperçu de la fonction dramatique et de la conséquence de chaque chapitre, indication des fils narratifs ouverts et fermés, longueur cumulée et écart à la cible. La structure doit rester lisible avec cinquante chapitres. Navigation clavier complète. Termine par un commit Conventional Commits en anglais."
```

##### CAL-105 · Réorganisation des chapitres
- **État** : ✅ **Terminé** — commité, revu dans `tasks/todo.md`
- **Contenu** : déplacement par glisser-déposer et par clavier, renumérotation automatique, conservation des références.
- **Fini quand** : déplacer un chapitre ne casse ni les fils narratifs ni les références aux faits canoniques.
- **Modèle** : `opus` (Claude Opus 5) · **Effort** : `high` · **Complexité** : 3/3
- **Pourquoi ce modèle** : la réorganisation touche l'ordonnancement conçu en CAL-019 et doit rester accessible au clavier. Les erreurs de renumérotation et de références rompues sont fréquentes et difficiles à repérer. Opus 5.
- **Commande** :

```bash
claude --model opus --effort high --permission-mode plan "Implémente la réorganisation des chapitres du plan de Calepin : déplacement par glisser-déposer et alternative complète au clavier, renumérotation automatique, conservation intégrale des références aux fils narratifs, aux faits canoniques et aux personnages. Ajoute des tests vérifiant qu aucune référence n est rompue après une série de déplacements. Écris ton plan dans tasks/todo.md avant d agir. Termine par un commit Conventional Commits en anglais."
```

##### CAL-106 · Fusion et scission de chapitres
- **État** : ✅ **Terminé** — commité, revu dans `tasks/todo.md`
- **Contenu** : fusion de deux chapitres adjacents, scission d'un chapitre en deux, redistribution des attributs.
- **Fini quand** : fusionner puis scinder restitue un plan cohérent, sans perte d'attribut.
- **Modèle** : `opus` (Claude Opus 5) · **Effort** : `xhigh` · **Complexité** : 3/3
- **Pourquoi ce modèle** : la redistribution des seize attributs lors d'une scission n'est pas mécanique — quelle conséquence va dans quelle moitié, quel fil se ferme où. Cela combine logique et jugement narratif, avec une exigence de non-perte d'information. Opus 5 à `xhigh`.
- **Commande** :

```bash
claude --model opus --effort xhigh --permission-mode plan "ultrathink Implémente la fusion et la scission de chapitres dans le plan de Calepin. La fusion de deux chapitres adjacents doit consolider objectifs, obstacles, décisions, révélations, conséquences, personnages, faits et fils sans perte. La scission doit proposer une redistribution motivée des attributs entre les deux chapitres obtenus, en s appuyant sur une mission de modèle dédiée, puis laisser l utilisateur arbitrer. Aucune information ne doit être perdue dans l opération. Ajoute des tests de cycle fusion puis scission. Écris ton plan dans tasks/todo.md avant d agir. Termine par un commit Conventional Commits en anglais."
```

##### CAL-107 · Ajout, suppression et verrouillage d'un chapitre
- **État** : ⬜ **À faire**
- **Contenu** : insertion à une position donnée, suppression avec avertissement sur les fils, verrouillage empêchant toute modification automatique.
- **Fini quand** : supprimer un chapitre qui ferme un fil narratif déclenche un avertissement explicite.
- **Modèle** : `sonnet` (Claude Sonnet 5) · **Effort** : `high` · **Complexité** : 2/3
- **Pourquoi ce modèle** : opérations dérivées des mécanismes déjà écrits (ordonnancement, verrous, fils) ; travail d'assemblage.
- **Commande** :

```bash
claude --model sonnet --effort high "Implémente dans le plan de Calepin l ajout d un chapitre à une position donnée, la suppression avec avertissement explicite lorsque le chapitre ouvre ou ferme un fil narratif, et le verrouillage d un chapitre empêchant toute modification automatique. Réutilise les mécanismes d ordonnancement et de verrou existants. Ajoute les tests. Termine par un commit Conventional Commits en anglais."
```

##### CAL-108 · Analyse des répercussions d'une modification du plan
- **État** : ⬜ **À faire**
- **Contenu** : après chaque modification, signalement des conséquences possibles sur la suite (fils orphelins, révélations désordonnées, chapitres rédigés invalidés).
- **Fini quand** : déplacer une révélation avant sa préparation est signalé immédiatement.
- **Modèle** : `fable` (Claude Fable 5) · **Effort** : `xhigh` · **Complexité** : 3/3
- **Pourquoi ce modèle** : exigence explicite du cahier des charges (« l'application doit signaler les répercussions possibles sur la suite du plan »). Raisonner sur les conséquences en cascade d'une modification structurelle est un problème d'analyse ouvert, sans liste finie de règles — le terrain de Fable 5. Budget plafonné.
- **Commande** :

```bash
claude --model fable --effort xhigh --permission-mode plan --max-budget-usd 12 "ultrathink Implémente dans Calepin l analyse des répercussions d une modification du plan. Après tout déplacement, fusion, scission, ajout ou suppression, le système analyse et signale les conséquences possibles sur la suite : fil narratif devenu orphelin, révélation placée avant sa préparation, conséquence privée de sa cause, chapitre déjà rédigé rendu invalide, progression dramatique rompue, longueur cible déséquilibrée. Combine des règles déterministes pour ce qui est calculable et une mission de modèle pour ce qui relève du jugement narratif. Le signalement est informatif : il ne modifie jamais le plan de lui-même. Écris ton plan dans tasks/todo.md avant d agir. Termine par un commit Conventional Commits en anglais."
```

##### CAL-109 · Gestion des fils narratifs dans le plan
- **État** : ⬜ **À faire**
- **Contenu** : vue des fils, chapitre d'ouverture, de poursuite et de fermeture, alerte sur les fils jamais fermés.
- **Fini quand** : un fil ouvert au chapitre 3 et jamais fermé apparaît en alerte sur l'écran du plan.
- **Modèle** : `sonnet` (Claude Sonnet 5) · **Effort** : `high` · **Complexité** : 2/3
- **Pourquoi ce modèle** : requêtes et affichage sur un modèle déjà conçu en CAL-020 ; logique déterministe.
- **Commande** :

```bash
claude --model sonnet --effort high "Crée la vue des fils narratifs du plan de Calepin : liste des fils avec chapitre d ouverture, chapitres de poursuite et chapitre de fermeture, mise en alerte des fils ouverts sans fermeture prévue et des fils fermés sans ouverture. Rends la vue accessible depuis l écran du plan. Ajoute les tests de détection. Termine par un commit Conventional Commits en anglais."
```

##### CAL-110 · Audit de la fonction dramatique du plan
- **État** : ⬜ **À faire**
- **Contenu** : contrôle avant rédaction — chaque chapitre a-t-il une fonction et une conséquence, y a-t-il progression, la fin est-elle préparée.
- **Fini quand** : un plan comportant trois chapitres consécutifs sans conséquence est signalé.
- **Modèle** : `fable` (Claude Fable 5) · **Effort** : `xhigh` · **Complexité** : 3/3
- **Pourquoi ce modèle** : audit littéraire global sur cinquante chapitres, exigeant de tenir toute la structure en tête pour juger de la progression. Fable 5 est décrit comme tenant les longues sessions sans perdre le fil et vérifiant son travail — c'est exactement ce qui est demandé. Budget plafonné.
- **Commande** :

```bash
claude --model fable --effort xhigh --permission-mode plan --max-budget-usd 12 "ultrathink Conçois la mission d audit de la fonction dramatique du plan de Calepin, exécutée avant le lancement de la rédaction. Elle vérifie sur l ensemble du plan : chaque chapitre a-t-il une fonction dramatique et une conséquence, la progression est-elle réelle ou le même enjeu se répète-t-il, les révélations sont-elles préparées, la fin est-elle amenée ou précipitée, un chapitre est-il purement décoratif, une résolution repose-t-elle sur une coïncidence. Chaque remarque cite les chapitres concernés et propose une correction. Aucun score global. Écris ton plan dans tasks/todo.md avant d agir. Termine par un commit Conventional Commits en anglais."
```

##### CAL-111 · Régénération ciblée d'un chapitre du plan
- **État** : ⬜ **À faire**
- **Contenu** : nouvelle proposition pour un seul chapitre, tenant compte des chapitres verrouillés voisins.
- **Fini quand** : régénérer le chapitre 7 respecte les chapitres 6 et 8 verrouillés.
- **Modèle** : `opus` (Claude Opus 5) · **Effort** : `high` · **Complexité** : 2/3
- **Pourquoi ce modèle** : composition de contexte ciblée et respect des verrous, sur des mécanismes déjà en place ; travail d'assemblage rigoureux plutôt que de conception.
- **Commande** :

```bash
claude --model opus --effort high "Implémente dans Calepin la régénération ciblée d un seul chapitre du plan. Le contexte transmis doit inclure les chapitres voisins, en particulier ceux qui sont verrouillés, ainsi que les fils narratifs concernés, afin que la nouvelle proposition s insère sans contredire ce qui l entoure. La proposition est présentée en regard de l existante et n écrase rien tant qu elle n est pas acceptée. Termine par un commit Conventional Commits en anglais."
```

---

### E11 — Rédaction des chapitres et éditeur de manuscrit *(Phase 5)*

##### CAL-112 · Mission de rédaction d'un chapitre
- **État** : ⬜ **À faire**
- **Contenu** : prompt de rédaction s'appuyant sur bible, plan du chapitre, événements déjà rédigés, état des personnages, faits concernés, fils en cours et extraits de continuité.
- **Fini quand** : le chapitre produit respecte le point de vue, le temps verbal et le niveau de langue de la bible, et n'invente aucun fait contredisant les faits canoniques.
- **Modèle** : `fable` (Claude Fable 5) · **Effort** : `xhigh` · **Complexité** : 3/3
- **Pourquoi ce modèle** : c'est la mission dont dépend la valeur perçue de tout le produit. Elle exige de tenir simultanément une bible, un plan, une mémoire factuelle et une contrainte stylistique, sur un texte long — le profil de tâche « plus grande qu'une seule séance » pour lequel Fable 5 est conçu, et où sa propension à vérifier son propre travail réduit les dérives. C'est aussi la seule mission où le surcoût de sortie (50 $ par million de jetons) est directement justifié par la qualité du livrable final. Budget plafonné généreusement car la tâche inclut plusieurs itérations d'essai.
- **Commande** :

```bash
claude --model fable --effort xhigh --permission-mode plan --max-budget-usd 25 "ultrathink Conçois la mission de rédaction d un chapitre de Calepin. Le contexte transmis provient du composeur existant : bible validée, plan du chapitre, résumés des chapitres précédents, état actuel des personnages, faits canoniques concernés, fils narratifs en cours, extraits strictement nécessaires à la continuité, paramètres de l utilisateur. Exigences de qualité : respect du point de vue, de la focalisation, du temps verbal et du niveau de langue déclarés dans la bible ; aucune invention contredisant un fait canonique ; aucun personnage agissant sur une information qu il ne possède pas ; dialogues distinguables selon la manière de parler de chaque personnage ; pas de sur-explication ni de description générique. Éprouve la mission sur au moins trois plans de chapitre différents et itère sur la prose obtenue avant de conclure. Écris ton plan dans tasks/todo.md avant d agir. Termine par un commit Conventional Commits en anglais."
```

##### CAL-113 · Paramètres de génération avant rédaction
- **État** : ⬜ **À faire**
- **Contenu** : longueur souhaitée, rythme, éléments à accentuer, éléments à éviter, instruction particulière.
- **Fini quand** : chaque paramètre a un effet observable sur le texte produit.
- **Modèle** : `opus` (Claude Opus 5) · **Effort** : `high` · **Complexité** : 2/3
- **Pourquoi ce modèle** : traduire des réglages d'interface en contraintes de prompt réellement efficaces relève de la conception d'instructions, domaine où Opus 5 est adapté ; le cadre littéraire ayant été posé en CAL-112, Fable 5 n'est plus nécessaire ici.
- **Commande** :

```bash
claude --model opus --effort high "Implémente dans Calepin les paramètres de génération d un chapitre : longueur souhaitée, rythme, éléments à accentuer, éléments à éviter, instruction particulière libre. Traduis chaque paramètre en contrainte explicite dans le prompt de rédaction et vérifie par un test comparatif que chaque paramètre a un effet observable sur le texte produit. Conserve les paramètres utilisés dans la trace de génération. Termine par un commit Conventional Commits en anglais."
```

##### CAL-114 · Rédaction en flux et affichage progressif
- **État** : ⬜ **À faire**
- **Contenu** : diffusion du texte au fil de la génération, possibilité de quitter la page sans interrompre, reprise de l'affichage.
- **Fini quand** : fermer l'onglet pendant la rédaction n'interrompt pas la génération.
- **Modèle** : `sonnet` (Claude Sonnet 5) · **Effort** : `high` · **Complexité** : 2/3
- **Pourquoi ce modèle** : transport et affichage au-dessus de l'infrastructure de progression déjà écrite en CAL-062.
- **Commande** :

```bash
claude --model sonnet --effort high "Implémente dans Calepin l affichage progressif de la rédaction d un chapitre : diffusion du texte au fil de la génération dans l éditeur, persistance côté serveur indépendante de la connexion du client, reprise de l affichage au rechargement, aucune interruption de la génération si l utilisateur ferme l onglet. Réutilise l infrastructure de progression existante. Ajoute un test end-to-end. Termine par un commit Conventional Commits en anglais."
```

##### CAL-115 · Contrôle des verrous avant génération
- **État** : ⬜ **À faire**
- **Contenu** : détection d'une instruction utilisateur contredisant un élément verrouillé, avertissement avant lancement, demande de levée.
- **Fini quand** : demander d'écrire une scène dans la cave d'une maison déclarée sans cave déclenche un avertissement avant génération.
- **Modèle** : `opus` (Claude Opus 5) · **Effort** : `xhigh` · **Complexité** : 3/3
- **Pourquoi ce modèle** : exigence 6.5 du cahier des charges. La détection d'une contradiction entre une instruction en langue naturelle et un fait canonique verrouillé, **avant** génération, demande une mission de vérification dédiée et une composition de contexte fine. Opus 5 à `xhigh`.
- **Commande** :

```bash
claude --model opus --effort xhigh --permission-mode plan "ultrathink Implémente dans Calepin le contrôle des verrous avant génération. Avant de lancer une rédaction, une mission dédiée compare l instruction de l utilisateur et le plan du chapitre aux éléments verrouillés de la bible et aux faits canoniques concernés. En cas de contradiction, la génération est suspendue et le système explique la contradiction en citant l élément verrouillé, puis demande si le verrou doit être levé. Exemple à couvrir par un test : demander une scène dans la cave alors qu un fait verrouillé énonce que la maison ne possède pas de cave. Écris ton plan dans tasks/todo.md avant d agir. Termine par un commit Conventional Commits en anglais."
```

##### CAL-116 · Éditeur de manuscrit — structure et navigation
- **État** : ⬜ **À faire**
- **Contenu** : navigation par partie et chapitre, panneau latéral, accès rapide aux personnages et faits associés au chapitre courant.
- **Fini quand** : depuis un chapitre, la fiche d'un personnage présent est atteignable en un clic.
- **Modèle** : `opus` (Claude Opus 5) · **Effort** : `xhigh` · **Complexité** : 3/3
- **Pourquoi ce modèle** : l'éditeur est l'écran le plus complexe du produit et celui où l'utilisateur passera l'essentiel de son temps. Il combine édition riche, panneaux contextuels, performance sur un texte long et accessibilité. Codage agentique complexe multicouche : Opus 5 à `xhigh`.
- **Commande** :

```bash
claude --model opus --effort xhigh --permission-mode plan "ultrathink Crée l éditeur de manuscrit de Calepin : navigation par partie et chapitre dans un panneau latéral, zone d édition de texte riche adaptée à la prose française avec tirets de dialogue et guillemets français, panneau contextuel donnant accès en un clic aux fiches des personnages présents, aux faits canoniques concernés et aux fils narratifs du chapitre courant. Performance : l édition doit rester fluide sur un chapitre de cinq mille mots. Navigation clavier complète et libellés compréhensibles par un lecteur d écran. Écris ton plan dans tasks/todo.md avant d agir. Termine par un commit Conventional Commits en anglais."
```

##### CAL-117 · Sauvegarde automatique et protection contre l'écrasement
- **État** : ⬜ **À faire**
- **Contenu** : sauvegarde périodique et à la perte de focus, détection de modification non sauvegardée, blocage de toute génération qui écraserait du texte non sauvegardé.
- **Fini quand** : lancer une régénération avec des modifications manuelles non sauvegardées est impossible sans avertissement.
- **Modèle** : `opus` (Claude Opus 5) · **Effort** : `xhigh` · **Complexité** : 3/3
- **Pourquoi ce modèle** : exigence 9.2 du cahier des charges, et le type de défaut qui fait abandonner un produit d'écriture. La difficulté est la course entre édition locale, sauvegarde et génération asynchrone. Opus 5 à `xhigh` pour le raisonnement sur la concurrence.
- **Commande** :

```bash
claude --model opus --effort xhigh --permission-mode plan "ultrathink Implémente la sauvegarde automatique du manuscrit de Calepin : sauvegarde périodique et à la perte de focus, indicateur d état enregistré ou en cours, détection fiable des modifications non sauvegardées, et blocage explicite de toute génération ou régénération qui écraserait du texte non sauvegardé. Traite la course entre édition locale, sauvegarde en cours et génération asynchrone : aucune perte de saisie ne doit être possible. Écris ton plan dans tasks/todo.md avant d agir. Ajoute des tests de concurrence édition et génération. Termine par un commit Conventional Commits en anglais."
```

##### CAL-118 · Mode plein écran et compteur de mots
- **État** : ⬜ **À faire**
- **Contenu** : mode d'écriture sans distraction, compteur de mots du chapitre et du manuscrit, progression vers la longueur cible.
- **Fini quand** : le mode plein écran s'active au clavier et masque tous les panneaux.
- **Modèle** : `haiku` (Claude Haiku 4.5) · **Effort** : *n/a* · **Complexité** : 1/3
- **Pourquoi ce modèle** : bascule d'affichage et affichage d'un compteur déjà calculé par la fonction partagée écrite en CAL-041. Tâche courte, cadrée, sans dépendance externe. **Pas de `--effort`.**
- **Commande** :

```bash
claude --model haiku "Ajoute à l éditeur de Calepin un mode plein écran sans distraction activable au clavier qui masque les panneaux latéraux, et un compteur affichant les mots du chapitre courant, le total du manuscrit et la progression vers la longueur cible. Réutilise strictement la fonction de comptage de mots partagée déjà présente dans le dépôt. Termine par un commit Conventional Commits en anglais."
```

##### CAL-119 · Recherche et remplacement dans le manuscrit
- **État** : ⬜ **À faire**
- **Contenu** : recherche transverse à tous les chapitres, remplacement avec aperçu, sensibilité à la casse et aux accents.
- **Fini quand** : renommer un personnage dans tout le manuscrit est possible en une opération contrôlée.
- **Modèle** : `sonnet` (Claude Sonnet 5) · **Effort** : `high` · **Complexité** : 2/3
- **Pourquoi ce modèle** : fonctionnalité classique dont la difficulté (normalisation des accents, aperçu avant application) est bien documentée.
- **Commande** :

```bash
claude --model sonnet --effort high "Implémente la recherche et le remplacement dans le manuscrit de Calepin : recherche transverse à tous les chapitres avec résultats contextualisés, options de sensibilité à la casse et aux accents, remplacement avec aperçu de chaque occurrence avant application, et création d une version avant tout remplacement global. Ajoute les tests avec des textes accentués. Termine par un commit Conventional Commits en anglais."
```

##### CAL-120 · Réécritures ciblées sur sélection — volume et formulation
- **État** : ⬜ **À faire**
- **Contenu** : reformuler, développer une scène, raccourcir une scène, à partir d'un passage sélectionné.
- **Fini quand** : la réécriture d'un passage ne modifie que ce passage et crée une version.
- **Modèle** : `opus` (Claude Opus 5) · **Effort** : `high` · **Complexité** : 3/3
- **Pourquoi ce modèle** : la réécriture ciblée doit conserver la continuité avec l'avant et l'après du passage, ce qui suppose une composition de contexte précise et un raccordement propre. Opus 5 est adapté ; les missions doivent rester séparées conformément au principe 6.2.
- **Commande** :

```bash
claude --model opus --effort high --permission-mode plan "Implémente dans Calepin les réécritures ciblées de volume et de formulation sur un passage sélectionné : reformuler, développer la scène, raccourcir la scène. Chaque opération est une mission distincte avec son propre prompt, jamais un prompt généraliste paramétré. Le contexte transmis inclut le passage, ce qui le précède et ce qui le suit, la section style de la bible et les faits concernés, afin que le raccord reste propre. La réécriture ne modifie que le passage sélectionné et crée une version. Écris ton plan dans tasks/todo.md avant d agir. Termine par un commit Conventional Commits en anglais."
```

##### CAL-121 · Réécritures ciblées sur sélection — dialogue, rythme, point de vue, répétitions
- **État** : ⬜ **À faire**
- **Contenu** : améliorer un dialogue, modifier le rythme, renforcer le point de vue, supprimer une répétition.
- **Fini quand** : améliorer un dialogue tient compte de la manière de parler déclarée de chaque personnage présent.
- **Modèle** : `fable` (Claude Fable 5) · **Effort** : `high` · **Complexité** : 3/3
- **Pourquoi ce modèle** : ce sont les opérations proprement littéraires du produit, celles qui répondent aux défauts « dialogues interchangeables », « tics d'écriture » et « variations injustifiées du temps verbal ». Elles demandent un jugement stylistique que les modèles plus petits rendent générique. Fable 5 pour la conception des quatre missions ; `high` suffit à ce périmètre.
- **Commande** :

```bash
claude --model fable --effort high --permission-mode plan --max-budget-usd 10 "Conçois les quatre missions de réécriture littéraire ciblée de Calepin, chacune séparée avec son propre prompt : améliorer un dialogue en tenant compte de la manière de parler déclarée de chaque personnage présent et en supprimant les répliques interchangeables ; modifier le rythme d un passage sans altérer les faits ; renforcer le point de vue et la focalisation conformément à la bible ; supprimer une répétition lexicale ou un tic d écriture sans appauvrir le texte. Chaque mission reçoit le passage, son entourage, la section style et les fiches des personnages présents. Éprouve chacune sur des passages volontairement défectueux. Écris ton plan dans tasks/todo.md avant d agir. Termine par un commit Conventional Commits en anglais."
```

##### CAL-122 · Régénération non destructive d'un chapitre
- **État** : ⬜ **À faire**
- **Contenu** : nouvelle version complète sans écrasement de la précédente, conservation des instructions utilisées.
- **Fini quand** : après trois régénérations, les quatre versions restent accessibles et restaurables.
- **Modèle** : `sonnet` (Claude Sonnet 5) · **Effort** : `high` · **Complexité** : 2/3
- **Pourquoi ce modèle** : le versionnement a été conçu en amont ; il s'agit ici de l'appliquer correctement. Critère d'acceptation explicite du MVP, donc test obligatoire, mais pas de conception nouvelle.
- **Commande** :

```bash
claude --model sonnet --effort high "Implémente dans Calepin la régénération non destructive d un chapitre : chaque génération crée une nouvelle version conservant la précédente, avec les paramètres et l instruction utilisés, et la possibilité de restaurer n importe quelle version antérieure sans perdre les suivantes. Ajoute un test qui régénère trois fois et vérifie que les quatre versions restent accessibles et restaurables. Termine par un commit Conventional Commits en anglais."
```

##### CAL-123 · Comparaison de versions de chapitre
- **État** : ⬜ **À faire**
- **Contenu** : vue côte à côte ou différentielle, mise en évidence des écarts, restauration depuis la comparaison.
- **Fini quand** : comparer deux versions d'un chapitre de 4 000 mots reste lisible et rapide.
- **Modèle** : `opus` (Claude Opus 5) · **Effort** : `high` · **Complexité** : 3/3
- **Pourquoi ce modèle** : un différentiel de prose n'est pas un différentiel de code — le découpage doit se faire au niveau de la phrase ou du paragraphe pour rester lisible, ce qui demande un choix d'algorithme et de rendu réfléchi. Opus 5.
- **Commande** :

```bash
claude --model opus --effort high --permission-mode plan "Implémente la comparaison de versions de chapitre dans Calepin. Le différentiel doit être calculé au niveau de la phrase et du paragraphe et non du caractère, pour rester lisible sur de la prose. Propose une vue côte à côte et une vue différentielle unifiée, avec restauration possible depuis la comparaison. Performance attendue sur un chapitre de quatre mille mots. Écris ton plan dans tasks/todo.md avant d agir. Termine par un commit Conventional Commits en anglais."
```

##### CAL-124 · Commentaires personnels et statuts de chapitre
- **État** : ⬜ **À faire**
- **Contenu** : notes de l'auteur rattachées à un chapitre ou à un passage, statuts (planifié, à rédiger, génération en cours, premier jet, à corriger, validé, verrouillé).
- **Fini quand** : les commentaires n'apparaissent jamais dans un export de manuscrit.
- **Modèle** : `sonnet` (Claude Sonnet 5) · **Effort** : `high` · **Complexité** : 2/3
- **Pourquoi ce modèle** : fonctionnalité d'annotation classique ; la contrainte d'exclusion à l'export est simple à poser et à tester.
- **Commande** :

```bash
claude --model sonnet --effort high "Implémente dans Calepin les commentaires personnels de l auteur, rattachés à un chapitre ou à un passage précis, et les sept statuts de chapitre planifié, à rédiger, génération en cours, premier jet, à corriger, validé, verrouillé, avec filtrage par statut dans la navigation. Garantis par un test que les commentaires n apparaissent jamais dans un export de manuscrit. Termine par un commit Conventional Commits en anglais."
```

##### CAL-125 · Validation d'un chapitre
- **État** : ⬜ **À faire**
- **Contenu** : action de validation déclenchant l'extraction de faits, la mise à jour des résumés et la transition de statut.
- **Fini quand** : valider un chapitre lance l'analyse de son contenu et propose les faits nouveaux.
- **Modèle** : `opus` (Claude Opus 5) · **Effort** : `high` · **Complexité** : 2/3
- **Pourquoi ce modèle** : point de jonction entre rédaction, mémoire narrative et file asynchrone ; l'orchestration doit être fiable et idempotente.
- **Commande** :

```bash
claude --model opus --effort high "Implémente la validation d un chapitre dans Calepin : action explicite qui déclenche, de façon idempotente et via la file de tâches, l extraction des faits nouveaux, la régénération des résumés court et détaillé, la mise à jour des fils narratifs et la transition du statut de chapitre. L échec d une de ces étapes ne doit pas invalider la validation ni corrompre le chapitre. Ajoute les tests. Termine par un commit Conventional Commits en anglais."
```

---

### E12 — Mémoire narrative et extraction de faits *(Phase 6)*

##### CAL-126 · Mission d'extraction après rédaction
- **État** : ⬜ **À faire**
- **Contenu** : extraction des événements, blessures, déplacements, objets acquis ou perdus, informations découvertes, relations modifiées, promesses narratives, questions ouvertes, état émotionnel, faits nouveaux.
- **Fini quand** : les dix catégories du cahier des charges sont extraites d'un chapitre de référence.
- **Modèle** : `opus` (Claude Opus 5) · **Effort** : `xhigh` · **Complexité** : 3/3
- **Pourquoi ce modèle** : mission d'extraction structurée à dix catégories, exigeant précision et exhaustivité plus que créativité. C'est le cas d'usage central d'Opus 5 : codage agentique complexe sur une tâche spécifiée. Fable 5 serait ici du surcoût — l'extraction n'est pas un problème ouvert.
- **Commande** :

```bash
claude --model opus --effort xhigh --permission-mode plan "ultrathink Conçois la mission d extraction de mémoire narrative de Calepin, exécutée après validation d un chapitre. Elle extrait dix catégories : événements survenus, blessures, déplacements, objets acquis ou perdus, informations découvertes et par qui, relations modifiées, promesses narratives faites au lecteur, questions laissées ouvertes, état émotionnel de chaque personnage présent, faits nouveaux atomiques. Chaque élément extrait cite le passage qui le fonde. Les faits nouveaux respectent la règle d atomicité déjà en vigueur. Schéma de sortie strict. Éprouve la mission sur des chapitres de référence. Écris ton plan dans tasks/todo.md avant d agir. Termine par un commit Conventional Commits en anglais."
```

##### CAL-127 · Détection des conflits avec la bible
- **État** : ⬜ **À faire**
- **Contenu** : comparaison des faits nouveaux aux faits canoniques existants, identification des contradictions, refus d'écriture automatique.
- **Fini quand** : un fait nouveau contredisant un fait verrouillé n'est jamais écrit automatiquement.
- **Modèle** : `opus` (Claude Opus 5) · **Effort** : `xhigh` · **Complexité** : 3/3
- **Pourquoi ce modèle** : exigence 5.9 du cahier des charges et critère d'acceptation du MVP. La comparaison sémantique de deux faits en langue naturelle, en tenant compte de la portée temporelle et de la connaissance par personnage, est le raisonnement le plus exigeant du produit après la conception du modèle lui-même.
- **Commande** :

```bash
claude --model opus --effort xhigh --permission-mode plan "ultrathink Implémente dans Calepin la détection des conflits entre les faits nouveaux extraits d un chapitre et les faits canoniques existants. La comparaison doit tenir compte des trois dimensions du modèle de faits : valeur de vérité dans le monde, validité temporelle, connaissance par personnage. Un fait qui devient faux après un événement n est pas une contradiction ; un fait qui contredit un fait permanent en est une. Un fait nouveau contredisant un élément verrouillé n est jamais écrit automatiquement : le conflit est présenté à l utilisateur. Écris ton plan dans tasks/todo.md avant d agir. Ajoute des tests couvrant contradiction réelle, évolution temporelle légitime et asymétrie de connaissance. Termine par un commit Conventional Commits en anglais."
```

##### CAL-128 · Écran d'arbitrage des faits proposés
- **État** : ⬜ **À faire**
- **Contenu** : présentation des faits nouveaux, des conflits détectés, choix accepter / modifier / refuser, explication du conflit.
- **Fini quand** : arbitrer dix faits proposés après un chapitre prend moins de deux minutes.
- **Modèle** : `sonnet` (Claude Sonnet 5) · **Effort** : `high` · **Complexité** : 2/3
- **Pourquoi ce modèle** : écran de revue et d'action ; toute l'intelligence est en amont, l'interface doit surtout être rapide à parcourir.
- **Commande** :

```bash
claude --model sonnet --effort high "Crée l écran d arbitrage des faits proposés de Calepin, affiché après validation d un chapitre : liste des faits nouveaux extraits avec leur passage source, mise en évidence des conflits avec la bible et explication du conflit en langage clair, actions accepter, modifier avant acceptation ou refuser, et action groupée pour les faits sans conflit. Parcourir dix faits doit prendre moins de deux minutes. Navigation clavier complète. Termine par un commit Conventional Commits en anglais."
```

##### CAL-129 · Suivi de l'état des personnages
- **État** : ⬜ **À faire**
- **Contenu** : état courant de chaque personnage (localisation, état physique, état émotionnel, possessions) mis à jour chapitre par chapitre.
- **Fini quand** : l'état d'un personnage au chapitre 12 est consultable et alimente le contexte de rédaction du chapitre 13.
- **Modèle** : `opus` (Claude Opus 5) · **Effort** : `xhigh` · **Complexité** : 3/3
- **Pourquoi ce modèle** : c'est la mémoire qui empêche les personnages d'évoluer sans justification et les blessures d'être oubliées — deux défauts nommément visés par le cahier des charges. Modéliser un état temporel par personnage et le reconstituer à n'importe quel point du récit demande un raisonnement structurel soigné.
- **Commande** :

```bash
claude --model opus --effort xhigh --permission-mode plan "ultrathink Implémente le suivi de l état des personnages dans Calepin : pour chaque personnage et à chaque chapitre, localisation, état physique incluant blessures et leur guérison, état émotionnel, possessions, informations connues. L état doit être reconstituable à n importe quel point du récit et alimenter automatiquement le contexte de rédaction du chapitre suivant. La reconstitution doit rester correcte après restauration d une version antérieure de chapitre. Écris ton plan dans tasks/todo.md avant d agir. Ajoute les tests de reconstitution. Termine par un commit Conventional Commits en anglais."
```

##### CAL-130 · Mise à jour des fils narratifs après rédaction
- **État** : ⬜ **À faire**
- **Contenu** : détection des fils ouverts, poursuivis et fermés par le chapitre validé, écart avec le plan.
- **Fini quand** : un fil que le plan prévoyait de fermer et que le texte laisse ouvert est signalé.
- **Modèle** : `opus` (Claude Opus 5) · **Effort** : `high` · **Complexité** : 2/3
- **Pourquoi ce modèle** : comparaison entre intention (plan) et réalisation (texte), qui suppose de juger si un fil est effectivement fermé dans la prose. Opus 5 sur une mission cadrée.
- **Commande** :

```bash
claude --model opus --effort high "Implémente dans Calepin la mise à jour des fils narratifs après validation d un chapitre : détermine à partir du texte réellement écrit quels fils ont été ouverts, poursuivis ou fermés, compare au plan du chapitre, et signale les écarts, notamment un fil que le plan prévoyait de fermer et que le texte laisse ouvert. Le signalement est informatif et ne modifie ni le plan ni le texte. Termine par un commit Conventional Commits en anglais."
```

##### CAL-131 · Suivi des connaissances par personnage
- **État** : ⬜ **À faire**
- **Contenu** : qui sait quoi et depuis quel chapitre ; détection d'une connaissance injustifiée.
- **Fini quand** : un personnage utilisant une information qu'il n'a jamais apprise est signalé.
- **Modèle** : `opus` (Claude Opus 5) · **Effort** : `xhigh` · **Complexité** : 3/3
- **Pourquoi ce modèle** : « connaissance injustifiée » figure explicitement dans les défauts à détecter, et c'est le plus difficile de la liste : il faut suivre la propagation de l'information entre personnages à travers tout le récit. Raisonnement structurel exigeant : Opus 5 à `xhigh`.
- **Commande** :

```bash
claude --model opus --effort xhigh --permission-mode plan "ultrathink Implémente dans Calepin le suivi des connaissances par personnage : pour chaque information, qui la connaît, depuis quel chapitre et par quel moyen elle a été apprise, en suivant la propagation entre personnages, y compris les transmissions indirectes et les mensonges. Expose une requête qui, pour un chapitre donné, retourne ce que chaque personnage présent est censé savoir. Implémente la détection de connaissance injustifiée : un personnage agissant sur une information qu il n a jamais apprise. Écris ton plan dans tasks/todo.md avant d agir. Ajoute des tests couvrant transmission directe, indirecte et information fausse. Termine par un commit Conventional Commits en anglais."
```

##### CAL-132 · Suivi des objets, blessures et déplacements
- **État** : ⬜ **À faire**
- **Contenu** : registre des objets importants et de leur possesseur, des blessures et de leur guérison, des déplacements entre lieux.
- **Fini quand** : un objet détruit puis réapparu est détectable, ainsi qu'un déplacement impossible dans le temps imparti.
- **Modèle** : `opus` (Claude Opus 5) · **Effort** : `high` · **Complexité** : 3/3
- **Pourquoi ce modèle** : ces trois registres alimentent directement quatre des huit contrôles de continuité factuelle du cahier des charges ; leur modélisation doit être pensée pour ces contrôles et non seulement pour l'affichage.
- **Commande** :

```bash
claude --model opus --effort high --permission-mode plan "Implémente dans Calepin le suivi des objets, blessures et déplacements : registre des objets importants avec possesseur, état et destruction éventuelle ; registre des blessures avec gravité, chapitre de survenue et guérison ; registre des déplacements entre lieux avec durée. Conçois ces registres pour rendre détectables un objet réapparaissant après sa destruction, une blessure oubliée et un déplacement impossible dans le temps imparti. Écris ton plan dans tasks/todo.md avant d agir. Termine par un commit Conventional Commits en anglais."
```

##### CAL-133 · Mise à jour de la chronologie après rédaction
- **État** : ⬜ **À faire**
- **Contenu** : intégration des événements racontés dans la chronologie, recalcul des durées et des âges.
- **Fini quand** : la chronologie reflète le texte écrit et non seulement le plan prévu.
- **Modèle** : `opus` (Claude Opus 5) · **Effort** : `high` · **Complexité** : 2/3
- **Pourquoi ce modèle** : extension de la logique conçue en CAL-093 aux événements réellement racontés, avec la même exigence de validation arithmétique.
- **Commande** :

```bash
claude --model opus --effort high "Implémente dans Calepin la mise à jour de la chronologie après validation d un chapitre : intégration des événements réellement racontés en distinguant prévu et raconté, recalcul des durées entre événements et des âges des personnages, réexécution de la validation arithmétique existante et signalement de toute incohérence introduite par le chapitre. Termine par un commit Conventional Commits en anglais."
```

##### CAL-134 · Recalcul de la mémoire après restauration de version
- **État** : ⬜ **À faire**
- **Contenu** : reconstitution complète de la mémoire narrative lorsqu'une version antérieure de chapitre est restaurée.
- **Fini quand** : restaurer la version 1 du chapitre 5 rétablit exactement l'état de mémoire correspondant.
- **Modèle** : `fable` (Claude Fable 5) · **Effort** : `xhigh` · **Complexité** : 3/3
- **Pourquoi ce modèle** : c'est le point le plus piégeux de toute la mémoire narrative — les faits, états, connaissances et fils dérivés d'un chapitre doivent être défaits sans casser ceux qui viennent d'ailleurs, et les chapitres postérieurs peuvent en dépendre. Problème ambigu à conséquences en cascade, sans solution évidente : profil Fable 5. Budget plafonné.
- **Commande** :

```bash
claude --model fable --effort xhigh --permission-mode plan --max-budget-usd 15 "ultrathink Conçois et implémente le recalcul de la mémoire narrative de Calepin après restauration d une version antérieure de chapitre. Les faits canoniques, états de personnages, connaissances, objets, blessures, déplacements et fils narratifs dérivés du chapitre restauré doivent être défaits et recalculés, sans détruire ceux qui proviennent d autres chapitres, et en signalant les chapitres postérieurs dont la validité dépendait de la version remplacée. Choisis entre recalcul complet et recalcul incrémental en justifiant le choix dans un ADR. Écris ton plan dans tasks/todo.md avant d agir. Ajoute des tests de restauration en milieu de manuscrit. Termine par un commit Conventional Commits en anglais."
```

---

### E13 — Contrôle de cohérence et audits qualité *(Phase 6)*

##### CAL-135 · Socle du moteur d'audit
- **État** : ⬜ **À faire**
- **Contenu** : architecture des contrôles enfichables, modèle de problème (catégorie, gravité, explication, passages, correction proposée, statut), exécution ciblée ou complète.
- **Fini quand** : ajouter un nouveau contrôle ne demande aucune modification du moteur.
- **Modèle** : `fable` (Claude Fable 5) · **Effort** : `xhigh` · **Complexité** : 3/3
- **Pourquoi ce modèle** : le moteur doit accueillir cinq familles de contrôles très hétérogènes — certaines déterministes et calculables, d'autres relevant du jugement littéraire — et rester extensible. C'est une décision d'architecture à conséquences durables sur un problème mal posé au départ, exactement le terrain où l'investigation préalable de Fable 5 est rentable. Budget plafonné.
- **Commande** :

```bash
claude --model fable --effort xhigh --permission-mode plan --max-budget-usd 15 "ultrathink Conçois et implémente le socle du moteur de contrôle de cohérence de Calepin. Il doit accueillir des contrôles enfichables de deux natures : contrôles déterministes calculables sur la mémoire narrative, et contrôles reposant sur une mission de modèle pour ce qui relève du jugement. Chaque problème produit porte une catégorie parmi continuité factuelle, continuité psychologique, structure, style et originalité, une gravité, une explication, les passages concernés, une proposition de correction et un statut parmi détecté, accepté, à corriger, corrigé, ignoré. Le moteur doit permettre l exécution ciblée sur un chapitre comme l audit complet, et l ajout d un nouveau contrôle sans le modifier. Écris ton plan dans tasks/todo.md avant d agir. Termine par un commit Conventional Commits en anglais."
```

##### CAL-136 · Contrôles de continuité factuelle
- **État** : ⬜ **À faire**
- **Contenu** : changement de nom, âge incompatible, lieu impossible, objet réapparu après destruction, erreur de date, durée incohérente, blessure oubliée, connaissance injustifiée.
- **Fini quand** : les huit contrôles du cahier des charges sont implémentés et couverts par des tests à cas positif et négatif.
- **Modèle** : `opus` (Claude Opus 5) · **Effort** : `xhigh` · **Complexité** : 3/3
- **Pourquoi ce modèle** : ces huit contrôles sont majoritairement calculables sur les registres construits en E12 ; la difficulté est la rigueur et l'exhaustivité, pas l'ambiguïté. Opus 5 est le bon niveau, et évite le surcoût de Fable 5 sur un travail spécifié.
- **Commande** :

```bash
claude --model opus --effort xhigh --permission-mode plan "ultrathink Implémente les huit contrôles de continuité factuelle de Calepin en t appuyant sur la mémoire narrative existante : changement de nom d un personnage, âge incompatible avec la chronologie, présence dans un lieu impossible, objet réapparaissant après sa destruction, erreur de date, durée incohérente entre deux événements, blessure oubliée, connaissance injustifiée. Privilégie le calcul déterministe partout où il est possible et ne recours à une mission de modèle que pour ce qui ne l est pas. Chaque contrôle cite les passages concernés et propose une correction. Écris ton plan dans tasks/todo.md avant d agir. Ajoute pour chaque contrôle un test à cas positif et un test à cas négatif. Termine par un commit Conventional Commits en anglais."
```

##### CAL-137 · Contrôles de continuité psychologique
- **État** : ⬜ **À faire**
- **Contenu** : changement brutal de motivation, réaction incompatible avec le personnage, décision non préparée, évolution trop rapide.
- **Fini quand** : les quatre contrôles s'appuient sur la fiche de personnage et citent l'élément de fiche contredit.
- **Modèle** : `fable` (Claude Fable 5) · **Effort** : `high` · **Complexité** : 3/3
- **Pourquoi ce modèle** : juger qu'une réaction est incompatible avec un personnage n'est pas calculable — il faut confronter la prose à un désir, un besoin, une peur et une contradiction déclarés. C'est un jugement littéraire fin, où un modèle plus petit produit soit du faux positif massif, soit du silence. Fable 5, budget plafonné.
- **Commande** :

```bash
claude --model fable --effort high --permission-mode plan --max-budget-usd 10 "Conçois les quatre contrôles de continuité psychologique de Calepin : changement brutal de motivation, réaction incompatible avec le personnage, décision non préparée, évolution trop rapide. Chaque contrôle confronte le texte du chapitre à la fiche du personnage, désir apparent, besoin profond, peur, contradiction, évolution prévue, et à son état émotionnel courant. Chaque signalement doit citer le passage et l élément de fiche contredit, et rester assez conservateur pour ne pas noyer l utilisateur sous les faux positifs. Éprouve les contrôles sur des chapitres volontairement incohérents et sur des chapitres corrects. Écris ton plan dans tasks/todo.md avant d agir. Termine par un commit Conventional Commits en anglais."
```

##### CAL-138 · Contrôles de structure
- **État** : ⬜ **À faire**
- **Contenu** : chapitre sans conséquence, répétition d'un même enjeu, absence de progression, révélation prématurée, résolution tardive ou précipitée, fil narratif abandonné.
- **Fini quand** : les six contrôles s'exécutent sur l'ensemble du manuscrit et citent les chapitres concernés.
- **Modèle** : `fable` (Claude Fable 5) · **Effort** : `xhigh` · **Complexité** : 3/3
- **Pourquoi ce modèle** : ces contrôles portent sur la totalité du manuscrit, pas sur un passage ; juger de l'absence de progression demande de tenir cinquante chapitres à la fois. La documentation officielle décrit Fable 5 comme tenant les sessions longues sans perdre le fil, ce qui est exactement la contrainte ici. Budget plafonné.
- **Commande** :

```bash
claude --model fable --effort xhigh --permission-mode plan --max-budget-usd 15 "ultrathink Conçois les six contrôles de structure de Calepin, exécutés sur l ensemble du manuscrit à partir des résumés et de la mémoire narrative plutôt que du texte intégral : chapitre sans conséquence, répétition d un même enjeu, absence de progression, révélation prématurée, résolution tardive ou précipitée, fil narratif abandonné. Chaque signalement cite les chapitres concernés, explique en quoi la structure est affaiblie et propose une correction. Écris ton plan dans tasks/todo.md avant d agir. Termine par un commit Conventional Commits en anglais."
```

##### CAL-139 · Contrôles de style
- **État** : ⬜ **À faire**
- **Contenu** : répétitions lexicales, tics d'écriture, dialogues interchangeables, sur-explication, descriptions génériques, métaphores répétitives, variations injustifiées du temps verbal.
- **Fini quand** : les sept contrôles fonctionnent, dont au moins trois de façon déterministe.
- **Modèle** : `opus` (Claude Opus 5) · **Effort** : `xhigh` · **Complexité** : 3/3
- **Pourquoi ce modèle** : plusieurs de ces contrôles sont partiellement calculables (fréquences lexicales, ratio dialogue/narration, cohérence du temps verbal) ; les autres demandent un jugement modéré. Opus 5 gère bien cette combinaison de statistique textuelle et d'appréciation, à un coût de sortie deux fois inférieur à Fable 5 pour une mission exécutée souvent.
- **Commande** :

```bash
claude --model opus --effort xhigh --permission-mode plan "ultrathink Implémente les sept contrôles de style de Calepin : répétitions lexicales, tics d écriture, dialogues interchangeables, sur-explication, descriptions génériques, métaphores répétitives, variations injustifiées du temps verbal. Implémente de façon déterministe tout ce qui est calculable, notamment les fréquences lexicales anormales au regard du français courant, la détection des variations de temps verbal et les tournures répétées d un chapitre à l autre. Réserve la mission de modèle aux dialogues interchangeables, à la sur-explication et aux descriptions génériques, en confrontant le texte à la section style de la bible. Écris ton plan dans tasks/todo.md avant d agir. Ajoute les tests. Termine par un commit Conventional Commits en anglais."
```

##### CAL-140 · Contrôles d'originalité
- **État** : ⬜ **À faire**
- **Contenu** : scène très attendue, trope utilisé sans transformation, antagoniste caricatural, retournement prévisible, personnage uniquement fonctionnel, résolution reposant sur une coïncidence.
- **Fini quand** : chaque signalement est argumenté et rattaché à un élément précis, sans score global.
- **Modèle** : `fable` (Claude Fable 5) · **Effort** : `xhigh` · **Complexité** : 3/3
- **Pourquoi ce modèle** : reconnaître un trope non transformé ou un retournement prévisible suppose une culture littéraire étendue — le critère de choix officiel pour Fable 5 est le « spécialiste qui a vu des problèmes que presque personne n'a vus ». Le cahier des charges interdit par ailleurs formellement le score d'originalité, ce qui impose une critique argumentée que seul un modèle de ce niveau produit sans platitude. Budget plafonné.
- **Commande** :

```bash
claude --model fable --effort xhigh --permission-mode plan --max-budget-usd 15 "ultrathink Conçois les six contrôles d originalité de Calepin : scène très attendue, trope utilisé sans transformation, antagoniste caricatural, retournement prévisible, personnage uniquement fonctionnel, résolution reposant sur une coïncidence. Contrainte impérative du cahier des charges : ne jamais produire de score d originalité ni présenter un résultat comme une garantie de singularité ; chaque remarque doit être argumentée et rattachée à un élément précis du projet, et proposer une transformation concrète plutôt qu un simple constat. Éprouve les contrôles sur des passages volontairement convenus et sur des passages singuliers pour calibrer le taux de faux positifs. Écris ton plan dans tasks/todo.md avant d agir. Termine par un commit Conventional Commits en anglais."
```

##### CAL-141 · Écran des problèmes détectés
- **État** : ⬜ **À faire**
- **Contenu** : liste filtrable par catégorie, gravité et statut, accès direct au passage concerné, proposition de correction.
- **Fini quand** : depuis un problème, le passage concerné s'ouvre dans l'éditeur en un clic.
- **Modèle** : `sonnet` (Claude Sonnet 5) · **Effort** : `high` · **Complexité** : 2/3
- **Pourquoi ce modèle** : écran de liste et de navigation au-dessus d'un modèle déjà défini ; aucune conception nouvelle.
- **Commande** :

```bash
claude --model sonnet --effort high "Crée l écran des problèmes détectés de Calepin : liste filtrable par catégorie, gravité et statut, avec pour chaque problème son explication, les passages concernés, la proposition de correction et les actions de changement de statut. Un clic sur un problème ouvre le passage concerné dans l éditeur. La gravité ne doit pas être signalée par la seule couleur. Termine par un commit Conventional Commits en anglais."
```

##### CAL-142 · Cycle de vie d'un problème
- **État** : ⬜ **À faire**
- **Contenu** : statuts détecté, accepté, à corriger, corrigé, ignoré ; persistance entre deux audits ; non-réapparition d'un problème ignoré.
- **Fini quand** : relancer un audit ne ressuscite pas les problèmes déjà ignorés.
- **Modèle** : `opus` (Claude Opus 5) · **Effort** : `high` · **Complexité** : 3/3
- **Pourquoi ce modèle** : identifier de façon stable « le même problème » d'un audit à l'autre, alors que le texte a changé entre-temps, est un problème de déduplication non trivial ; sans lui, l'audit devient inutilisable au bout de trois exécutions.
- **Commande** :

```bash
claude --model opus --effort high --permission-mode plan "Implémente le cycle de vie des problèmes qualité de Calepin : statuts détecté, accepté, à corriger, corrigé, ignoré. Le point difficile est l identité stable d un problème d un audit à l autre alors que le texte a changé : conçois une clé d identité fondée sur la catégorie, la cible narrative et la substance du problème plutôt que sur la position dans le texte, afin qu un problème ignoré ne réapparaisse pas et qu un problème corrigé soit reconnu comme résolu. Écris ton plan dans tasks/todo.md avant d agir. Ajoute des tests sur deux audits successifs avec texte modifié. Termine par un commit Conventional Commits en anglais."
```

##### CAL-143 · Correction ciblée d'un problème
- **État** : ⬜ **À faire**
- **Contenu** : mission dédiée corrigeant un problème précis sans réécrire le chapitre entier, création de version.
- **Fini quand** : corriger une répétition lexicale ne modifie pas le reste du chapitre.
- **Modèle** : `opus` (Claude Opus 5) · **Effort** : `high` · **Complexité** : 3/3
- **Pourquoi ce modèle** : mission distincte exigée par le principe 6.2, dont la difficulté est la minimalité de l'intervention. Opus 5 respecte mieux les contraintes de non-débordement que les modèles plus petits, qui tendent à réécrire largement.
- **Commande** :

```bash
claude --model opus --effort high --permission-mode plan "Implémente dans Calepin la correction ciblée d un problème détecté : mission dédiée qui reçoit le problème, sa proposition de correction, le passage concerné et son entourage, et produit une correction minimale sans réécrire le chapitre entier. La correction crée une version et est présentée en comparaison avant acceptation. Ajoute un test vérifiant qu une correction de répétition lexicale ne modifie que les occurrences visées. Écris ton plan dans tasks/todo.md avant d agir. Termine par un commit Conventional Commits en anglais."
```

##### CAL-144 · Audit complet du manuscrit
- **État** : ⬜ **À faire**
- **Contenu** : exécution des cinq familles de contrôles sur tout le manuscrit, en tâche asynchrone, avec estimation préalable et rapport de synthèse.
- **Fini quand** : l'audit d'un manuscrit de trente chapitres aboutit sans dépasser le budget annoncé.
- **Modèle** : `opus` (Claude Opus 5) · **Effort** : `xhigh` · **Complexité** : 3/3
- **Pourquoi ce modèle** : orchestration coûteuse combinant file, budget, estimation préalable et agrégation de résultats hétérogènes. C'est de l'ingénierie d'orchestration, pas du jugement littéraire — les missions littéraires sont déjà déléguées à leurs modèles respectifs par le registre.
- **Commande** :

```bash
claude --model opus --effort xhigh --permission-mode plan "ultrathink Implémente l audit complet du manuscrit de Calepin : exécution des cinq familles de contrôles sur l ensemble du manuscrit en tâche asynchrone, avec estimation de durée et de coût affichée et confirmée avant lancement, progression détaillée, exécution incrémentale ne réanalysant pas les chapitres inchangés depuis le dernier audit, et rapport de synthèse hiérarchisé par gravité. Chaque contrôle utilise le modèle déclaré pour sa mission dans le registre. Écris ton plan dans tasks/todo.md avant d agir. Termine par un commit Conventional Commits en anglais."
```

##### CAL-145 · Affichage des problèmes dans l'éditeur
- **État** : ⬜ **À faire**
- **Contenu** : soulignement des passages concernés dans le texte, panneau contextuel, action de correction directe.
- **Fini quand** : les problèmes du chapitre courant sont visibles pendant l'écriture sans quitter l'éditeur.
- **Modèle** : `sonnet` (Claude Sonnet 5) · **Effort** : `high` · **Complexité** : 2/3
- **Pourquoi ce modèle** : intégration d'affichage dans un éditeur déjà construit ; travail d'interface sans conception nouvelle.
- **Commande** :

```bash
claude --model sonnet --effort high "Intègre l affichage des problèmes détectés dans l éditeur de Calepin : soulignement discret des passages concernés, panneau contextuel donnant l explication et la proposition de correction, action de correction directe et action d ignorer. L affichage doit rester lisible quand un chapitre porte dix problèmes et ne doit pas gêner l écriture. Termine par un commit Conventional Commits en anglais."
```

---

### E14 — Versionnement et historique *(Phase 5)*

##### CAL-146 · Socle générique de versionnement
- **État** : ⬜ **À faire**
- **Contenu** : mécanisme réutilisable versionnant texte source, analyse, direction, bible, plan, chapitres, résumés, titre et textes de publication.
- **Fini quand** : les neuf types d'entité listés par le cahier des charges sont versionnés par le même mécanisme.
- **Modèle** : `fable` (Claude Fable 5) · **Effort** : `xhigh` · **Complexité** : 3/3
- **Pourquoi ce modèle** : versionner neuf types d'entités hétérogènes — dont certaines sont des arbres et d'autres du texte brut — avec restauration sans perte des versions suivantes est un problème d'architecture ouvert. Le mauvais choix ici se paie sur toute la durée du projet. Fable 5 pour la décision, budget plafonné.
- **Commande** :

```bash
claude --model fable --effort xhigh --permission-mode plan --max-budget-usd 15 "ultrathink Conçois et implémente le socle générique de versionnement de Calepin. Il doit couvrir neuf types d entités hétérogènes : texte source, analyse, direction, bible, plan, chapitre, résumé, titre, textes de publication, dont certaines sont des arbres et d autres du texte. Il doit permettre de consulter l historique, comparer deux versions, restaurer une version antérieure sans perdre les suivantes, nommer une version et créer un point de sauvegarde. Arbitre entre instantané complet et différentiel en tenant compte du volume d un roman et justifie le choix dans un ADR. Écris ton plan dans tasks/todo.md avant d agir. Termine par un commit Conventional Commits en anglais."
```

##### CAL-147 · Historique consultable par entité
- **État** : ⬜ **À faire**
- **Contenu** : liste des versions avec date, auteur, origine (génération ou modification manuelle), aperçu.
- **Fini quand** : l'historique de la bible et celui d'un chapitre s'affichent avec le même composant.
- **Modèle** : `sonnet` (Claude Sonnet 5) · **Effort** : `high` · **Complexité** : 2/3
- **Pourquoi ce modèle** : composant d'affichage générique au-dessus du socle déjà conçu.
- **Commande** :

```bash
claude --model sonnet --effort high "Crée le composant d historique de versions de Calepin, réutilisable pour toutes les entités versionnées : liste des versions avec date, auteur, origine génération ou modification manuelle, nom éventuel et aperçu. Vérifie qu il fonctionne à l identique sur la bible et sur un chapitre. Termine par un commit Conventional Commits en anglais."
```

##### CAL-148 · Comparaison générique de deux versions
- **État** : ⬜ **À faire**
- **Contenu** : comparaison adaptée au type d'entité — différentiel de prose pour les chapitres, différentiel structuré pour la bible et le plan.
- **Fini quand** : comparer deux versions de bible met en évidence les champs modifiés, pas un différentiel de JSON brut.
- **Modèle** : `opus` (Claude Opus 5) · **Effort** : `high` · **Complexité** : 3/3
- **Pourquoi ce modèle** : rendre lisible la comparaison de structures imbriquées demande une conception de rendu spécifique par type ; un différentiel brut serait inutilisable pour un auteur non technique.
- **Commande** :

```bash
claude --model opus --effort high --permission-mode plan "Implémente la comparaison générique de versions dans Calepin, avec un rendu adapté au type d entité : différentiel au niveau de la phrase pour les chapitres, différentiel structuré champ par champ pour la bible, le plan et l analyse, présenté en vocabulaire métier et non en JSON. Un auteur non technique doit comprendre ce qui a changé. Écris ton plan dans tasks/todo.md avant d agir. Termine par un commit Conventional Commits en anglais."
```

##### CAL-149 · Restauration d'une version
- **État** : ⬜ **À faire**
- **Contenu** : restauration créant une nouvelle version plutôt qu'un retour destructif, avec avertissement sur les conséquences.
- **Fini quand** : restaurer une version antérieure ne supprime aucune version postérieure.
- **Modèle** : `opus` (Claude Opus 5) · **Effort** : `high` · **Complexité** : 3/3
- **Pourquoi ce modèle** : exigence 4.6 du cahier des charges et point d'articulation avec le recalcul de mémoire de CAL-134. La cohérence entre les deux mécanismes doit être garantie.
- **Commande** :

```bash
claude --model opus --effort high --permission-mode plan "Implémente la restauration de version dans Calepin : la restauration crée une nouvelle version reprenant le contenu de l ancienne plutôt qu un retour destructif, aucune version postérieure n est supprimée, et l utilisateur est averti des conséquences en aval, notamment le recalcul de mémoire narrative lorsqu il s agit d un chapitre. Assure la cohérence avec le mécanisme de recalcul de mémoire existant. Écris ton plan dans tasks/todo.md avant d agir. Ajoute les tests. Termine par un commit Conventional Commits en anglais."
```

##### CAL-150 · Nommage d'une version
- **État** : ⬜ **À faire**
- **Contenu** : libellé libre attribué à une version, recherche par nom.
- **Fini quand** : une version nommée est retrouvable depuis l'historique.
- **Modèle** : `haiku` (Claude Haiku 4.5) · **Effort** : *n/a* · **Complexité** : 1/3
- **Pourquoi ce modèle** : ajout d'un champ, d'un formulaire et d'un filtre sur des composants existants. Aucune conception, aucune dépendance externe : le créneau exact de Haiku 4.5. **Pas de `--effort`.**
- **Commande** :

```bash
claude --model haiku "Ajoute à Calepin le nommage des versions : champ de libellé libre attribuable à une version depuis l historique, affichage du nom dans la liste des versions, recherche par nom. Réutilise strictement le composant d historique existant. Termine par un commit Conventional Commits en anglais."
```

##### CAL-151 · Points de sauvegarde de projet
- **État** : ⬜ **À faire**
- **Contenu** : instantané cohérent de toutes les entités d'un projet à un instant donné, restauration globale.
- **Fini quand** : restaurer un point de sauvegarde rétablit un projet entièrement cohérent, mémoire narrative comprise.
- **Modèle** : `opus` (Claude Opus 5) · **Effort** : `xhigh` · **Complexité** : 3/3
- **Pourquoi ce modèle** : instantané transactionnel sur une dizaine d'entités liées, avec restauration cohérente — problème de rigueur transactionnelle où une entité oubliée produit un projet corrompu.
- **Commande** :

```bash
claude --model opus --effort xhigh --permission-mode plan "ultrathink Implémente les points de sauvegarde de projet dans Calepin : instantané cohérent et daté de toutes les entités du projet, texte source, analyse, direction, bible, mémoire narrative, plan, chapitres et versions, créé de façon transactionnelle. La restauration doit rétablir un projet entièrement cohérent, y compris la mémoire narrative dérivée, sans laisser d entité orpheline. Recense exhaustivement les entités concernées avant d implémenter. Écris ton plan dans tasks/todo.md avant d agir. Ajoute un test de restauration complète. Termine par un commit Conventional Commits en anglais."
```

##### CAL-152 · Rétention et purge des versions
- **État** : ⬜ **À faire**
- **Contenu** : politique de conservation configurable, purge des versions intermédiaires anciennes, protection des versions nommées.
- **Fini quand** : la purge ne supprime jamais une version nommée ni un point de sauvegarde.
- **Modèle** : `sonnet` (Claude Sonnet 5) · **Effort** : `high` · **Complexité** : 2/3
- **Pourquoi ce modèle** : règle de rétention déterministe, entièrement testable ; le risque est couvert par des tests explicites.
- **Commande** :

```bash
claude --model sonnet --effort high "Implémente la politique de rétention des versions de Calepin : conservation configurable des versions intermédiaires, purge planifiée des plus anciennes au-delà du seuil, protection absolue des versions nommées, des points de sauvegarde et de la version courante. Ajoute un test qui vérifie qu aucune version protégée n est purgée. Termine par un commit Conventional Commits en anglais."
```

##### CAL-153 · Journal d'activité du projet
- **État** : ⬜ **À faire**
- **Contenu** : chronologie des actions (générations, validations, modifications, restaurations, exports) consultable par l'auteur.
- **Fini quand** : l'auteur peut retracer ce qui s'est passé sur son projet sans contenu littéraire dans le journal.
- **Modèle** : `sonnet` (Claude Sonnet 5) · **Effort** : `high` · **Complexité** : 2/3
- **Pourquoi ce modèle** : agrégation et affichage de traces déjà persistées ; travail dérivé.
- **Commande** :

```bash
claude --model sonnet --effort high "Crée le journal d activité de projet de Calepin : chronologie lisible des générations, validations, modifications manuelles, restaurations de version et exports, avec filtrage par type et par période. Il s appuie sur les traces déjà persistées et ne doit contenir aucun extrait de contenu littéraire. Termine par un commit Conventional Commits en anglais."
```

---

### E15 — Export du manuscrit *(Phase 6)*

##### CAL-154 · Moteur d'export — options et sélection
- **État** : ⬜ **À faire**
- **Contenu** : choix du titre, du nom d'auteur, des chapitres inclus, de la table des matières, des numéros de chapitre, de la page de titre, des sauts de page, des métadonnées et des notes.
- **Fini quand** : les neuf options du cahier des charges sont exposées et prises en compte par tous les formats.
- **Modèle** : `opus` (Claude Opus 5) · **Effort** : `high` · **Complexité** : 2/3
- **Pourquoi ce modèle** : la conception du modèle d'export conditionne l'ajout ultérieur de PDF, EPUB, HTML et texte brut ; il faut séparer proprement la composition du document de son rendu. Opus 5 pour l'anticipation de l'extension.
- **Commande** :

```bash
claude --model opus --effort high --permission-mode plan "Conçois le moteur d export de Calepin. Sépare strictement la composition du document, sélection des chapitres et structure logique, de son rendu par format. Expose les options du cahier des charges : titre, nom de l auteur, chapitres inclus, table des matières, numéros de chapitre, page de titre, sauts de page, métadonnées, notes éventuelles. Conçois l architecture pour que l ajout ultérieur de PDF, EPUB, HTML et texte brut ne demande qu un nouveau rendu. Écris ton plan dans tasks/todo.md avant d agir. Termine par un commit Conventional Commits en anglais."
```

##### CAL-155 · Export Markdown
- **État** : ⬜ **À faire**
- **Contenu** : rendu Markdown du manuscrit avec titres de chapitres, table des matières optionnelle, métadonnées en en-tête.
- **Fini quand** : le fichier produit s'ouvre correctement dans un éditeur Markdown standard.
- **Modèle** : `sonnet` (Claude Sonnet 5) · **Effort** : `high` · **Complexité** : 1/3
- **Pourquoi ce modèle** : rendu textuel simple au-dessus du modèle de composition ; travail direct et vérifiable.
- **Commande** :

```bash
claude --model sonnet --effort high "Implémente le rendu Markdown de l export de Calepin : titres de parties et de chapitres, table des matières optionnelle avec ancres, métadonnées en en-tête YAML optionnelles, respect des tirets de dialogue et des guillemets français. Ajoute un test comparant la sortie à un fichier de référence. Termine par un commit Conventional Commits en anglais."
```

##### CAL-156 · Export DOCX
- **État** : ⬜ **À faire**
- **Contenu** : rendu Word avec styles de titre natifs, table des matières générée, sauts de page, page de titre, métadonnées de document.
- **Fini quand** : le fichier s'ouvre dans Word et LibreOffice avec une table des matières fonctionnelle et une navigation par titres.
- **Modèle** : `opus` (Claude Opus 5) · **Effort** : `xhigh` · **Complexité** : 3/3
- **Pourquoi ce modèle** : la génération DOCX correcte — styles natifs plutôt que mise en forme directe, champ de table des matières réellement fonctionnel, métadonnées du paquet — est un domaine technique où les erreurs sont fréquentes et invisibles jusqu'à l'ouverture du fichier. La fraîcheur de connaissances d'Opus 5 sur les bibliothèques concernées est un avantage direct.
- **Commande** :

```bash
claude --model opus --effort xhigh --permission-mode plan "ultrathink Implémente le rendu DOCX de l export de Calepin : styles de titre natifs Word et non de la mise en forme directe, table des matières générée comme champ réellement fonctionnel, sauts de page entre chapitres, page de titre, métadonnées de document titre et auteur, typographie française avec espaces insécables et guillemets. Vérifie l ouverture correcte dans Word et dans LibreOffice, table des matières et volet de navigation compris. Écris ton plan dans tasks/todo.md avant d agir. Termine par un commit Conventional Commits en anglais."
```

##### CAL-157 · Table des matières et numérotation
- **État** : ⬜ **À faire**
- **Contenu** : génération de la table des matières à partir de la structure réelle, numérotation continue ou par partie, options d'affichage.
- **Fini quand** : la table des matières reflète exactement la sélection de chapitres exportée.
- **Modèle** : `sonnet` (Claude Sonnet 5) · **Effort** : `high` · **Complexité** : 2/3
- **Pourquoi ce modèle** : logique de composition déterministe, testable par comparaison à des fichiers de référence.
- **Commande** :

```bash
claude --model sonnet --effort high "Implémente dans l export de Calepin la génération de la table des matières et la numérotation : table construite à partir de la structure réellement exportée et non du plan complet, numérotation continue ou par partie au choix, option d affichage ou de masquage des numéros de chapitre. Ajoute des tests sur une sélection partielle de chapitres. Termine par un commit Conventional Commits en anglais."
```

##### CAL-158 · Page de titre et métadonnées
- **État** : ⬜ **À faire**
- **Contenu** : page de titre configurable, métadonnées de document, mention de la longueur.
- **Fini quand** : les métadonnées sont lisibles dans les propriétés du fichier exporté.
- **Modèle** : `haiku` (Claude Haiku 4.5) · **Effort** : *n/a* · **Complexité** : 1/3
- **Pourquoi ce modèle** : composition simple sur une infrastructure d'export déjà construite, avec un patron déjà présent dans le dépôt. Tâche courte et cadrée. **Pas de `--effort`.**
- **Commande** :

```bash
claude --model haiku "Ajoute à l export de Calepin la page de titre configurable, titre, nom de l auteur, sous-titre optionnel, et les métadonnées de document, titre, auteur, langue, date. Suis strictement le moteur d export et les rendus déjà présents dans le dépôt sans en modifier l architecture. Termine par un commit Conventional Commits en anglais."
```

##### CAL-159 · Exclusion des éléments internes
- **État** : ⬜ **À faire**
- **Contenu** : garantie que bible, commentaires, diagnostics et problèmes n'apparaissent jamais dans un manuscrit exporté, sauf demande explicite.
- **Fini quand** : un test échoue si un élément interne apparaît dans un export standard.
- **Modèle** : `opus` (Claude Opus 5) · **Effort** : `high` · **Complexité** : 2/3
- **Pourquoi ce modèle** : exigence explicite du cahier des charges dont la violation serait embarrassante pour l'utilisateur. Il faut garantir l'exclusion par construction, pas par filtrage a posteriori.
- **Commande** :

```bash
claude --model opus --effort high "Garantis par construction dans l export de Calepin que les éléments internes, bible, commentaires personnels, diagnostics, problèmes qualité et notes de génération, n apparaissent jamais dans un manuscrit exporté, sauf option explicite d export de dossier de travail. Implémente cette garantie au niveau du modèle de composition plutôt que par un filtrage final. Ajoute un test qui échoue si un élément interne apparaît dans un export standard. Termine par un commit Conventional Commits en anglais."
```

##### CAL-160 · Export asynchrone et téléchargement sécurisé
- **État** : ⬜ **À faire**
- **Contenu** : génération en tâche de fond, dépôt sur stockage S3, lien de téléchargement temporaire et privé.
- **Fini quand** : un lien d'export n'est utilisable que par son propriétaire et expire.
- **Modèle** : `opus` (Claude Opus 5) · **Effort** : `high` · **Complexité** : 3/3
- **Pourquoi ce modèle** : point de rencontre entre file de tâches, stockage objet et contrôle d'accès ; une URL signée mal configurée expose le manuscrit entier. Opus 5 plutôt que Fable 5 pour éviter tout repli automatique lié aux classifieurs sur une formulation orientée sécurité.
- **Commande** :

```bash
claude --model opus --effort high --permission-mode plan "Implémente l export asynchrone de Calepin : génération du fichier en tâche de fond avec progression, dépôt sur le stockage compatible S3 dans un espace privé, et téléchargement par lien temporaire signé, à durée de validité courte, utilisable uniquement par le propriétaire du projet. Aucun objet d export ne doit être accessible publiquement. Écris ton plan dans tasks/todo.md avant d agir. Ajoute un test qui vérifie qu un lien d export d un autre utilisateur est refusé. Termine par un commit Conventional Commits en anglais."
```

##### CAL-161 · Historique des exports
- **État** : ⬜ **À faire**
- **Contenu** : liste des exports réalisés avec format, options, date, retéléchargement tant que le fichier existe.
- **Fini quand** : un export réalisé la veille est retéléchargeable ou clairement signalé comme expiré.
- **Modèle** : `haiku` (Claude Haiku 4.5) · **Effort** : *n/a* · **Complexité** : 1/3
- **Pourquoi ce modèle** : listing au-dessus d'une entité déjà modélisée, avec composants existants. **Pas de `--effort`.**
- **Commande** :

```bash
claude --model haiku "Ajoute à Calepin l historique des exports : liste des exports réalisés avec format, options retenues, date et taille, action de retéléchargement quand le fichier existe encore et mention explicite d expiration sinon. Réutilise strictement les composants de liste existants. Termine par un commit Conventional Commits en anglais."
```

##### CAL-162 · Tests d'export et vérification du rendu
- **État** : ⬜ **À faire**
- **Contenu** : fichiers de référence, ouverture automatisée, contrôle de la structure produite.
- **Fini quand** : une régression de rendu DOCX ou Markdown est détectée en intégration continue.
- **Modèle** : `sonnet` (Claude Sonnet 5) · **Effort** : `high` · **Complexité** : 2/3
- **Pourquoi ce modèle** : écriture de tests sur un comportement déjà spécifié, avec fichiers de référence. Travail méthodique sans conception.
- **Commande** :

```bash
claude --model sonnet --effort high "Écris la suite de tests d export de Calepin : fichiers de référence Markdown et DOCX, vérification programmatique de la structure du DOCX produit, styles de titre, présence et validité du champ de table des matières, métadonnées, sauts de page, et comparaison du Markdown à sa référence. Intègre ces tests au pipeline d intégration continue. Termine par un commit Conventional Commits en anglais."
```

---

### E16 — Sécurité, confidentialité et propriété intellectuelle *(transverse)*

> **Note d'affectation.** Cet epic est volontairement confié à `opus` et non à `fable`. Les classifieurs de sûreté de Fable 5 signalent le plus souvent les requêtes des domaines cybersécurité et biologie, ce qui déclenche un **repli automatique de modèle** : une tâche de durcissement formulée pour Fable 5 risque d'être traitée par un autre modèle sans que ce soit visible dans le résultat. Opus 5 offre ici la capacité nécessaire sans cet aléa.

##### CAL-163 · Validation des entrées et protection contre les injections
- **État** : ⬜ **À faire**
- **Contenu** : validation de schéma sur toutes les entrées, requêtes paramétrées, assainissement des contenus rendus.
- **Fini quand** : aucun point d'entrée n'accepte une charge utile non validée.
- **Modèle** : `opus` (Claude Opus 5) · **Effort** : `xhigh` · **Complexité** : 3/3
- **Pourquoi ce modèle** : balayage exhaustif de tous les points d'entrée existants, où l'exhaustivité prime sur l'ingéniosité. `xhigh` correspond au travail long et systématique décrit par la documentation officielle pour ce niveau.
- **Commande** :

```bash
claude --model opus --effort xhigh --permission-mode plan "ultrathink Renforce la validation des entrées de Calepin : recense tous les points d entrée, routes, actions serveur, gestionnaires de tâches et points de téléversement, et vérifie que chacun valide sa charge utile par un schéma strict avant tout traitement. Vérifie que toutes les requêtes de base passent par le client Prisma sans interpolation de chaîne, et que tout contenu utilisateur rendu dans l interface est assaini. Produis un rapport des points corrigés dans tasks/todo.md. Écris ton plan avant d agir. Termine par un commit Conventional Commits en anglais."
```

##### CAL-164 · Limitation du nombre de requêtes
- **État** : ⬜ **À faire**
- **Contenu** : plafonds par utilisateur et par adresse sur l'authentification, la création de projet et les générations.
- **Fini quand** : un script tentant cent connexions par minute est bloqué.
- **Modèle** : `sonnet` (Claude Sonnet 5) · **Effort** : `high` · **Complexité** : 2/3
- **Pourquoi ce modèle** : implémentation standard sur Redis, déjà disponible dans l'infrastructure ; règles simples et testables.
- **Commande** :

```bash
claude --model sonnet --effort high "Implémente la limitation du nombre de requêtes de Calepin en t appuyant sur Redis déjà présent : plafonds distincts par utilisateur et par adresse pour la demande de lien de connexion, la création de projet, le lancement de génération et l export. Message d erreur explicite avec délai d attente. Ajoute les tests de plafonnement. Termine par un commit Conventional Commits en anglais."
```

##### CAL-165 · Gestion des secrets et chiffrement des communications
- **État** : ⬜ **À faire**
- **Contenu** : aucun secret dans le dépôt, rotation possible, HTTPS strict, en-têtes de transport.
- **Fini quand** : une analyse du dépôt ne trouve aucun secret et le service refuse le HTTP simple.
- **Modèle** : `opus` (Claude Opus 5) · **Effort** : `high` · **Complexité** : 2/3
- **Pourquoi ce modèle** : configuration de déploiement où les erreurs sont silencieuses ; les connaissances récentes d'Opus 5 sur les plateformes d'hébergement actuelles sont un avantage.
- **Commande** :

```bash
claude --model opus --effort high "Sécurise la configuration de Calepin : vérifie qu aucun secret n est présent dans le dépôt ni dans l historique git, mets en place la lecture des secrets depuis l environnement uniquement avec possibilité de rotation, impose HTTPS strict et les en-têtes de transport appropriés. Ajoute une vérification automatisée de présence de secrets au pipeline d intégration continue. Termine par un commit Conventional Commits en anglais."
```

##### CAL-166 · Contrôle d'accès aux fichiers et téléversements
- **État** : ⬜ **À faire**
- **Contenu** : espace privé par utilisateur, vérification de type et de taille à l'import, aucun objet public par défaut.
- **Fini quand** : aucun objet du stockage n'est accessible sans lien signé valide.
- **Modèle** : `opus` (Claude Opus 5) · **Effort** : `high` · **Complexité** : 3/3
- **Pourquoi ce modèle** : le stockage objet mal configuré est une des causes les plus fréquentes de fuite de données ; la vérification doit être structurelle et non déclarative.
- **Commande** :

```bash
claude --model opus --effort high --permission-mode plan "Implémente le contrôle d accès au stockage de fichiers de Calepin : cloisonnement par utilisateur, aucun objet accessible publiquement par défaut, accès uniquement par lien signé à durée courte, vérification du type réel et de la taille des fichiers téléversés avant enregistrement. Ajoute un test qui vérifie qu un objet appartenant à un autre utilisateur est inaccessible même avec son chemin exact. Écris ton plan dans tasks/todo.md avant d agir. Termine par un commit Conventional Commits en anglais."
```

##### CAL-167 · En-têtes de sécurité et politique de contenu
- **État** : ⬜ **À faire**
- **Contenu** : en-têtes de sécurité, politique de sécurité du contenu adaptée à Next.js, protection contre l'inclusion en cadre.
- **Fini quand** : les en-têtes sont présents en production sans casser l'application.
- **Modèle** : `sonnet` (Claude Sonnet 5) · **Effort** : `high` · **Complexité** : 2/3
- **Pourquoi ce modèle** : configuration bien documentée, dont la difficulté est l'ajustement itératif — un travail que Sonnet 5 mène efficacement à coût réduit.
- **Commande** :

```bash
claude --model sonnet --effort high "Configure les en-têtes de sécurité de Calepin : politique de sécurité du contenu compatible avec Next.js, protection contre l inclusion en cadre, politique de référent, et désactivation des fonctionnalités de navigateur non utilisées. Vérifie que l application fonctionne intégralement avec ces en-têtes actifs, y compris le flux d événements serveur. Termine par un commit Conventional Commits en anglais."
```

##### CAL-168 · Conditions d'utilisation et politique de confidentialité
- **État** : ⬜ **À faire**
- **Contenu** : rédaction expliquant le traitement des textes, la transmission éventuelle à un fournisseur externe, la durée de conservation, l'usage ou non pour l'entraînement, la procédure de suppression.
- **Fini quand** : les cinq points exigés par la section 10.1 du cahier des charges sont couverts en langage clair.
- **Modèle** : `opus` (Claude Opus 5) · **Effort** : `high` · **Complexité** : 2/3
- **Pourquoi ce modèle** : rédaction juridique et pédagogique à partir du comportement réel du système, qui suppose de lire le code pour décrire fidèlement les flux de données. Ce n'est pas de la rédaction générique.
- **Commande** :

```bash
claude --model opus --effort high "Rédige les conditions d utilisation et la politique de confidentialité de Calepin en français clair, à partir du comportement réel du code et non de formules génériques. Couvre explicitement : comment les textes de l utilisateur sont traités, s ils sont transmis à un fournisseur externe et lequel, combien de temps ils sont conservés, s ils sont utilisés ou non pour entraîner des modèles, et comment les supprimer. Précise que l utilisateur reste propriétaire de ses textes. Place-les dans docs et rends-les accessibles depuis l application. Termine par un commit Conventional Commits en anglais."
```

##### CAL-169 · Information sur le traitement par un fournisseur externe
- **État** : ⬜ **À faire**
- **Contenu** : mention visible dans l'application au moment de la première génération, sans friction excessive.
- **Fini quand** : l'utilisateur est informé avant la première transmission de son texte.
- **Modèle** : `haiku` (Claude Haiku 4.5) · **Effort** : *n/a* · **Complexité** : 1/3
- **Pourquoi ce modèle** : rédaction courte et affichage conditionnel, entièrement dicté par le contenu déjà rédigé en CAL-168. **Pas de `--effort`.**
- **Commande** :

```bash
claude --model haiku "Ajoute à Calepin l information sur le traitement externe : avant la toute première génération d un utilisateur, afficher une mention claire et concise indiquant que le texte sera transmis à un fournisseur de modèle pour traitement, avec un lien vers la politique de confidentialité, et mémoriser l acquittement. Reprends la formulation déjà rédigée dans la politique de confidentialité du dépôt. Termine par un commit Conventional Commits en anglais."
```

##### CAL-170 · Garde-fou contre l'imitation d'œuvres et d'auteurs
- **État** : ⬜ **À faire**
- **Contenu** : refus des demandes visant à reproduire une œuvre protégée ou le style exact d'un auteur vivant ; autorisation des caractéristiques générales (prose minimaliste, narration fragmentée, ambiance mélancolique).
- **Fini quand** : « écris comme <auteur vivant> » est refusé avec explication, alors que « prose minimaliste, dialogues secs » est accepté.
- **Modèle** : `opus` (Claude Opus 5) · **Effort** : `xhigh` · **Complexité** : 3/3
- **Pourquoi ce modèle** : la frontière entre description stylistique légitime et imitation directe est subtile, et le produit doit la tenir sans devenir inutilisable. Cela exige un raisonnement fin sur des cas limites et une implémentation qui ne se réduit pas à une liste de noms. Opus 5 à `xhigh`.
- **Commande** :

```bash
claude --model opus --effort xhigh --permission-mode plan "ultrathink Implémente dans Calepin le garde-fou de propriété intellectuelle. Le système doit refuser les demandes visant explicitement à reproduire une œuvre protégée ou le style exact d un auteur vivant nommé, tout en autorisant la description de caractéristiques générales comme prose minimaliste, narration fragmentée, ambiance mélancolique, dialogues secs ou structure polyphonique. L implémentation ne doit pas se réduire à une liste de noms : conçois une détection fondée sur l intention d imitation directe. En cas de refus, explique clairement à l utilisateur ce qui est possible à la place. Aucune fonctionnalité du produit ne doit présenter l imitation directe comme un service. Écris ton plan dans tasks/todo.md avant d agir. Ajoute des tests de cas limites acceptés et refusés. Termine par un commit Conventional Commits en anglais."
```

##### CAL-171 · Avertissement sur les droits du texte importé
- **État** : ⬜ **À faire**
- **Contenu** : mention à la création de projet rappelant que l'utilisateur doit détenir les droits sur le texte fourni.
- **Fini quand** : l'avertissement est affiché à la création sans bloquer le parcours.
- **Modèle** : `haiku` (Claude Haiku 4.5) · **Effort** : *n/a* · **Complexité** : 1/3
- **Pourquoi ce modèle** : ajout d'un libellé et d'une case dans un formulaire existant. **Pas de `--effort`.**
- **Commande** :

```bash
claude --model haiku "Ajoute au formulaire de création de projet de Calepin un avertissement concis rappelant que l utilisateur ne doit importer que des textes dont il détient les droits nécessaires, avec acquittement mémorisé, sans bloquer ni alourdir le parcours. Réutilise les composants de formulaire existants. Termine par un commit Conventional Commits en anglais."
```

##### CAL-172 · Suppression des données et exercice des droits
- **État** : ⬜ **À faire**
- **Contenu** : suppression d'un projet, d'une version, d'un export, d'une publication ; export des données personnelles.
- **Fini quand** : chaque niveau de suppression exigé par la section 10.3 est disponible et effectif.
- **Modèle** : `opus` (Claude Opus 5) · **Effort** : `high` · **Complexité** : 2/3
- **Pourquoi ce modèle** : extension du travail de CAL-031 à des granularités plus fines, avec la même exigence de complétude. La cohérence entre les deux implémentations justifie le même niveau de modèle.
- **Commande** :

```bash
claude --model opus --effort high "Implémente dans Calepin les suppressions granulaires exigées par le cahier des charges : suppression d un projet, d une version, d un export, d une publication, en cohérence avec la suppression de compte déjà implémentée. Ajoute l export des données personnelles de l utilisateur dans un format lisible. Chaque suppression doit purger les objets de stockage associés. Ajoute les tests. Termine par un commit Conventional Commits en anglais."
```

---

### E17 — Observabilité, coûts et indicateurs *(transverse)*

##### CAL-173 · Métriques de génération
- **État** : ⬜ **À faire**
- **Contenu** : durée, nombre de tentatives, modèle utilisé, volume de données, coût estimé, interruptions, exports.
- **Fini quand** : les sept mesures exigées par la section 9.6 sont collectées sans contenu littéraire.
- **Modèle** : `sonnet` (Claude Sonnet 5) · **Effort** : `high` · **Complexité** : 2/3
- **Pourquoi ce modèle** : instrumentation au-dessus d'un modèle de données déjà conçu ; travail méthodique et vérifiable.
- **Commande** :

```bash
claude --model sonnet --effort high "Instrumente les générations de Calepin : collecte de la durée, du nombre de tentatives, du modèle utilisé, du volume de données transmis, du coût estimé, des interruptions et des exports. Aucun contenu littéraire ne doit être collecté, uniquement des métriques et des identifiants. Expose ces mesures par une interface de métriques. Termine par un commit Conventional Commits en anglais."
```

##### CAL-174 · Suivi des erreurs
- **État** : ⬜ **À faire**
- **Contenu** : intégration d'un service de suivi d'erreurs, filtrage des données sensibles, regroupement par cause.
- **Fini quand** : une erreur de production est diagnosticable sans lire les journaux bruts, et aucun extrait de roman n'est transmis au service.
- **Modèle** : `opus` (Claude Opus 5) · **Effort** : `high` · **Complexité** : 2/3
- **Pourquoi ce modèle** : le filtrage des contenus littéraires avant transmission à un service tiers est une exigence de confidentialité qui doit être garantie par construction, pas espérée.
- **Commande** :

```bash
claude --model opus --effort high "Intègre un service de suivi d erreurs à Calepin, côté serveur et côté travailleur, avec regroupement par cause et contexte technique utile. Garantis par construction qu aucun extrait de texte source, de chapitre ou de bible n est transmis au service : filtre les charges utiles avant envoi et ajoute un test qui échoue si un champ de prose franchit ce filtre. Termine par un commit Conventional Commits en anglais."
```

##### CAL-175 · Tableau des indicateurs du MVP
- **État** : ⬜ **À faire**
- **Contenu** : les douze indicateurs de la section 17, dont la part de projets atteignant la bible, le plan, un chapitre, trois chapitres.
- **Fini quand** : les douze indicateurs sont calculés à partir des données réelles.
- **Modèle** : `opus` (Claude Opus 5) · **Effort** : `xhigh` · **Complexité** : 3/3
- **Pourquoi ce modèle** : chaque indicateur suppose une définition précise (à partir de quand un projet « atteint » la bible ?) et une requête correcte. La qualité de ces définitions détermine si le produit sera piloté par des chiffres justes ou trompeurs. Opus 5 à `xhigh` pour la rigueur des douze définitions.
- **Commande** :

```bash
claude --model opus --effort xhigh --permission-mode plan "ultrathink Implémente le tableau des indicateurs de Calepin. Définis d abord précisément et écris dans docs la définition de chacun des douze indicateurs de la section 17 du cahier des charges : part de projets atteignant l étape de la bible, du plan, générant au moins un chapitre, générant trois chapitres, nombre moyen de modifications avant validation, nombre de contradictions détectées, taux d export, coût moyen par projet, temps moyen entre création et premier chapitre, taux de régénération complète, satisfaction déclarée sur la cohérence, satisfaction déclarée sur l originalité des directions. Implémente ensuite leur calcul à partir des données réelles. Rappelle dans la documentation que l indicateur principal n est pas le volume de texte généré mais le nombre de projets aboutissant à une structure validée et à plusieurs chapitres exploitables. Écris ton plan dans tasks/todo.md avant d agir. Termine par un commit Conventional Commits en anglais."
```

##### CAL-176 · Alertes sur dérive de coût
- **État** : ⬜ **À faire**
- **Contenu** : seuils par projet et globaux, alerte à l'utilisateur et à l'exploitant, blocage optionnel.
- **Fini quand** : un projet dépassant son seuil déclenche une alerte avant d'épuiser le budget.
- **Modèle** : `sonnet` (Claude Sonnet 5) · **Effort** : `high` · **Complexité** : 2/3
- **Pourquoi ce modèle** : règles de seuil déterministes au-dessus de la comptabilisation déjà écrite.
- **Commande** :

```bash
claude --model sonnet --effort high "Implémente les alertes de coût de Calepin : seuils configurables par projet et pour l ensemble du service, alerte affichée à l utilisateur et notification à l exploitant au franchissement, option de blocage des nouvelles générations au-delà d un plafond dur. Ajoute les tests de franchissement. Termine par un commit Conventional Commits en anglais."
```

##### CAL-177 · Mesure du parcours utilisateur
- **État** : ⬜ **À faire**
- **Contenu** : temps entre création et premier chapitre, nombre de modifications avant validation, taux de régénération.
- **Fini quand** : les trois mesures sont disponibles sans instrumentation intrusive du contenu.
- **Modèle** : `sonnet` (Claude Sonnet 5) · **Effort** : `high` · **Complexité** : 2/3
- **Pourquoi ce modèle** : instrumentation d'événements métier déjà définis par les indicateurs de CAL-175.
- **Commande** :

```bash
claude --model sonnet --effort high "Instrumente le parcours utilisateur de Calepin selon les définitions d indicateurs déjà écrites : temps entre création du projet et premier chapitre généré, nombre de modifications manuelles avant validation d une étape, taux de régénération complète. Événements métier uniquement, aucun contenu littéraire. Termine par un commit Conventional Commits en anglais."
```

##### CAL-178 · Retour déclaré sur la cohérence et l'originalité
- **État** : ⬜ **À faire**
- **Contenu** : demande de retour légère après la validation du troisième chapitre, deux questions courtes.
- **Fini quand** : les réponses alimentent les deux indicateurs de satisfaction déclarée.
- **Modèle** : `haiku` (Claude Haiku 4.5) · **Effort** : *n/a* · **Complexité** : 1/3
- **Pourquoi ce modèle** : formulaire à deux questions et stockage simple, sur des composants existants. **Pas de `--effort`.**
- **Commande** :

```bash
claude --model haiku "Ajoute à Calepin un retour déclaré léger : après validation du troisième chapitre, proposer deux questions courtes sur la cohérence du roman obtenu et sur l originalité des directions proposées, avec une réponse sur échelle et un champ libre facultatif, ignorable en un clic. Stocke les réponses et rattache-les aux indicateurs existants. Réutilise les composants de formulaire du dépôt. Termine par un commit Conventional Commits en anglais."
```

##### CAL-179 · Journalisation des durées et des reprises
- **État** : ⬜ **À faire**
- **Contenu** : mesure fine des durées par étape de génération, nombre de reprises, causes d'échec agrégées.
- **Fini quand** : on peut identifier l'étape la plus lente et la plus fragile du parcours.
- **Modèle** : `sonnet` (Claude Sonnet 5) · **Effort** : `medium` · **Complexité** : 1/3
- **Pourquoi ce modèle** : extension mécanique de l'instrumentation existante. `medium` réduit la dépense sur une tâche sans enjeu d'intelligence, conformément à l'usage recommandé de ce niveau.
- **Commande** :

```bash
claude --model sonnet --effort medium "Étends l instrumentation de Calepin pour mesurer les durées par étape interne d une génération, le nombre de reprises et les causes d échec agrégées par catégorie, afin d identifier l étape la plus lente et la plus fragile. Réutilise l instrumentation existante sans en changer l architecture. Termine par un commit Conventional Commits en anglais."
```

##### CAL-180 · Tableau de bord d'exploitation
- **État** : ⬜ **À faire**
- **Contenu** : vue interne agrégeant indicateurs, coûts, erreurs et durées.
- **Fini quand** : l'état de santé du service se lit sur un seul écran.
- **Modèle** : `sonnet` (Claude Sonnet 5) · **Effort** : `high` · **Complexité** : 2/3
- **Pourquoi ce modèle** : agrégation et visualisation de données déjà collectées.
- **Commande** :

```bash
claude --model sonnet --effort high "Crée le tableau de bord d exploitation interne de Calepin, accessible au seul propriétaire du service : indicateurs du MVP, coûts par période et par mission, taux d erreur et causes principales, durées moyennes par étape, générations en cours et en échec. Un seul écran doit suffire à lire l état de santé du service. Termine par un commit Conventional Commits en anglais."
```

---

### E18 — Système de design, accessibilité et responsive *(transverse)*

##### CAL-181 · Système de design et jetons visuels
- **État** : ⬜ **À faire**
- **Contenu** : palette, typographie adaptée à la lecture longue, échelle d'espacement, jetons partagés.
- **Fini quand** : aucune valeur de couleur ou d'espacement n'est écrite en dur dans un composant.
- **Modèle** : `opus` (Claude Opus 5) · **Effort** : `high` · **Complexité** : 2/3
- **Pourquoi ce modèle** : les choix posés ici contraignent toute l'interface ; une typographie mal calibrée rend un outil d'écriture désagréable à utiliser. Décision structurante mais bien cadrée.
- **Commande** :

```bash
claude --model opus --effort high --permission-mode plan "Conçois le système de design de Calepin : jetons de couleur, typographie choisie pour la lecture et l écriture longues avec une hauteur de ligne et une largeur de colonne confortables, échelle d espacement, rayons et ombres. Tous les jetons doivent être définis en un seul endroit et aucun composant ne doit contenir de valeur en dur. Vérifie les contrastes dès cette étape. Écris ton plan dans tasks/todo.md avant d agir. Termine par un commit Conventional Commits en anglais."
```

##### CAL-182 · Bibliothèque de composants de base
- **État** : ⬜ **À faire**
- **Contenu** : boutons, champs, listes, panneaux, boîtes de dialogue, infobulles, indicateurs de statut.
- **Fini quand** : chaque composant est accessible au clavier et documenté par un exemple.
- **Modèle** : `sonnet` (Claude Sonnet 5) · **Effort** : `high` · **Complexité** : 2/3
- **Pourquoi ce modèle** : production de composants standards à partir d'un système de design déjà défini ; volume important, difficulté faible — le profil pour lequel Sonnet 5 est le plus rentable.
- **Commande** :

```bash
claude --model sonnet --effort high "Crée la bibliothèque de composants de base de Calepin à partir des jetons du système de design : boutons, champs de saisie, zones de texte, sélecteurs, listes, panneaux, boîtes de dialogue, infobulles, indicateurs de statut et badges. Chaque composant doit être utilisable au clavier, porter des libellés accessibles et être accompagné d un exemple d usage. Termine par un commit Conventional Commits en anglais."
```

##### CAL-183 · Thème clair et thème sombre
- **État** : ⬜ **À faire**
- **Contenu** : bascule de thème, respect de la préférence système, contrastes vérifiés dans les deux thèmes.
- **Fini quand** : les contrastes sont conformes dans les deux thèmes, y compris sur les indicateurs de statut.
- **Modèle** : `sonnet` (Claude Sonnet 5) · **Effort** : `high` · **Complexité** : 2/3
- **Pourquoi ce modèle** : déclinaison de jetons déjà définis, avec vérification automatisable.
- **Commande** :

```bash
claude --model sonnet --effort high "Implémente les thèmes clair et sombre de Calepin à partir des jetons existants : respect de la préférence système, bascule manuelle mémorisée, et vérification automatisée des contrastes dans les deux thèmes, y compris sur les indicateurs de statut, de gravité et de verrouillage. Termine par un commit Conventional Commits en anglais."
```

##### CAL-184 · Accessibilité — clavier et gestion du focus
- **État** : ⬜ **À faire**
- **Contenu** : navigation complète au clavier, ordre de tabulation cohérent, focus visible, piégeage du focus dans les dialogues.
- **Fini quand** : tout le parcours du MVP est réalisable sans souris.
- **Modèle** : `opus` (Claude Opus 5) · **Effort** : `xhigh` · **Complexité** : 3/3
- **Pourquoi ce modèle** : l'accessibilité clavier d'un éditeur riche avec panneaux contextuels, glisser-déposer et dialogues est un travail exigeant et transverse, où il faut auditer tous les écrans. `xhigh` pour la couverture systématique.
- **Commande** :

```bash
claude --model opus --effort xhigh --permission-mode plan "ultrathink Rends l intégralité du parcours de Calepin réalisable au clavier : ordre de tabulation cohérent sur tous les écrans, focus toujours visible, piégeage et restitution du focus dans les boîtes de dialogue, alternative clavier complète au glisser-déposer de réorganisation des chapitres, raccourcis documentés pour l éditeur. Audite chaque écran existant et corrige. Écris ton plan dans tasks/todo.md avant d agir. Ajoute des tests end-to-end réalisés uniquement au clavier sur le parcours complet du MVP. Termine par un commit Conventional Commits en anglais."
```

##### CAL-185 · Accessibilité — contrastes et indépendance à la couleur
- **État** : ⬜ **À faire**
- **Contenu** : contrastes conformes, aucune information portée par la seule couleur (statuts, gravités, verrous, fait/interprétation).
- **Fini quand** : l'interface reste compréhensible en niveaux de gris.
- **Modèle** : `sonnet` (Claude Sonnet 5) · **Effort** : `high` · **Complexité** : 2/3
- **Pourquoi ce modèle** : audit visuel systématique avec correctifs simples, vérifiable automatiquement.
- **Commande** :

```bash
claude --model sonnet --effort high "Audite et corrige dans Calepin l indépendance à la couleur : chaque information portée par une couleur, statut de projet, statut de chapitre, gravité d un problème, verrouillage, distinction entre fait explicite et interprétation, doit aussi être portée par un libellé, une icône ou une forme. Vérifie que l interface reste compréhensible en niveaux de gris et que tous les contrastes sont conformes. Termine par un commit Conventional Commits en anglais."
```

##### CAL-186 · Accessibilité — libellés, erreurs et lecteurs d'écran
- **État** : ⬜ **À faire**
- **Contenu** : champs associés à leurs intitulés, messages d'erreur annoncés, régions vivantes pour la progression des générations.
- **Fini quand** : la progression d'une génération est annoncée par un lecteur d'écran.
- **Modèle** : `opus` (Claude Opus 5) · **Effort** : `high` · **Complexité** : 2/3
- **Pourquoi ce modèle** : l'annonce correcte d'un contenu qui se met à jour en continu (génération en flux) est un point technique subtil où une implémentation naïve produit un bavardage inutilisable.
- **Commande** :

```bash
claude --model opus --effort high "Rends Calepin utilisable au lecteur d écran : chaque champ associé à son intitulé, chaque message d erreur annoncé et rattaché à son champ, régions vivantes correctement calibrées pour annoncer le début, les étapes et la fin d une génération sans bavardage, et libellés explicites sur toutes les actions. Vérifie le comportement sur la rédaction en flux, qui ne doit pas produire une annonce continue. Termine par un commit Conventional Commits en anglais."
```

##### CAL-187 · Adaptation ordinateur et tablette
- **État** : ⬜ **À faire**
- **Contenu** : mise en page principale pour ordinateur, adaptation des panneaux et de l'éditeur sur tablette.
- **Fini quand** : le parcours complet est utilisable sur tablette, panneaux repliables compris.
- **Modèle** : `sonnet` (Claude Sonnet 5) · **Effort** : `high` · **Complexité** : 2/3
- **Pourquoi ce modèle** : travail de mise en page adaptatif classique sur des écrans déjà construits.
- **Commande** :

```bash
claude --model sonnet --effort high "Adapte l interface de Calepin à la tablette : panneaux latéraux repliables, éditeur pleine largeur, écran de comparaison des directions empilé, plan et bible navigables au doigt, cibles tactiles suffisantes. L ordinateur reste la cible principale et ne doit pas être dégradé. Termine par un commit Conventional Commits en anglais."
```

##### CAL-188 · Consultation sur téléphone
- **État** : ⬜ **À faire**
- **Contenu** : lecture du manuscrit, consultation de la bible et du plan, suivi des générations en cours ; édition avancée limitée.
- **Fini quand** : consulter un chapitre et suivre une génération est confortable sur téléphone.
- **Modèle** : `sonnet` (Claude Sonnet 5) · **Effort** : `medium` · **Complexité** : 2/3
- **Pourquoi ce modèle** : périmètre volontairement réduit par le cahier des charges ; travail d'adaptation limité où `medium` économise sans risque.
- **Commande** :

```bash
claude --model sonnet --effort medium "Rends consultable sur téléphone le manuscrit, la bible, le plan et l état des générations en cours de Calepin, avec une mise en page adaptée à la lecture. L édition avancée peut rester limitée conformément au cahier des charges, mais elle doit être clairement signalée plutôt que cassée. Termine par un commit Conventional Commits en anglais."
```

---

### E19 — Tests, évaluations et qualité *(transverse)*

##### CAL-189 · Tests unitaires de la couche métier
- **État** : ⬜ **À faire**
- **Contenu** : couverture des règles métier — comptage de mots, machine à états, atomicité des faits, ordonnancement, rétention.
- **Fini quand** : la logique métier est couverte à un niveau permettant de refactoriser sans crainte.
- **Modèle** : `sonnet` (Claude Sonnet 5) · **Effort** : `high` · **Complexité** : 2/3
- **Pourquoi ce modèle** : écriture de tests sur du comportement déjà spécifié — volume important, difficulté modérée, exactement le créneau de Sonnet 5.
- **Commande** :

```bash
claude --model sonnet --effort high "Complète les tests unitaires de la couche métier de Calepin : comptage de mots, transitions de la machine à états, atomicité et déduplication des faits canoniques, ordonnancement des chapitres sous insertion fusion et scission, politique de rétention des versions, calcul des agrégats de projet. Vise une couverture réelle des cas limites et non un pourcentage. Termine par un commit Conventional Commits en anglais."
```

##### CAL-190 · Tests d'intégration des dépôts et de la file
- **État** : ⬜ **À faire**
- **Contenu** : base réelle, file réelle, vérification du cycle de vie complet d'une génération.
- **Fini quand** : un redémarrage du travailleur en cours de test est couvert.
- **Modèle** : `opus` (Claude Opus 5) · **Effort** : `high` · **Complexité** : 3/3
- **Pourquoi ce modèle** : tester des scénarios de concurrence et de redémarrage demande de concevoir les tests eux-mêmes, ce qui est plus difficile que le code testé. Opus 5.
- **Commande** :

```bash
claude --model opus --effort high --permission-mode plan "Écris les tests d intégration de Calepin sur base PostgreSQL et file Redis réelles : cycle de vie complet d une génération, réconciliation après redémarrage du travailleur en cours de génération, verrou d écriture par cible sous demandes concurrentes, idempotence sous réessai, bascule de fournisseur en cours d appel. Écris ton plan dans tasks/todo.md avant d agir. Termine par un commit Conventional Commits en anglais."
```

##### CAL-191 · Tests de bout en bout des parcours critiques
- **État** : ⬜ **À faire**
- **Contenu** : parcours complet création → analyse → direction → bible → plan → trois chapitres → export.
- **Fini quand** : le parcours complet du MVP est vérifié automatiquement avec des réponses de modèle simulées.
- **Modèle** : `opus` (Claude Opus 5) · **Effort** : `xhigh` · **Complexité** : 3/3
- **Pourquoi ce modèle** : ce test est la définition exécutable du MVP. Il exige une stratégie de simulation des réponses de modèle qui reste réaliste sans devenir un test tautologique. Conception de test exigeante : Opus 5 à `xhigh`.
- **Commande** :

```bash
claude --model opus --effort xhigh --permission-mode plan "ultrathink Écris le test de bout en bout du parcours complet du MVP de Calepin : création de projet avec texte de moins de 2000 mots, analyse, validation, trois directions, sélection, bible, verrouillage d un fait, plan, rédaction des trois premiers chapitres, arbitrage des faits extraits, export Markdown et DOCX. Conçois une stratégie de simulation des réponses de modèle réaliste, fondée sur des réponses enregistrées conformes aux schémas, sans rendre le test tautologique. Écris ton plan dans tasks/todo.md avant d agir. Intègre le test au pipeline. Termine par un commit Conventional Commits en anglais."
```

##### CAL-192 · Tests d'isolation entre utilisateurs
- **État** : ⬜ **À faire**
- **Contenu** : tentative d'accès croisé sur chaque point d'entrée, y compris fichiers exportés et flux d'événements.
- **Fini quand** : le critère d'acceptation de sécurité du MVP est vérifié automatiquement.
- **Modèle** : `opus` (Claude Opus 5) · **Effort** : `xhigh` · **Complexité** : 3/3
- **Pourquoi ce modèle** : exhaustivité critique — un point d'entrée oublié rend le test rassurant à tort. `xhigh` pour le balayage systématique. Opus 5 plutôt que Fable 5 pour éviter le repli automatique lié aux classifieurs de sûreté.
- **Commande** :

```bash
claude --model opus --effort xhigh --permission-mode plan "ultrathink Écris la suite de tests d isolation entre utilisateurs de Calepin. Recense d abord exhaustivement tous les points d entrée exposés, routes, actions serveur, flux d événements, liens de téléchargement d export, points de téléversement. Pour chacun, écris un test qui tente d accéder aux données d un autre utilisateur et vérifie le refus. Ajoute un test vérifiant qu un projet supprimé n est plus accessible par aucun chemin. Écris ton plan dans tasks/todo.md avant d agir. Termine par un commit Conventional Commits en anglais."
```

##### CAL-193 · Évaluations littéraires automatisées
- **État** : ⬜ **À faire**
- **Contenu** : exécution du banc d'évaluation sur les missions d'analyse, de direction, de bible et de rédaction ; détection de régression qualitative.
- **Fini quand** : une modification de prompt dégradant la qualité est visible avant fusion.
- **Modèle** : `fable` (Claude Fable 5) · **Effort** : `xhigh` · **Complexité** : 3/3
- **Pourquoi ce modèle** : juger qu'une sortie littéraire s'est dégradée est le problème d'évaluation le plus difficile du projet ; il n'existe pas de vérité de référence. C'est le cas d'usage de Fable 5 par excellence, et le cahier des charges interdit de résoudre le problème par un score arbitraire. Budget plafonné.
- **Commande** :

```bash
claude --model fable --effort xhigh --permission-mode plan --max-budget-usd 15 "ultrathink Conçois le dispositif d évaluation littéraire automatisée de Calepin, au-dessus du banc d évaluation existant. Il exécute les missions d analyse, de direction, de bible et de rédaction sur le corpus de référence et rend visible une régression qualitative avant fusion d une modification de prompt. Contrainte du cahier des charges : pas de score arbitraire présenté comme mesure de qualité. Conçois une évaluation comparative par paires, où un juge argumente laquelle de deux sorties est meilleure et pourquoi, plutôt qu une notation absolue. Documente les limites du dispositif honnêtement. Écris ton plan dans tasks/todo.md avant d agir. Termine par un commit Conventional Commits en anglais."
```

##### CAL-194 · Tests de performance de l'éditeur
- **État** : ⬜ **À faire**
- **Contenu** : mesure de la fluidité d'édition sur un chapitre long et d'un manuscrit de cinquante chapitres.
- **Fini quand** : les seuils de fluidité sont vérifiés automatiquement.
- **Modèle** : `sonnet` (Claude Sonnet 5) · **Effort** : `high` · **Complexité** : 2/3
- **Pourquoi ce modèle** : instrumentation de mesure classique avec seuils explicites.
- **Commande** :

```bash
claude --model sonnet --effort high "Écris les tests de performance de l éditeur de Calepin : saisie fluide sur un chapitre de cinq mille mots, navigation dans un manuscrit de cinquante chapitres, recherche transverse, affichage des problèmes détectés. Fixe des seuils explicites, mesure-les automatiquement et fais échouer le pipeline en cas de dépassement. Termine par un commit Conventional Commits en anglais."
```

##### CAL-195 · Tests d'accessibilité automatisés
- **État** : ⬜ **À faire**
- **Contenu** : analyse automatisée de chaque écran, vérification des contrastes, parcours clavier scripté.
- **Fini quand** : une régression d'accessibilité échoue en intégration continue.
- **Modèle** : `sonnet` (Claude Sonnet 5) · **Effort** : `high` · **Complexité** : 2/3
- **Pourquoi ce modèle** : outillage standard et bien documenté à câbler ; le travail conceptuel a été fait en CAL-184 à CAL-186.
- **Commande** :

```bash
claude --model sonnet --effort high "Ajoute à Calepin les tests d accessibilité automatisés : analyse de chaque écran principal, vérification programmatique des contrastes dans les deux thèmes, parcours clavier scripté sur le parcours complet du MVP. Fais échouer le pipeline en cas de régression. Termine par un commit Conventional Commits en anglais."
```

##### CAL-196 · Revue de sécurité avant mise en production
- **État** : ⬜ **À faire**
- **Contenu** : relecture complète des contrôles d'accès, des secrets, des dépendances et des en-têtes ; rapport de constats.
- **Fini quand** : chaque constat est corrigé ou explicitement accepté avec motif.
- **Modèle** : `opus` (Claude Opus 5) · **Effort** : `max` · **Complexité** : 3/3
- **Pourquoi ce modèle** : c'est l'une des rares tâches où `max` — le niveau de capacité maximale sans contrainte de dépense — se justifie : elle est ponctuelle, à fort enjeu, et l'exhaustivité prime sur le coût. `max` s'applique à la session en cours uniquement, ce qui convient à une revue unique. Opus 5 plutôt que Fable 5 pour éviter le repli automatique lié aux classifieurs de sûreté sur ce type de requête.
- **Commande** :

```bash
claude --model opus --effort max --permission-mode plan "ultrathink Conduis une revue de sécurité complète de Calepin avant mise en production. Passe en revue : contrôle d accès par propriétaire sur chaque point d entrée, validation des entrées, gestion et rotation des secrets, configuration du stockage objet et liens signés, en-têtes de sécurité, limitation du débit, dépendances vulnérables, contenu des journaux et des rapports d erreur. Produis un rapport de constats hiérarchisés dans docs, corrige ce qui est corrigeable dans cette session et note explicitement, avec motif, ce qui est accepté en l état. Écris ton plan dans tasks/todo.md avant d agir. Termine par un commit Conventional Commits en anglais."
```

##### CAL-197 · Documentation de développement et d'exploitation
- **État** : ⬜ **À faire**
- **Contenu** : démarrage local, architecture, missions IA, procédures d'exploitation, reprise après incident.
- **Fini quand** : une personne extérieure peut démarrer le projet et relancer une génération échouée en suivant la documentation.
- **Modèle** : `sonnet` (Claude Sonnet 5) · **Effort** : `high` · **Complexité** : 2/3
- **Pourquoi ce modèle** : rédaction technique à partir d'un code existant, volumineuse mais sans difficulté conceptuelle.
- **Commande** :

```bash
claude --model sonnet --effort high "Rédige la documentation de Calepin dans docs : démarrage local en trois commandes, architecture et découpage par domaine, catalogue des missions d intelligence artificielle avec leur modèle et leur schéma, procédures d exploitation, relance d une génération échouée, purge des versions, restauration d un point de sauvegarde. Vérifie la procédure de démarrage en la suivant réellement depuis un dépôt propre. Termine par un commit Conventional Commits en anglais."
```

---

### E20 — Version étendue *(Phase 7, hors MVP)*

##### CAL-198 · Génération complète du roman avec points de contrôle
- **État** : ⬜ **À faire**
- **Contenu** : enchaînement automatique de la rédaction avec validation obligatoire à intervalles définis, audit intermédiaire, arrêt sur incohérence grave.
- **Fini quand** : un roman de trente chapitres se génère par lots avec arrêt automatique en cas d'incohérence grave.
- **Modèle** : `fable` (Claude Fable 5) · **Effort** : `xhigh` · **Complexité** : 3/3
- **Pourquoi ce modèle** : orchestration à très long horizon, exactement le profil « tâche plus grande qu'une seule séance » pour lequel Fable 5 est conçu, et où sa propension à vérifier son travail avant de poursuivre est la propriété recherchée. Le cahier des charges exclut par ailleurs la génération sans validation : la difficulté est de placer les points de contrôle au bon endroit. Budget plafonné haut.
- **Commande** :

```bash
claude --model fable --effort xhigh --permission-mode plan --max-budget-usd 25 "ultrathink Conçois et implémente la génération complète du roman de Calepin, hors MVP. La rédaction s enchaîne par lots avec des points de contrôle obligatoires où l utilisateur valide avant poursuite, un audit de cohérence intermédiaire entre chaque lot, un arrêt automatique en cas d incohérence grave ou de dérive de coût, et une reprise possible au dernier point de contrôle. Le cahier des charges interdit la génération d un roman complet sans validation : les points de contrôle ne sont pas contournables. Détermine où les placer en fonction de la structure du plan plutôt qu à intervalle fixe. Écris ton plan dans tasks/todo.md avant d agir. Termine par un commit Conventional Commits en anglais."
```

##### CAL-199 · Export PDF
- **État** : ⬜ **À faire**
- **Contenu** : rendu paginé, typographie de lecture, page de titre, table des matières, numérotation.
- **Fini quand** : le PDF produit est imprimable sans défaut de pagination.
- **Modèle** : `opus` (Claude Opus 5) · **Effort** : `high` · **Complexité** : 2/3
- **Pourquoi ce modèle** : la pagination correcte (veuves, orphelines, sauts de chapitre) est un domaine technique précis ; les connaissances récentes d'Opus 5 sur les bibliothèques de rendu sont utiles.
- **Commande** :

```bash
claude --model opus --effort high "Implémente le rendu PDF de l export de Calepin en réutilisant le moteur de composition existant : mise en page paginée avec typographie de lecture, page de titre, table des matières avec numéros de page, en-têtes et pieds de page, gestion des veuves et orphelines, saut de page à chaque chapitre. Vérifie l absence de défaut de pagination sur un manuscrit de trente chapitres. Termine par un commit Conventional Commits en anglais."
```

##### CAL-200 · Export EPUB
- **État** : ⬜ **À faire**
- **Contenu** : structure EPUB valide, table des matières navigable, métadonnées, couverture optionnelle.
- **Fini quand** : le fichier passe une validation EPUB et s'ouvre correctement sur une liseuse.
- **Modèle** : `opus` (Claude Opus 5) · **Effort** : `xhigh` · **Complexité** : 3/3
- **Pourquoi ce modèle** : le format EPUB est normé et peu tolérant ; un fichier invalide est rejeté par les liseuses sans message utile. Rigueur technique élevée sur un format précis : Opus 5 à `xhigh`.
- **Commande** :

```bash
claude --model opus --effort xhigh --permission-mode plan "ultrathink Implémente le rendu EPUB de l export de Calepin : structure de paquet valide, un document par chapitre, table des matières navigable, métadonnées titre auteur langue identifiant, couverture optionnelle, feuille de style adaptée à la lecture. Le fichier produit doit passer une validation EPUB automatisée intégrée aux tests et s ouvrir correctement sur liseuse. Écris ton plan dans tasks/todo.md avant d agir. Termine par un commit Conventional Commits en anglais."
```

##### CAL-201 · Export HTML et texte brut
- **État** : ⬜ **À faire**
- **Contenu** : rendus HTML autonome et texte brut, à partir du même modèle de composition.
- **Fini quand** : les deux formats respectent la sélection de chapitres et les options communes.
- **Modèle** : `haiku` (Claude Haiku 4.5) · **Effort** : *n/a* · **Complexité** : 1/3
- **Pourquoi ce modèle** : deux rendus simples au-dessus d'un moteur de composition déjà construit et de trois rendus existants à imiter. Tâche mécanique dont tout le contexte est dans le dépôt — le créneau de Haiku 4.5. **Pas de `--effort`.**
- **Commande** :

```bash
claude --model haiku "Ajoute à l export de Calepin les rendus HTML autonome et texte brut, en suivant strictement le patron des rendus Markdown et DOCX déjà présents dans le dépôt. Les deux formats doivent respecter la sélection de chapitres et les options communes. Ajoute les tests par comparaison à des fichiers de référence. Termine par un commit Conventional Commits en anglais."
```

##### CAL-202 · Publication web — adresse publique et statuts
- **État** : ⬜ **À faire**
- **Contenu** : adresse publique par roman, statuts public, privé ou non répertorié, dépublication à tout moment.
- **Fini quand** : la publication n'est jamais automatique et la dépublication est immédiate.
- **Modèle** : `opus` (Claude Opus 5) · **Effort** : `high` · **Complexité** : 3/3
- **Pourquoi ce modèle** : bascule entre un périmètre strictement privé et un contenu public — la zone où une erreur expose le travail de l'utilisateur. Le cahier des charges impose que rien ne soit public sans action explicite.
- **Commande** :

```bash
claude --model opus --effort high --permission-mode plan "Implémente la publication web de Calepin : adresse publique stable par roman, statuts public, privé ou non répertorié, dépublication immédiate à tout moment avec purge des caches. La publication ne doit jamais être automatique après une génération et exige toujours une action explicite de l utilisateur. Ajoute des tests vérifiant qu un roman non publié n est accessible par aucun chemin public et qu une dépublication prend effet immédiatement. Écris ton plan dans tasks/todo.md avant d agir. Termine par un commit Conventional Commits en anglais."
```

##### CAL-203 · Publication web — page de présentation
- **État** : ⬜ **À faire**
- **Contenu** : page de présentation avec couverture, résumé, date de publication, navigation par chapitre.
- **Fini quand** : la page publique est lisible et référençable, sans exposer les éléments internes.
- **Modèle** : `sonnet` (Claude Sonnet 5) · **Effort** : `high` · **Complexité** : 2/3
- **Pourquoi ce modèle** : page publique classique, avec des règles d'exclusion déjà posées par le moteur d'export.
- **Commande** :

```bash
claude --model sonnet --effort high "Crée la page de présentation publique d un roman Calepin : couverture, titre, nom de l auteur, résumé, date de publication, navigation par chapitre. Aucun élément interne, bible, plan, diagnostic ou commentaire, ne doit y figurer. Ajoute les métadonnées de partage et un rendu correct sans JavaScript. Termine par un commit Conventional Commits en anglais."
```

##### CAL-204 · Publication web — confort de lecture
- **État** : ⬜ **À faire**
- **Contenu** : mode de lecture adapté aux écrans, taille de texte réglable, thème clair ou sombre, mémorisation de la position.
- **Fini quand** : lire un chapitre sur téléphone et sur ordinateur est confortable dans les deux thèmes.
- **Modèle** : `sonnet` (Claude Sonnet 5) · **Effort** : `high` · **Complexité** : 2/3
- **Pourquoi ce modèle** : travail d'interface de lecture s'appuyant sur le système de design existant.
- **Commande** :

```bash
claude --model sonnet --effort high "Implémente le lecteur public de Calepin : mise en page adaptée à la lecture sur écran avec largeur de colonne confortable, taille de texte réglable, thème clair ou sombre, mémorisation de la position de lecture, navigation entre chapitres au clavier. Réutilise le système de design existant. Termine par un commit Conventional Commits en anglais."
```

##### CAL-205 · Génération et gestion de la couverture
- **État** : ⬜ **À faire**
- **Contenu** : téléversement d'une couverture, recadrage, formats dérivés, stockage.
- **Fini quand** : une couverture téléversée s'affiche correctement sur la page publique et dans l'EPUB.
- **Modèle** : `sonnet` (Claude Sonnet 5) · **Effort** : `high` · **Complexité** : 2/3
- **Pourquoi ce modèle** : traitement d'image et stockage, patrons bien établis ; le cahier des charges exclut la génération avancée de couvertures du périmètre.
- **Commande** :

```bash
claude --model sonnet --effort high "Implémente la gestion de couverture de Calepin : téléversement d une image avec vérification de type et de taille, recadrage au format attendu, génération des variantes nécessaires, stockage privé et exposition publique uniquement pour un roman publié, intégration à la page publique et à l export EPUB. La génération avancée de couverture reste hors périmètre. Termine par un commit Conventional Commits en anglais."
```

##### CAL-206 · Crédits et estimation avant consommation
- **État** : ⬜ **À faire**
- **Contenu** : solde de crédits, coût par mission, estimation avant opération, historique de consommation.
- **Fini quand** : le coût affiché intègre les phases d'analyse et de contrôle, pas seulement les mots produits.
- **Modèle** : `opus` (Claude Opus 5) · **Effort** : `xhigh` · **Complexité** : 3/3
- **Pourquoi ce modèle** : la conception d'un système de crédits touche à la fois la comptabilité, l'idempotence et la confiance de l'utilisateur ; le cahier des charges impose explicitement de ne pas calculer le coût au seul volume produit. Opus 5 à `xhigh`.
- **Commande** :

```bash
claude --model opus --effort xhigh --permission-mode plan "ultrathink Conçois et implémente le système de crédits de Calepin : solde par utilisateur, coût en crédits par mission fondé sur les mesures réelles de consommation, estimation affichée et confirmée avant toute opération importante, débit uniquement après succès, historique de consommation détaillé. Contrainte du cahier des charges : le coût ne doit pas être calculé au seul nombre de mots produits, car les phases d analyse et de contrôle consomment également. Assure la cohérence avec le mécanisme d idempotence existant pour qu un échec système ne débite jamais deux fois. Écris ton plan dans tasks/todo.md avant d agir. Termine par un commit Conventional Commits en anglais."
```

##### CAL-207 · Offres et limites par formule
- **État** : ⬜ **À faire**
- **Contenu** : formule gratuite (projets limités, génération limitée, export Markdown) et formule payante (projets, longueurs, modèles, exports, historique, audits, publication).
- **Fini quand** : les limites sont appliquées côté serveur et non seulement masquées dans l'interface.
- **Modèle** : `opus` (Claude Opus 5) · **Effort** : `high` · **Complexité** : 3/3
- **Pourquoi ce modèle** : les limites d'offre sont un contrôle d'accès déguisé ; les appliquer uniquement dans l'interface est la faille classique. Le balayage de tous les points d'application justifie Opus 5.
- **Commande** :

```bash
claude --model opus --effort high --permission-mode plan "Implémente les formules de Calepin : offre gratuite avec nombre de projets limité, génération limitée, export Markdown et modèles standards ; offre payante avec davantage de projets, romans plus longs, modèles plus performants, exports DOCX PDF et EPUB, historique étendu, audits avancés et publication web. Applique chaque limite côté serveur au niveau de la couche métier, jamais uniquement par masquage dans l interface, et vérifie-le par des tests appelant directement les points d entrée. Écris ton plan dans tasks/todo.md avant d agir. Termine par un commit Conventional Commits en anglais."
```

---

### E21 — Mise en service des générations *(nouvel epic — à exécuter avant E11)*

> **Pourquoi cet epic existe.** Le dépôt contient 25 missions déclarées, 25 prompts, leurs contrats, leurs vérificateurs et leurs tests — et aucun exécuteur. `apps/worker/src/main.ts` compose `NO_GENERATION_EXECUTORS`, aucun processus ne compose de `ModelProviderPort`, et aucune fonction n'écrit le résultat d'une génération. Le backlog initial supposait ce câblage absorbé par CAL-051, CAL-060 et CAL-061 ; le dépôt l'a délibérément laissé à « la première tâche qui enregistre un exécuteur » (§13 du `CLAUDE.md`). Cet epic est cette tâche, et les neuf qui en découlent.
>
> **Il est sur le chemin critique.** Tant qu'il n'est pas fait, E11 (rédaction) n'a rien à rédiger, E12 (mémoire) rien à extraire, E13 (cohérence) rien à contrôler et E19 aucun parcours de bout en bout à prouver.

##### CAL-208 · Enregistrer le premier exécuteur et composer le port fournisseur
- **État** : ⬜ **À faire**
- **Contenu** : composition d'un `ModelProviderPort` dans `apps/worker` et dans `apps/web`, déclaration de `ANTHROPIC_API_KEY` et des identifiants Bedrock dans `envSchema`, enregistrement du premier `GenerationExecutor` (`ANALYZE_SOURCE_TEXT`), en remplacement de `NO_GENERATION_EXECUTORS`.
- **Fini quand** : une génération mise en file appelle réellement un modèle, l'attempt enregistre son modèle, ses jetons et sa durée, et §13 du `CLAUDE.md` perd sa première ligne.
- **Modèle** : `opus` (Claude Opus 5) · **Effort** : `xhigh` · **Complexité** : 3/3
- **Pourquoi ce modèle** : c'est la clé de voûte du produit, et le travail est **spécifié** — ADR-001 fixe la frontière, le port existe, le registre de missions existe, l'exécuteur est décrit comme « une ligne ici et rien d'autre ». Il ne s'agit donc pas d'un problème ambigu qui appellerait Fable 5, mais d'un câblage multicouche traversant les deux processus, la validation d'environnement, l'injection de dépendances et la transaction d'achèvement — cas d'usage central d'Opus 5. Sa date de connaissance de mai 2026 est décisive ici : c'est la seule tâche du dépôt qui touche réellement le SDK d'un fournisseur, et Sonnet 5 comme Fable 5 s'arrêtent en janvier 2026. `xhigh` parce que la tâche doit rester juste sur quatre couches à la fois sans franchir aucune frontière que le lint protège.
- **Commande** :

```bash
claude --model opus --effort xhigh --permission-mode plan "ultrathink Mets en service les générations de Calepin. Lis d abord ADR-001, la section 13 du CLAUDE.md, packages/ai/src/provider, packages/shared/src/generation et apps/worker/src/main.ts. Puis : déclare ANTHROPIC_API_KEY et les identifiants du fournisseur de secours dans envSchema et dans les trois fichiers .env.example ; compose un ModelProviderPort dans apps/worker et dans apps/web sans franchir les frontières de couches que le lint protège ; enregistre le premier GenerationExecutor, celui de ANALYZE_SOURCE_TEXT, en remplacement de NO_GENERATION_EXECUTORS. Prouve-le par un test d intégration avec un fournisseur simulé qui vérifie que l attempt enregistre modèle, jetons, durée et version de prompt, puis retire la première ligne du tableau de la section 13 du CLAUDE.md. Écris ton plan dans tasks/todo.md avant d agir. Termine par un commit Conventional Commits en anglais."
```

##### CAL-209 · Exécuter et persister l'analyse du texte source
- **État** : ⬜ **À faire**
- **Contenu** : chemin d'écriture d'une analyse générée — `Analysis`, `AnalysisSectionRevision`, `AnalysisElement` — depuis un `VerifiedSourceTextAnalysis`, dans la transaction qui achève la génération.
- **Fini quand** : lancer `analyze-source-text` sur un texte source produit une analyse consultable à l'écran de diagnostic, avec ses dix-sept sections et ses marqueurs fait/interprétation.
- **Modèle** : `opus` (Claude Opus 5) · **Effort** : `xhigh` · **Complexité** : 3/3
- **Pourquoi ce modèle** : c'est le **premier** chemin d'écriture d'un résultat généré, donc celui qui établit le patron que CAL-210 à CAL-212 répliqueront : écriture dans `completeGenerationAttempt`, jamais de donnée partielle, `origin: GENERATED`, lignée mintée, `Generation` nommée par la révision. Le dépôt possède déjà `editAnalysisSection` et `regenerateAnalysisSection` comme références exactes de forme. Conception structurante mais entièrement cadrée : Opus 5 à `xhigh`.
- **Commande** :

```bash
claude --model opus --effort xhigh --permission-mode plan "ultrathink Ajoute à Calepin le chemin d écriture d une analyse générée. Prends pour modèle exact editAnalysisSection et regenerateAnalysisSection déjà présents dans packages/shared/src/repository/analysis.ts. Écris une fonction qui persiste un VerifiedSourceTextAnalysis en Analysis, AnalysisSectionRevision et AnalysisElement, avec origin GENERATED, une lignée mintée par élément et le lien vers la Generation, à l intérieur de la transaction qui achève la tentative, sans jamais écrire de donnée partielle. Enregistre l exécuteur de la mission ANALYZE_SOURCE_TEXT. Prouve par un test d intégration que l analyse produite s affiche à l écran de diagnostic avec ses dix-sept sections et ses marqueurs. Écris ton plan dans tasks/todo.md avant d agir. Termine par un commit Conventional Commits en anglais."
```

##### CAL-210 · Exécuter et persister les trois directions
- **État** : ⬜ **À faire**
- **Contenu** : écriture des `CreativeDirection` produites par `propose-directions`, relance ciblée quand le portail de divergence ou le contrôle de conformité refuse.
- **Fini quand** : lancer la proposition produit trois directions divergentes en base, et une divergence insuffisante déclenche la relance que CAL-080 avait laissée à « la tâche de l'exécuteur ».
- **Modèle** : `opus` (Claude Opus 5) · **Effort** : `xhigh` · **Complexité** : 3/3
- **Pourquoi ce modèle** : CAL-079 et CAL-080 ont explicitement reporté ici la **boucle de relance** — les rapports `checkDirectionDivergence` et `checkDirectionProposalCompliance` existent, personne ne les exploite. Décider quoi relancer, combien de fois, et quoi faire d'un refus persistant, est une logique d'orchestration bornée à écrire avec soin. Opus 5, `xhigh`.
- **Commande** :

```bash
claude --model opus --effort xhigh --permission-mode plan "ultrathink Ajoute à Calepin l exécution et la persistance des directions romanesques. Enregistre l exécuteur de propose-directions, écris les trois CreativeDirection produites avec origin PROPOSED en réutilisant le patron d écriture établi pour l analyse, puis implémente la boucle de relance que CAL-079 et CAL-080 ont laissée à cette tâche : exploite les rapports de checkDirectionDivergence et de checkDirectionProposalCompliance, relance de façon ciblée en excluant les moteurs déjà produits via la variable excludedEngines du prompt, borne le nombre de relances et expose un refus explicite plutôt qu une boucle. Prouve par un test que trois directions volontairement peu divergentes déclenchent la relance. Écris ton plan dans tasks/todo.md avant d agir. Termine par un commit Conventional Commits en anglais."
```

##### CAL-211 · Exécuter et persister les cinq sections de bible
- **État** : ⬜ **À faire**
- **Contenu** : écriture des résultats de `define-novel-identity`, `define-style`, `create-character-sheet`, `relate-characters`, `define-world`, `build-timeline` et `extract-initial-facts` dans les neuf modèles concernés, sous le portail de verrous.
- **Fini quand** : une bible entière se génère depuis la direction canonique, et un élément verrouillé bloque la régénération avant l'appel au modèle.
- **Modèle** : `opus` (Claude Opus 5) · **Effort** : `xhigh` · **Complexité** : 3/3
- **Pourquoi ce modèle** : sept missions, neuf modèles Prisma, trois régimes de vérification distincts (refus global, abandon d'entrée, mise à null) et le portail de verrous de CAL-095 à respecter avant l'appel. Le volume et la précision requise en font la tâche la plus dense de l'epic. Les fonctions `resolve*` existent déjà et sont testées : il n'y a rien à inventer, tout à raccorder exactement. Opus 5 à `xhigh`.
- **Commande** :

```bash
claude --model opus --effort xhigh --permission-mode plan "ultrathink Ajoute à Calepin l exécution et la persistance de la bible narrative. Enregistre les exécuteurs de define-novel-identity, define-style, create-character-sheet, relate-characters, define-world, build-timeline et extract-initial-facts, et écris leurs résultats en réutilisant les fonctions resolve déjà livrées et testées dans packages/bible, sans réimplémenter aucune règle. Respecte le portail de verrous de readBibleLockGate avant tout appel de modèle, honore les trois régimes de vérification déjà définis, refus global, abandon d entrée et mise à null, et n écris jamais de section partielle. Prouve par un test d intégration qu une bible entière se génère depuis la direction canonique et qu un élément verrouillé bloque la régénération avant l appel. Écris ton plan dans tasks/todo.md avant d agir. Termine par un commit Conventional Commits en anglais."
```

##### CAL-212 · Exécuter et persister le plan
- **État** : ⬜ **À faire**
- **Contenu** : écriture des `Part`, `Thread`, `ChapterOutline`, `Chapter` produits par `split-into-parts` et `build-chapter-outline`, avec minting des clés d'ordre et sérialisation des lots.
- **Fini quand** : un plan complet se génère depuis la bible validée et s'affiche dans l'écran de plan, où le déplacement, la fusion et la scission déjà livrés opèrent dessus.
- **Modèle** : `opus` (Claude Opus 5) · **Effort** : `xhigh` · **Complexité** : 3/3
- **Pourquoi ce modèle** : c'est le chaînon qui rend utilisables CAL-104, CAL-105 et CAL-106, aujourd'hui alimentés par le seul jeu d'amorçage. Il faut minter les clés d'ordre fractionnaires, résoudre les libellés de fils en lignes `Thread` dont `openingChapterId` est non nul — donc écrire chapitres et fils dans le bon ordre — et enchaîner les lots par partie en portant les empreintes des lots précédents dans l'ask. Opus 5 à `xhigh`.
- **Commande** :

```bash
claude --model opus --effort xhigh --permission-mode plan "ultrathink Ajoute à Calepin l exécution et la persistance du plan. Enregistre les exécuteurs de split-into-parts et de build-chapter-outline, et écris les lignes produites par resolvePartStructure et resolveChapterOutlineBatch : Part, Thread, Chapter, ChapterOutline et leurs tables de liaison. Mint les clés d ordre fractionnaires plutôt que de stocker des positions, résous les libellés de fils en lignes Thread en respectant la contrainte non nulle sur le chapitre d ouverture, et enchaîne les lots partie par partie en portant dans l ask les empreintes des lots déjà produits, comme le contrat le prévoit. Prouve par un test d intégration qu un plan complet se génère depuis la bible validée, s affiche dans l écran de plan, et que le déplacement, la fusion et la scission déjà livrés opèrent dessus. Écris ton plan dans tasks/todo.md avant d agir. Termine par un commit Conventional Commits en anglais."
```

##### CAL-213 · Lancer une génération depuis l'interface
- **État** : ⬜ **À faire**
- **Contenu** : boutons de lancement sur les écrans d'analyse, de directions, de bible et de plan, adossés à l'estimation et à la confirmation existantes, avec suivi de progression.
- **Fini quand** : l'auteur lance chaque étape depuis l'écran correspondant, voit l'estimation, confirme, et suit la progression sans quitter la page.
- **Modèle** : `sonnet` (Claude Sonnet 5) · **Effort** : `high` · **Complexité** : 2/3
- **Pourquoi ce modèle** : toute la machinerie difficile est déjà là — `acceptOperationEstimate`, `costly-operation.ts`, le flux d'événements de CAL-062, le rejeu de CAL-063. Il reste à poser des boutons et des actions serveur au-dessus, sur des écrans existants : c'est du travail d'interface répétitif et cadré, le créneau où Sonnet 5 est le plus rentable.
- **Commande** :

```bash
claude --model sonnet --effort high "Ajoute à Calepin le lancement des générations depuis l interface. Sur les écrans d analyse, de directions, de bible et de plan, ajoute l action de lancement adossée au mécanisme d estimation et de confirmation déjà présent dans apps/web/src/lib/costly-operation.ts, et au flux de progression déjà livré. Aucune nouvelle règle métier : réutilise reserveGeneration, acceptOperationEstimate et enqueueGeneration tels quels. Le bouton est désactivé avec un motif lisible quand l étape amont n est pas validée ou qu un élément verrouillé bloque la génération. Ajoute les tests end-to-end. Termine par un commit Conventional Commits en anglais."
```

##### CAL-214 · Exécuteurs des missions secondaires d'analyse et de direction
- **État** : ⬜ **À faire**
- **Contenu** : exécuteurs de `detect-cliche-risks`, `assess-novel-potential`, `regenerate-analysis-section`, `evaluate-direction`, `replace-direction`, `combine-directions`.
- **Fini quand** : les six missions s'exécutent et écrivent leur résultat, la régénération de section utilisant `regenerateAnalysisSection` déjà livrée.
- **Modèle** : `opus` (Claude Opus 5) · **Effort** : `high` · **Complexité** : 2/3
- **Pourquoi ce modèle** : réplication du patron posé par CAL-209 et CAL-210 sur six missions dont les contrats, vérificateurs et prompts sont écrits, et dont deux disposent déjà de leur fonction d'écriture. Le travail est spécifié et répétitif mais touche six chemins de persistance distincts, ce qui exclut Haiku 4.5 — 200 k de contexte ne suffisent pas à tenir six missions et leurs cibles. Effort par défaut.
- **Commande** :

```bash
claude --model opus --effort high "Enregistre dans Calepin les exécuteurs des six missions secondaires : detect-cliche-risks, assess-novel-potential, regenerate-analysis-section, evaluate-direction, replace-direction et combine-directions. Réutilise le patron d écriture établi pour l analyse et les directions, et les fonctions de dépôt déjà livrées quand elles existent, notamment regenerateAnalysisSection. Respecte pour chacune le régime de vérification que son contrat déclare. Prouve chaque exécuteur par un test d intégration avec fournisseur simulé. Termine par un commit Conventional Commits en anglais."
```

##### CAL-215 · Exécuteur des contradictions de bible et gate de validation
- **État** : ⬜ **À faire**
- **Contenu** : exécuteur de `detect-bible-contradictions`, écriture des `QualityIssue` produites, branchement sur `validateBible`.
- **Fini quand** : la validation de la bible refuse tant qu'une contradiction critique repérée par le modèle reste non arbitrée, comme le fait déjà celle repérée par calcul.
- **Modèle** : `opus` (Claude Opus 5) · **Effort** : `high` · **Complexité** : 2/3
- **Pourquoi ce modèle** : CAL-099 a livré le moteur, les quatre contrôles calculables, la réconciliation par empreinte et le refus `BIBLE_NOT_COHERENT` ; il manque le seul contrôle adossé à un modèle. La difficulté est de ne pas rompre la règle de réconciliation — un contrôle non exécuté ne doit pas voir ses lignes fermées — ce qui demande de la rigueur, pas de l'invention.
- **Commande** :

```bash
claude --model opus --effort high "Enregistre dans Calepin l exécuteur de detect-bible-contradictions et branche-le sur la validation de la bible. Écris les QualityIssue produites avec leur empreinte, en passant à reconcileCoherenceIssues uniquement les identifiants de contrôles réellement exécutés, afin qu un contrôle non lancé ne referme pas ses lignes. La validation doit refuser tant qu une contradiction critique reste non arbitrée, exactement comme le font déjà les quatre contrôles calculables. Prouve par un test d intégration. Termine par un commit Conventional Commits en anglais."
```

##### CAL-216 · Preuve de bout en bout sur un projet réel
- **État** : ⬜ **À faire**
- **Contenu** : parcours complet exécuté contre un fournisseur réel sur un texte source du corpus — analyse, directions, bible, plan — avec relevé du coût, des durées et des défauts rencontrés.
- **Fini quand** : un projet a traversé les quatre étapes sans intervention manuelle en base, et le compte rendu nomme chaque défaut trouvé.
- **Modèle** : `fable` (Claude Fable 5) · **Effort** : `xhigh` · **Complexité** : 3/3
- **Pourquoi ce modèle** : c'est la première fois que la chaîne entière tourne, et les défauts y seront **de nature inconnue** — un prompt qui produit une sortie valide mais inexploitable, un budget de contexte trop serré, un vérificateur trop strict, un enchaînement de lots qui dérive. Diagnostiquer cela demande d'enquêter à travers quatre couches sans hypothèse de départ, sur une session longue : le profil pour lequel Fable 5 est explicitement recommandé, et où sa propension à vérifier son propre travail avant de conclure est la propriété recherchée. Budget plafonné, et la commande impose de ne rien corriger en silence.
- **Commande** :

```bash
claude --model fable --effort xhigh --permission-mode plan --max-budget-usd 25 "ultrathink Fais traverser à Calepin son parcours complet pour la première fois, contre un fournisseur réel, en partant d un texte source du corpus de référence committé. Enchaîne analyse, validation, directions, sélection de la direction canonique, bible complète, validation, découpage en parties et plans de chapitre, sans jamais écrire en base à la main. Relève pour chaque étape la durée, les jetons, le coût réel et l écart à l estimation. Chaque défaut rencontré, sortie valide mais inexploitable, budget de contexte trop serré, vérificateur trop strict, dérive d un enchaînement de lots, doit être nommé dans un compte rendu dans tasks/todo.md avec sa cause racine, et corrigé ou explicitement reporté avec son motif et la tâche qui le prendra. Ne corrige rien en silence et n affaiblis aucun vérificateur pour faire passer le parcours. Aucun contenu littéraire dans le compte rendu : durées, comptes, identifiants et codes d erreur seulement. Écris ton plan dans tasks/todo.md avant d agir. Termine par un commit Conventional Commits en anglais."
```

##### CAL-217 · Rattraper la dette de traçabilité de CAL-013 et CAL-038
- **État** : ⬜ **À faire**
- **Contenu** : sections de revue manquantes dans `tasks/todo.md` pour le schéma du texte source et pour l'écran d'état vide.
- **Fini quand** : les 108 tâches terminées ont chacune leur section de revue, conformément à la définition de terminé du `CLAUDE.md`.
- **Modèle** : `haiku` (Claude Haiku 4.5) · **Effort** : *n/a* · **Complexité** : 1/3
- **Pourquoi ce modèle** : rédaction de deux comptes rendus à partir de commits et de code déjà présents dans le dépôt — tout le contexte nécessaire est sous les yeux du modèle, aucune connaissance de l'écosystème récent n'est requise, aucune décision n'est à prendre. C'est exactement le créneau de Haiku 4.5, à un cinquième du prix d'Opus 5. **Pas de `--effort` : Haiku 4.5 ne le prend pas en charge.**
- **Commande** :

```bash
claude --model haiku "Rattrape la dette de traçabilité de Calepin. CAL-013, schéma du texte source et de ses versions, et CAL-038, écran d état vide, sont terminés et commités mais n ont pas de section de revue dans tasks/todo.md. Lis les commits et le code correspondants, puis rédige les deux sections manquantes en suivant exactement la forme des sections de revue voisines déjà présentes dans le fichier. Aucun contenu littéraire. Termine par un commit Conventional Commits en anglais."
```

---

## Partie C — Annexes

### C.1 Ordre d'exécution conseillé

*Révisé le 13 août 2026 d'après l'état réel du dépôt. L'ordre d'exécution n'est pas l'ordre de numérotation : E21 est numéroté en dernier et s'exécute maintenant.*

| Jalon | Epics | Tâches | État | Résultat attendu |
|---|---|---|---|---|
| J1 — Fondations | E00, E01, E02 | CAL-001 → CAL-031 | ✅ fait | Dépôt, schéma complet, authentification, isolation par propriétaire |
| J2 — Socle produit | E03, E04 | CAL-032 → CAL-047 | ✅ fait | Tableau de bord, création de projet, texte source contraint à 2 000 mots |
| J3 — Moteur IA | E05, E06 | CAL-048 → CAL-069 | ✅ fait | Abstraction fournisseur, registre des missions, contexte dynamique, file de tâches |
| J4 — Analyse et directions | E07, E08 | CAL-070 → CAL-087 | ✅ fait | Contrats, prompts, vérificateurs, écrans — **sans exécution** |
| J5 — Bible et début du plan | E09, E10 partiel | CAL-088 → CAL-106 | ✅ fait | Bible verrouillable, faits canoniques, parties, lots de chapitres, fusion et scission |
| **J5 bis — Mise en service** | **E21** | **CAL-208 → CAL-217** | ⬜ **suivant** | **Les missions s'exécutent réellement et leurs résultats sont persistés** |
| J5 ter — Fin du plan | E10 fin | CAL-107 → CAL-111 | ⬜ à faire | Ajout et verrouillage d'un chapitre, répercussions, fils, audit dramatique |
| J6 — Rédaction | E11, E14 | CAL-112 → CAL-125, CAL-146 → CAL-153 | ⬜ à faire | Trois chapitres rédigés, éditeur, versionnement réversible |
| J7 — Mémoire et cohérence | E12, E13 | CAL-126 → CAL-145 | ⬜ à faire | Extraction de faits, arbitrage des conflits, audits qualité |
| J8 — Export et mise en production | E15, E16, E17, E18, E19 | CAL-154 → CAL-197 | ⬜ à faire | Export Markdown et DOCX, sécurité, accessibilité, tests, indicateurs |
| J9 — Version étendue | E20 | CAL-198 → CAL-207 | ⬜ à faire | Roman complet, EPUB, PDF, publication web, crédits |

**Pourquoi J5 bis passe devant J5 ter.** CAL-107 à CAL-111 opèrent sur des lignes de plan qu'aujourd'hui seul `prisma/seed.ts` sait créer. CAL-108 en particulier — l'analyse des répercussions — n'a rien de réel à analyser tant qu'un plan n'a pas été généré. Faire l'epic de mise en service d'abord évite de bâtir cinq tâches de plus au-dessus d'un jeu d'amorçage.

Le MVP tel que défini à la section 2.3 du cahier des charges est atteint à la fin du jalon J8. Les critères d'acceptation de la section 13 sont couverts par CAL-041, CAL-070, CAL-071, CAL-079, CAL-080, CAL-095, CAL-102, CAL-122, CAL-127, CAL-155, CAL-156, CAL-192 — et désormais par CAL-208 à CAL-212, sans lesquels aucun des cinq premiers ne produit d'effet observable pour un utilisateur.

### C.2 Récapitulatif par modèle

| Modèle | Total | Dont restant | Familles de tâches concernées |
|---|---|---|---|
| `opus` (Opus 5) | 102 | **54** | Schémas de données, couche IA, mise en service des générations, mémoire narrative, sécurité, export DOCX et EPUB, accessibilité clavier |
| `sonnet` (Sonnet 5) | 71 | **35** | Écrans, endpoints, formulaires, listes, tests, instrumentation, adaptation responsive |
| `fable` (Fable 5) | 29 | **13** | Missions littéraires restantes, audits de structure et d'originalité, recalcul de mémoire, preuve de bout en bout, génération complète |
| `haiku` (Haiku 4.5) | 15 | **9** | Réplications de patron, libellés, historiques d'affichage, rendus dérivés, dette de traçabilité |
| **Total** | **217** | **111** | |

Répartition par complexité sur l'ensemble : **25 tâches en 1/3**, **98 en 2/3**, **94 en 3/3**.

**Ce que le dépôt a appris sur l'affectation.** Les 106 tâches réalisées valident la doctrine sur un point précis : les tâches confiées à Fable 5 — modèle des faits canoniques, composeur de contexte, divergence des moteurs narratifs, moteur d'audit — sont exactement celles dont le `CLAUDE.md` du dépôt cite aujourd'hui les décisions comme structurantes, et aucune n'a eu à être reprise. Symétriquement, les tâches Haiku 4.5 se sont toutes révélées être des réplications de patrons déjà présents, ce qui était la condition posée. Le seul ajustement de doctrine que cette mise à jour opère concerne **CAL-208** : le câblage d'un fournisseur est une tâche `opus` et non `fable`, parce qu'elle est entièrement spécifiée par ADR-001 et parce qu'elle est la seule du dépôt à toucher réellement un SDK de fournisseur — terrain où la date de connaissance de mai 2026 d'Opus 5 est un avantage décisif sur les deux modèles arrêtés en janvier 2026.

### C.3 Répartition des niveaux d'effort

| Niveau | Tâches | Usage retenu dans ce backlog |
|---|---|---|
| `low` | 0 | Non utilisé : aucune tâche de ce backlog n'est à la fois assez courte et assez insensible à l'intelligence pour le justifier — ces tâches-là sont confiées à Haiku 4.5, qui n'a pas de niveau d'effort |
| `medium` | 5 *(2 restantes)* | Configuration d'outillage, filtres du tableau de bord, adaptation téléphone, instrumentation dérivée |
| `high` | 132 *(63 restantes)* | Défaut du produit : tout travail spécifié à exécution soignée |
| `xhigh` | 64 *(36 restantes)* | Conception structurante, missions littéraires, balayages exhaustifs, orchestration longue, mise en service des générations |
| `max` | 1 *(1 restante)* | Revue de sécurité avant mise en production (CAL-196) uniquement — niveau session, sujet à la sur-réflexion, à réserver aux passes ponctuelles à fort enjeu |
| *n/a* | 15 *(9 restantes)* | Tâches confiées à Haiku 4.5, qui ne prend pas en charge le paramètre d'effort |

### C.4 Réglages de session recommandés

Avant d'attaquer une série de tâches, poser le contexte une fois pour toutes :

```bash
claude update
```

**Windows PowerShell** — sous-agents économiques pendant les tâches de recherche et de balayage :

```powershell
$env:CLAUDE_CODE_SUBAGENT_MODEL="haiku"
```

Repasser à la résolution normale quand les sous-agents doivent raisonner (audits, revues, conception) :

```powershell
$env:CLAUDE_CODE_SUBAGENT_MODEL="inherit"
```

**Alias utile pour les tâches de type conception puis exécution** — `opusplan` planifie avec Opus puis exécute avec Sonnet :

```bash
claude --model opusplan --effort high
```

Il constitue une alternative économique sur les tâches de complexité 2/3 affectées à `opus` dont l'exécution est mécanique une fois le plan arrêté. À ne pas utiliser sur les tâches 3/3, où le raisonnement reste nécessaire pendant l'écriture du code.

**En cours de session** : `/model fable` pour monter, `/effort xhigh` pour approfondir, `/effort auto` pour revenir au défaut du modèle actif.

### C.5 Sept erreurs d'affectation à éviter

1. **Confier à Haiku 4.5 du code dépendant de l'écosystème récent.** Ses connaissances s'arrêtent en février 2025 ; il écrira du Next.js, du Prisma et du BullMQ plausibles mais périmés. Il n'est employé ici que lorsque le patron à suivre est déjà présent dans le dépôt.
2. **Passer `--effort` à Haiku 4.5.** Le modèle ne prend pas en charge l'effort ; le drapeau est ignoré et donne une fausse impression de contrôle.
3. **Employer Fable 5 sur les tâches de sécurité.** Ses classifieurs de sûreté signalent fréquemment les domaines cybersécurité, ce qui déclenche un repli automatique vers un autre modèle sans que ce soit visible dans la sortie. E16 et CAL-192 sont donc affectés à Opus 5.
4. **Employer Fable 5 sur du CRUD.** À 50 $ par million de jetons de sortie contre 15 $ pour Sonnet 5, l'écart n'est justifié que par un problème réellement ambigu.
5. **Régler `max` par défaut.** La documentation officielle prévient que ce niveau montre des rendements décroissants et tend à la sur-réflexion. Une seule tâche de ce backlog l'utilise.
6. **Oublier que l'échelle d'effort est calibrée par modèle.** `xhigh` sur Sonnet 5 et `xhigh` sur Fable 5 ne représentent pas la même dépense ; comparer les coûts entre modèles à niveau égal induit en erreur.
7. **Monter de modèle quand le problème est un manque d'effort.** La règle officielle : si Claude n'a pas *su*, change de modèle ; s'il n'a pas *essayé* assez — fichiers non lus, tests non lancés, tâche abandonnée en route — monte l'effort d'un cran avant de changer de modèle.

### C.6 Une note de calendrier

Sonnet 5 bénéficie d'un tarif d'introduction de 2 $ / 10 $ par million de jetons **jusqu'au 31 août 2026**, contre 3 $ / 15 $ ensuite — soit dix-huit jours au moment de cette mise à jour. Il reste **35 tâches `sonnet`**, concentrées sur J6 (éditeur de manuscrit), J8 (export, accessibilité, tests) et sur CAL-213. Celles qui ne dépendent pas de l'epic de mise en service — notamment CAL-119, CAL-141, CAL-147, CAL-155, CAL-157, CAL-182, CAL-183, CAL-185, CAL-187 et CAL-189 — peuvent être avancées en parallèle de E21 à coût réduit d'un tiers, puisqu'elles ne touchent ni la couche IA ni la persistance des générations.

### C.7 Règle ajoutée le 13 août 2026

**Toute tâche dont le livrable est une mission livre désormais son exécuteur, son chemin d'écriture et une génération réellement exécutée en preuve.**

La convention précédente — livrer le contrat, le schéma, le vérificateur et le prompt, et laisser le câblage à plus tard — était juste tant qu'aucun exécuteur n'existait : elle a permis de construire 25 missions cohérentes entre elles sans dépendre d'une clé de fournisseur. Elle cesse de l'être dès CAL-208, et la maintenir plus longtemps reproduirait la situation que cet epic corrige, avec dix-neuf missions au lieu de zéro.

Concrètement, cela s'applique aux missions restantes dont les prompts sont **déjà écrits** dans `packages/ai/src/prompts/missions/` mais qu'aucune tâche n'exécute encore : `write-scene` (CAL-112), `extract-facts` (CAL-126), `check-coherence` (CAL-136 à CAL-140), `fix-issue` (CAL-143), `summarize-chapter` et `summarize-part` (CAL-125). Aucune de ces tâches ne doit être déclarée terminée sur la seule foi d'un contrat validé par un test à fournisseur simulé.

---

*Sources des données de modèles et de commandes : documentation officielle Anthropic — [Models overview](https://platform.claude.com/docs/en/about-claude/models/overview), [Effort](https://platform.claude.com/docs/en/build-with-claude/effort), [Model configuration (Claude Code)](https://code.claude.com/docs/en/model-config), [CLI reference](https://code.claude.com/docs/en/cli-reference), [Choosing a Claude model and effort level in Claude Code](https://claude.com/blog/claude-model-and-effort-level-in-claude-code). Consultées le 7 août 2026.*

