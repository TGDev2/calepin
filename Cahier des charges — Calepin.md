# Cahier des charges — Calepin

## 1. Présentation du projet

### 1.1 Nom du projet

**Calepin** est le nom provisoire du produit.

### 1.2 Nature du projet

Calepin est une application web personnelle permettant de transformer une fiction courte en projet de roman structuré.

L’utilisateur fournit un texte narratif de moins de 2 000 mots. L’application analyse ce texte, en extrait les éléments essentiels, propose plusieurs directions romanesques, construit une bible narrative, élabore un plan détaillé, puis accompagne la rédaction progressive du roman.

Le produit ne doit pas simplement allonger artificiellement le texte d’origine. Il doit préserver ce qui rend celui-ci singulier tout en développant son univers, ses personnages, ses enjeux et sa structure dramatique.

Le roman obtenu doit pouvoir être relu, modifié, exporté et éventuellement publié sur le web.

### 1.3 Problème identifié

Les outils de génération de texte existants savent produire rapidement de longues quantités de prose, mais rencontrent plusieurs limites lorsqu’ils sont utilisés pour écrire un roman complet :

- perte progressive de la cohérence ;
- répétition des mêmes situations ;
- personnages dont la personnalité évolue sans justification ;
- oubli d’événements ou d’informations importantes ;
- banalisation du concept initial ;
- recours excessif aux clichés ;
- chapitres sans fonction dramatique ;
- fins précipitées ou prévisibles ;
- difficulté à reprendre manuellement le contrôle du texte ;
- absence de véritable mémoire narrative.

Calepin doit résoudre ces problèmes en séparant l’analyse, la conception, la planification, la rédaction et la révision.

### 1.4 Vision du produit

Calepin doit fonctionner comme un atelier éditorial assisté par intelligence artificielle.

L’intelligence artificielle propose, analyse, structure et rédige, mais l’utilisateur reste décisionnaire. Toute évolution majeure du roman doit être visible, compréhensible et modifiable.

Le produit doit privilégier la cohérence et la qualité narrative plutôt que la vitesse de génération.

---

## 2. Objectifs

### 2.1 Objectif principal

Permettre à un utilisateur de transformer une fiction courte en un roman cohérent, structuré, modifiable et exportable.

### 2.2 Objectifs secondaires

L’application doit permettre de :

- identifier les forces et les faiblesses du texte source ;
- préserver la promesse émotionnelle et thématique du texte ;
- proposer plusieurs développements narratifs distincts ;
- éviter les directions trop convenues ou prévisibles ;
- construire une bible de référence pour le roman ;
- créer un plan détaillé en parties, chapitres et scènes ;
- rédiger progressivement le manuscrit ;
- détecter les incohérences ;
- maintenir une mémoire fiable des faits du récit ;
- comparer plusieurs versions d’un même chapitre ;
- exporter le manuscrit dans des formats courants ;
- publier une version lisible sur le web.

### 2.3 Objectifs du MVP

La première version doit permettre à l’utilisateur de :

1. créer un projet ;
2. coller une fiction de moins de 2 000 mots ;
3. lancer son analyse ;
4. consulter un diagnostic narratif ;
5. comparer trois directions romanesques ;
6. sélectionner et modifier une direction ;
7. générer une bible narrative ;
8. générer un plan complet du roman ;
9. rédiger les trois premiers chapitres ;
10. modifier ou régénérer ces chapitres ;
11. exporter le projet en Markdown ou DOCX.

La génération complète d’un roman, l’export EPUB avancé et la publication publique peuvent être intégrés dans une version ultérieure.

---

## 3. Public cible

### 3.1 Utilisateur principal

Le produit s’adresse en priorité à une personne qui écrit des nouvelles, des fragments narratifs ou des concepts de fiction et souhaite les développer sous la forme d’un roman.

L’utilisateur peut être :

- un auteur amateur ;
- un auteur expérimenté cherchant un outil de structuration ;
- une personne disposant d’une idée mais ne maîtrisant pas la construction romanesque ;
- un utilisateur souhaitant publier une fiction sur le web ;
- un créateur utilisant l’intelligence artificielle comme partenaire éditorial.

### 3.2 Niveau technique attendu

Aucune compétence technique ne doit être nécessaire.

L’interface doit employer un vocabulaire littéraire accessible. Les notions plus spécialisées, comme le point de vue, l’arc dramatique ou la focalisation, doivent être accompagnées d’une courte explication lorsque cela est nécessaire.

---

## 4. Principes directeurs

### 4.1 Contrôle utilisateur

L’intelligence artificielle ne doit pas modifier silencieusement les éléments validés.

Toute modification importante de la bible, des personnages, du plan ou de la fin doit être présentée comme une proposition.

### 4.2 Traçabilité

L’utilisateur doit pouvoir distinguer :

- le texte d’origine ;
- les propositions de l’intelligence artificielle ;
- les éléments validés ;
- les modifications manuelles ;
- les anciennes versions.

### 4.3 Génération progressive

Le roman ne doit pas être généré en une seule opération.

La génération doit être divisée en étapes :

1. analyse ;
2. exploration ;
3. choix narratif ;
4. création de la bible ;
5. planification ;
6. rédaction ;
7. contrôle ;
8. révision ;
9. export.

### 4.4 Mémoire narrative

Le système doit maintenir une représentation structurée du roman.

Cette mémoire doit contenir les personnages, les événements, les lieux, les objets importants, les relations, les secrets, les connaissances de chaque personnage et les fils narratifs encore ouverts.

### 4.5 Originalité relative

L’application ne doit jamais garantir qu’une œuvre est totalement originale.

Elle doit cependant identifier les éléments convenus, produire plusieurs directions incompatibles et expliquer pourquoi certaines propositions sont moins intéressantes que d’autres.

### 4.6 Réversibilité

Chaque génération importante doit créer une nouvelle version.

L’utilisateur doit pouvoir restaurer une version antérieure sans perdre les suivantes.

---

## 5. Périmètre fonctionnel

## 5.1 Authentification

L’utilisateur doit pouvoir créer un compte et se connecter.

Le MVP peut proposer une authentification par :

- adresse électronique et lien de connexion ;
- compte Google ;
- compte GitHub.

Chaque projet doit être strictement associé à son propriétaire.

Une utilisation locale sans compte pourra être étudiée ultérieurement.

## 5.2 Tableau de bord

Le tableau de bord présente les projets de l’utilisateur.

Pour chaque projet, il affiche :

- le titre ;
- le statut ;
- la date de dernière modification ;
- le nombre de chapitres prévus ;
- le nombre de chapitres rédigés ;
- le nombre total de mots ;
- l’étape actuelle du processus.

Les statuts possibles sont :

- brouillon ;
- analyse en cours ;
- direction à choisir ;
- bible à valider ;
- plan en construction ;
- rédaction en cours ;
- révision ;
- terminé ;
- publié ;
- archivé.

L’utilisateur peut créer, ouvrir, dupliquer, renommer, archiver ou supprimer un projet.

## 5.3 Création d’un projet

Lors de la création, l’utilisateur renseigne :

- un titre provisoire ;
- le texte source ;
- la langue du texte ;
- la longueur souhaitée du roman ;
- le public visé ;
- le degré de liberté laissé à l’intelligence artificielle.

Le texte source est limité à 2 000 mots.

Le système doit afficher le nombre de mots en temps réel.

La longueur cible peut être choisie parmi plusieurs options :

- roman court : 30 000 à 45 000 mots ;
- roman standard : 50 000 à 80 000 mots ;
- roman long : 80 000 à 110 000 mots ;
- longueur personnalisée.

Le degré de liberté peut être défini comme :

- faible : développement très fidèle au texte initial ;
- équilibré : conservation du noyau avec ajouts significatifs ;
- élevé : réinterprétation autorisée tant que les thèmes essentiels sont conservés.

## 5.4 Analyse du texte source

L’application génère un diagnostic structuré.

Le diagnostic doit comprendre :

- un résumé factuel ;
- la prémisse ;
- le conflit principal ;
- la promesse du récit ;
- les thèmes ;
- les personnages identifiés ;
- les relations ;
- le point de vue ;
- le temps verbal ;
- la tonalité ;
- les éléments singuliers ;
- les ambiguïtés ;
- les questions non résolues ;
- les éléments à préserver ;
- les fragilités ;
- les risques de clichés ;
- le potentiel de développement en roman.

Le système doit distinguer les faits explicites des interprétations.

Chaque section peut être modifiée ou annotée par l’utilisateur.

L’utilisateur doit valider l’analyse avant de passer à l’étape suivante.

## 5.5 Exploration des directions romanesques

L’application propose trois directions narratives distinctes dans le MVP.

Chaque proposition doit comporter :

- un titre de travail ;
- une prémisse développée ;
- le genre dominant ;
- le conflit principal ;
- la trajectoire du protagoniste ;
- les nouveaux enjeux ;
- les personnages à introduire ;
- la nature de la fin ;
- les principaux risques ;
- les éléments du texte source conservés ;
- les éléments transformés ;
- une évaluation de son potentiel romanesque.

Les propositions doivent être incompatibles sur leur moteur narratif, et non seulement sur leur décor.

Le système doit éviter de proposer trois variations presque identiques.

L’utilisateur peut :

- sélectionner une proposition ;
- demander le remplacement d’une proposition ;
- combiner certains éléments ;
- modifier directement une direction ;
- rédiger sa propre direction.

Une seule direction devient ensuite la direction canonique du projet.

## 5.6 Bible narrative

La bible constitue la référence officielle du roman.

Elle comprend les sections suivantes.

### Identité du roman

- titre provisoire ;
- genre ;
- sous-genre ;
- public ;
- longueur cible ;
- tonalité ;
- promesse narrative ;
- thèmes ;
- contre-thèmes ;
- question centrale ;
- type de fin envisagé.

### Style

- point de vue ;
- focalisation ;
- temps verbal ;
- niveau de langue ;
- densité descriptive ;
- rythme ;
- place du dialogue ;
- motifs récurrents ;
- éléments stylistiques à éviter.

### Personnages

Chaque personnage possède une fiche contenant :

- nom ;
- âge ;
- rôle ;
- apparence utile au récit ;
- situation initiale ;
- désir apparent ;
- besoin profond ;
- peur ;
- contradiction ;
- secret ;
- passé ;
- relations ;
- évolution prévue ;
- manière de parler ;
- connaissances détenues ;
- éléments à ne pas modifier.

### Monde

La bible du monde contient :

- époque ;
- lieux ;
- contexte social ;
- contexte politique éventuel ;
- règles du monde ;
- technologies ;
- institutions ;
- contraintes ;
- éléments surnaturels éventuels ;
- limites de ces éléments.

### Chronologie

La chronologie distingue :

- les événements antérieurs au roman ;
- les événements racontés ;
- les événements prévus ;
- l’âge des personnages à chaque événement ;
- les durées entre les événements.

### Faits canoniques

Chaque fait canonique doit être formulé de manière atomique.

Exemples :

- « La maison ne possède pas de cave. »
- « Nora ignore que son père est encore vivant. »
- « L’accident s’est produit en novembre 1998. »

Un fait peut être :

- permanent ;
- vrai pendant une période ;
- faux après un événement ;
- connu de certains personnages seulement.

L’utilisateur peut verrouiller un fait afin d’empêcher sa modification automatique.

## 5.7 Construction du plan

Le système propose un découpage en parties et chapitres.

Chaque partie contient :

- un objectif dramatique ;
- un état initial ;
- un basculement ;
- un état final ;
- les principaux fils narratifs concernés.

Chaque chapitre contient :

- un numéro ;
- un titre provisoire ;
- une longueur cible ;
- un personnage focal ;
- un lieu ;
- une période ;
- une fonction dramatique ;
- un objectif immédiat ;
- un obstacle ;
- une décision ;
- une révélation éventuelle ;
- une conséquence ;
- les personnages présents ;
- les faits canoniques concernés ;
- les fils narratifs ouverts, poursuivis ou fermés ;
- un résumé détaillé.

L’utilisateur doit pouvoir :

- déplacer un chapitre ;
- fusionner deux chapitres ;
- diviser un chapitre ;
- ajouter un chapitre ;
- supprimer un chapitre ;
- modifier son contenu ;
- demander une nouvelle proposition ;
- verrouiller un chapitre.

Après une modification, l’application doit signaler les répercussions possibles sur la suite du plan.

## 5.8 Rédaction des chapitres

La rédaction s’effectue chapitre par chapitre.

Avant chaque génération, l’utilisateur peut préciser :

- la longueur souhaitée ;
- le rythme ;
- les éléments à accentuer ;
- les éléments à éviter ;
- une instruction particulière.

La génération doit utiliser :

- la bible validée ;
- le plan du chapitre ;
- les événements déjà rédigés ;
- l’état actuel des personnages ;
- les faits canoniques concernés ;
- les fils narratifs en cours ;
- les extraits précédents nécessaires à la continuité.

Après génération, l’utilisateur peut :

- modifier manuellement le texte ;
- sélectionner un passage ;
- demander une reformulation ;
- développer une scène ;
- raccourcir une scène ;
- améliorer un dialogue ;
- modifier le rythme ;
- renforcer un point de vue ;
- supprimer une répétition ;
- régénérer le chapitre ;
- comparer plusieurs versions ;
- valider le chapitre.

Une régénération ne doit pas écraser la version précédente.

## 5.9 Mise à jour de la mémoire après rédaction

Après validation d’un chapitre, le système analyse son contenu.

Il extrait ou met à jour :

- les événements ;
- les blessures ;
- les déplacements ;
- les objets acquis ou perdus ;
- les informations découvertes ;
- les relations modifiées ;
- les promesses narratives ;
- les questions ouvertes ;
- l’état émotionnel des personnages ;
- les faits nouveaux.

Les nouveaux faits ne deviennent pas automatiquement canoniques lorsqu’ils contredisent la bible.

Dans ce cas, l’application doit présenter le conflit à l’utilisateur.

## 5.10 Contrôle de cohérence

Le système doit détecter plusieurs catégories de problèmes :

### Continuité factuelle

- changement de nom ;
- âge incompatible ;
- lieu impossible ;
- objet réapparaissant après sa destruction ;
- erreur de date ;
- durée incohérente ;
- blessure oubliée ;
- connaissance injustifiée.

### Continuité psychologique

- changement brutal de motivation ;
- réaction incompatible avec le personnage ;
- décision non préparée ;
- évolution trop rapide.

### Structure

- chapitre sans conséquence ;
- répétition d’un même enjeu ;
- absence de progression ;
- révélation prématurée ;
- résolution tardive ou précipitée ;
- fil narratif abandonné.

### Style

- répétitions lexicales ;
- tics d’écriture ;
- dialogues interchangeables ;
- sur-explication ;
- descriptions génériques ;
- métaphores répétitives ;
- variations injustifiées du temps verbal.

### Originalité

- scène très attendue ;
- trope utilisé sans transformation ;
- antagoniste caricatural ;
- retournement prévisible ;
- personnage uniquement fonctionnel ;
- résolution reposant sur une coïncidence.

Chaque problème doit comporter :

- une catégorie ;
- une gravité ;
- une explication ;
- les passages concernés ;
- une proposition de correction ;
- un statut.

Les statuts possibles sont :

- détecté ;
- accepté ;
- à corriger ;
- corrigé ;
- ignoré.

## 5.11 Gestion des versions

Les éléments suivants doivent être versionnés :

- texte source ;
- analyse ;
- direction ;
- bible ;
- plan ;
- chapitres ;
- résumé ;
- titre ;
- textes de publication.

L’utilisateur doit pouvoir :

- consulter l’historique ;
- comparer deux versions ;
- restaurer une version ;
- nommer une version ;
- créer un point de sauvegarde.

## 5.12 Éditeur de manuscrit

L’éditeur doit proposer :

- une navigation par partie et chapitre ;
- un mode plein écran ;
- un compteur de mots ;
- une sauvegarde automatique ;
- une recherche ;
- un remplacement ;
- un historique ;
- des commentaires personnels ;
- un statut par chapitre ;
- un affichage des problèmes détectés ;
- un accès rapide aux personnages et aux faits associés.

Les statuts de chapitre sont :

- planifié ;
- à rédiger ;
- génération en cours ;
- premier jet ;
- à corriger ;
- validé ;
- verrouillé.

## 5.13 Export

Le MVP doit permettre l’export en :

- Markdown ;
- DOCX.

Les versions ultérieures doivent ajouter :

- PDF ;
- EPUB ;
- texte brut ;
- HTML.

L’export doit permettre de choisir :

- le titre ;
- le nom de l’auteur ;
- les chapitres inclus ;
- la présence d’une table des matières ;
- la présence des numéros de chapitre ;
- la page de titre ;
- les sauts de page ;
- les métadonnées ;
- les notes éventuelles.

Les éléments internes comme la bible, les commentaires et les diagnostics ne doivent pas apparaître dans le manuscrit, sauf demande explicite.

## 5.14 Publication web

Dans une version ultérieure, l’utilisateur pourra publier un roman ou certains chapitres.

La publication doit proposer :

- une adresse publique ;
- une page de présentation ;
- une couverture ;
- un résumé ;
- une navigation par chapitre ;
- un mode de lecture adapté aux écrans ;
- une taille de texte réglable ;
- un thème clair ou sombre ;
- une date de publication ;
- un statut public, privé ou non répertorié.

L’utilisateur doit pouvoir dépublier son texte à tout moment.

La publication ne doit jamais être automatique après génération.

---

## 6. Intelligence artificielle

## 6.1 Rôle de l’intelligence artificielle

L’intelligence artificielle intervient comme :

- analyste littéraire ;
- concepteur narratif ;
- assistant de planification ;
- rédacteur ;
- contrôleur de continuité ;
- assistant de révision.

Elle ne doit pas être présentée comme un auteur autonome garantissant la qualité finale.

## 6.2 Séparation des traitements

Chaque traitement doit posséder une mission précise.

Exemples :

- analyser le texte ;
- proposer des directions ;
- évaluer une direction ;
- créer une fiche personnage ;
- construire un chapitre ;
- rédiger une scène ;
- extraire les faits ;
- contrôler la cohérence ;
- corriger un problème ciblé.

Les missions ne doivent pas être regroupées dans un unique prompt généraliste.

## 6.3 Sorties structurées

Les étapes d’analyse, de planification et de contrôle doivent produire des données structurées conformes à un schéma défini.

La prose libre doit être réservée principalement :

- aux chapitres ;
- aux résumés éditoriaux ;
- aux propositions de réécriture ;
- aux textes de publication.

## 6.4 Contexte transmis

Le système ne doit pas transmettre l’intégralité du roman à chaque génération lorsque cela n’est pas nécessaire.

Le contexte doit être composé dynamiquement à partir :

- des instructions permanentes ;
- de la bible ;
- du plan ;
- des faits concernés ;
- des résumés précédents ;
- des extraits nécessaires ;
- de la demande de l’utilisateur.

## 6.5 Résistance aux incohérences

Lorsqu’une instruction utilisateur contredit un élément verrouillé, l’application doit le signaler avant la génération ou demander si le verrou doit être levé.

## 6.6 Gestion des erreurs

En cas d’échec d’une génération :

- le projet ne doit pas être corrompu ;
- l’étape doit pouvoir être relancée ;
- la dernière version valide doit être conservée ;
- un message compréhensible doit être affiché ;
- aucune facturation interne ne doit être comptabilisée deux fois si l’échec provient du système.

---

## 7. Données principales

Le système doit au minimum gérer les entités suivantes :

- utilisateur ;
- projet ;
- version du texte source ;
- analyse narrative ;
- direction créative ;
- bible ;
- personnage ;
- relation ;
- lieu ;
- événement ;
- fait canonique ;
- partie ;
- plan de chapitre ;
- chapitre ;
- version de chapitre ;
- fil narratif ;
- génération ;
- problème de qualité ;
- export ;
- publication.

Chaque donnée importante doit comporter :

- un identifiant ;
- une date de création ;
- une date de modification ;
- un auteur de la modification ;
- un statut ;
- un numéro de version lorsque cela est nécessaire.

---

## 8. Architecture technique envisagée

## 8.1 Frontend

L’interface peut être développée avec Next.js et TypeScript.

Elle doit être compatible avec les navigateurs modernes sur ordinateur et tablette.

Le développement mobile natif n’entre pas dans le périmètre initial.

## 8.2 Backend

Le backend peut être intégré à Next.js pour le MVP ou être séparé dans un service dédié si les traitements deviennent plus complexes.

Il doit prendre en charge :

- l’authentification ;
- les projets ;
- les versions ;
- les générations ;
- les exports ;
- les autorisations ;
- la publication.

## 8.3 Base de données

PostgreSQL est recommandé comme base principale.

Les données narratives structurées peuvent être stockées dans des tables relationnelles, complétées par des colonnes JSON lorsque leur structure est susceptible d’évoluer.

## 8.4 Tâches asynchrones

Les générations longues doivent être exécutées par un système de tâches.

Une file de messages fondée sur Redis et BullMQ peut être utilisée pour :

- l’analyse ;
- la génération du plan ;
- la rédaction ;
- les audits ;
- les exports ;
- les reprises après erreur.

## 8.5 Stockage de fichiers

Un stockage compatible S3 doit être utilisé pour :

- les exports ;
- les couvertures ;
- les sauvegardes ;
- les éventuelles pièces jointes.

## 8.6 Fournisseurs d’intelligence artificielle

L’architecture doit éviter une dépendance totale à un fournisseur unique.

Une interface commune doit permettre de changer de modèle selon la tâche.

Exemple :

- modèle puissant pour la conception ;
- modèle moins coûteux pour l’extraction ;
- modèle spécialisé pour la révision ;
- modèle de secours en cas d’indisponibilité.

---

## 9. Exigences non fonctionnelles

## 9.1 Performance

Les pages classiques doivent s’afficher rapidement.

Les générations longues doivent être asynchrones et afficher leur progression.

L’utilisateur doit pouvoir quitter la page sans interrompre la tâche.

## 9.2 Sauvegarde

Les modifications manuelles doivent être sauvegardées automatiquement.

Aucune génération ne doit écraser un texte non sauvegardé.

## 9.3 Disponibilité

Le MVP n’exige pas une disponibilité critique, mais les erreurs doivent être journalisées et les tâches échouées doivent pouvoir être rejouées.

## 9.4 Accessibilité

L’interface doit viser un niveau d’accessibilité raisonnable :

- navigation au clavier ;
- contrastes suffisants ;
- libellés compréhensibles ;
- champs associés à leurs intitulés ;
- messages d’erreur lisibles ;
- absence de dépendance exclusive à la couleur.

## 9.5 Responsive design

L’application doit être principalement conçue pour ordinateur.

Elle doit rester utilisable sur tablette et permettre la consultation sur téléphone, même si l’édition avancée peut être limitée.

## 9.6 Observabilité

Le système doit journaliser :

- les erreurs ;
- les durées de génération ;
- le nombre de tentatives ;
- le modèle utilisé ;
- le volume de données ;
- le coût estimé ;
- les interruptions ;
- les exports.

Les contenus littéraires ne doivent pas être inscrits intégralement dans les journaux techniques.

---

## 10. Sécurité et confidentialité

## 10.1 Propriété des contenus

Les textes fournis par l’utilisateur restent sa propriété.

Les conditions d’utilisation doivent expliquer clairement :

- comment les textes sont traités ;
- s’ils sont transmis à un fournisseur externe ;
- combien de temps ils sont conservés ;
- s’ils sont utilisés ou non pour entraîner des modèles ;
- comment les supprimer.

## 10.2 Confidentialité

Les projets sont privés par défaut.

Aucun contenu ne peut être rendu public sans action explicite de l’utilisateur.

## 10.3 Suppression

L’utilisateur doit pouvoir supprimer :

- un projet ;
- une version ;
- un export ;
- une publication ;
- son compte.

La suppression du compte doit entraîner la suppression ou l’anonymisation des données associées selon la politique définie.

## 10.4 Protection des accès

Le système doit prévoir :

- contrôle d’accès par propriétaire ;
- validation des entrées ;
- limitation du nombre de requêtes ;
- protection contre les injections ;
- protection contre les téléchargements non autorisés ;
- liens temporaires pour les fichiers privés ;
- chiffrement des communications ;
- gestion sécurisée des secrets.

## 10.5 Données personnelles

Le produit doit limiter les données personnelles collectées.

Les données strictement nécessaires sont :

- adresse électronique ;
- identité facultative ;
- informations de facturation si une offre payante est ajoutée ;
- journaux techniques limités.

---

## 11. Propriété intellectuelle et prévention des abus

L’application doit informer l’utilisateur qu’il ne doit pas importer un texte dont il ne possède pas les droits nécessaires.

Le système doit interdire les demandes visant explicitement à reproduire une œuvre protégée ou le style exact d’un auteur vivant.

Le produit peut permettre de décrire des caractéristiques générales telles que :

- prose minimaliste ;
- narration fragmentée ;
- ambiance mélancolique ;
- dialogues secs ;
- structure polyphonique.

Il ne doit pas présenter une imitation directe comme une fonctionnalité.

La détection de similarité ne doit pas être présentée comme une garantie juridique d’originalité.

---

## 12. Modèle économique envisagé

Le MVP peut rester personnel ou gratuit pendant la validation.

À terme, plusieurs modèles sont possibles :

### Offre gratuite

- nombre limité de projets ;
- génération limitée ;
- export Markdown ;
- modèles standards.

### Offre payante individuelle

- davantage de projets ;
- romans plus longs ;
- modèles plus performants ;
- exports DOCX, PDF et EPUB ;
- historique étendu ;
- audits avancés ;
- publication web.

### Crédits

Les générations coûteuses peuvent consommer des crédits.

L’application doit afficher une estimation avant les opérations importantes.

Le coût ne doit pas être uniquement calculé au nombre de mots produits, car les phases d’analyse et de contrôle consomment également des ressources.

---

## 13. Critères d’acceptation du MVP

Le MVP est considéré comme fonctionnel lorsque les critères suivants sont remplis.

### Création

Un utilisateur connecté peut créer un projet et enregistrer un texte de moins de 2 000 mots.

Un texte dépassant la limite est refusé avec un message explicite.

### Analyse

L’utilisateur peut lancer l’analyse et obtenir un résultat structuré.

Les faits et les interprétations sont visuellement distingués.

L’analyse peut être modifiée et validée.

### Directions

Trois directions narratives sont proposées.

Chaque direction est suffisamment différente des autres.

L’utilisateur peut en sélectionner une et la modifier.

### Bible

Une bible est générée à partir de la direction choisie.

Les personnages, les thèmes, les règles du monde et les faits canoniques peuvent être édités.

Un élément peut être verrouillé.

### Plan

Un plan complet est généré.

L’utilisateur peut déplacer, modifier, ajouter ou supprimer un chapitre.

Chaque chapitre possède une fonction dramatique et une conséquence.

### Rédaction

Les trois premiers chapitres peuvent être générés.

Chaque génération crée une version distincte.

L’utilisateur peut modifier le texte et restaurer une ancienne version.

### Cohérence

Après validation d’un chapitre, de nouveaux faits sont proposés.

Une contradiction avec un élément verrouillé déclenche une alerte.

### Export

L’utilisateur peut exporter les chapitres rédigés en Markdown et en DOCX.

L’export contient un titre, une table des matières et les chapitres sélectionnés.

### Sécurité

Un utilisateur ne peut pas consulter ou modifier le projet d’un autre utilisateur.

Un projet supprimé n’est plus accessible.

---

## 14. Éléments hors périmètre du MVP

Les fonctionnalités suivantes ne font pas partie de la première version :

- génération automatique d’un roman complet sans validation ;
- application mobile native ;
- collaboration entre plusieurs auteurs ;
- marketplace de romans ;
- commentaires publics ;
- paiement des lecteurs ;
- publication automatique sur Amazon ou une plateforme externe ;
- génération avancée de couvertures ;
- traduction complète du roman ;
- narration audio ;
- adaptation automatique en scénario ;
- entraînement d’un modèle sur le style de l’utilisateur ;
- détection juridique garantie du plagiat ;
- correction éditoriale humaine intégrée.

---

## 15. Découpage prévisionnel

### Phase 1 — Fondations

- authentification ;
- création de projet ;
- saisie du texte source ;
- tableau de bord ;
- base de données ;
- historique minimal.

### Phase 2 — Analyse narrative

- analyse structurée ;
- édition ;
- validation ;
- gestion des générations ;
- suivi des erreurs.

### Phase 3 — Directions et bible

- propositions divergentes ;
- comparaison ;
- sélection ;
- génération de la bible ;
- verrouillage des éléments.

### Phase 4 — Planification

- parties ;
- chapitres ;
- réorganisation ;
- analyse des conséquences ;
- fils narratifs.

### Phase 5 — Rédaction

- génération chapitre par chapitre ;
- éditeur ;
- sauvegarde automatique ;
- versions ;
- réécritures ciblées.

### Phase 6 — Cohérence et export

- extraction de faits ;
- détection de contradictions ;
- audit ;
- export Markdown ;
- export DOCX.

### Phase 7 — Version étendue

- roman complet ;
- EPUB ;
- PDF ;
- publication web ;
- couverture ;
- monétisation.

---

## 16. Risques principaux

### Coût des générations

Un roman complet peut nécessiter de nombreux appels aux modèles.

Le produit doit utiliser des modèles différents selon la complexité des tâches, éviter de transmettre des contextes inutiles et permettre à l’utilisateur de contrôler les générations coûteuses.

### Perte de cohérence

Une simple fenêtre de contexte ne suffit pas à garantir la cohérence d’un roman.

La bible, les faits canoniques, la chronologie et les résumés doivent constituer une mémoire indépendante du texte brut.

### Qualité littéraire variable

Un texte grammaticalement correct n’est pas nécessairement intéressant.

Le produit doit séparer la rédaction de la critique et permettre plusieurs passes de révision.

### Dépendance à un fournisseur

Les tarifs, les modèles et les limites techniques peuvent évoluer.

Une couche d’abstraction doit permettre de changer de fournisseur.

### Complexité excessive du MVP

La tentation de gérer immédiatement la totalité d’un roman doit être évitée.

La première validation doit porter sur l’analyse, la bible, le plan et trois chapitres.

### Illusion d’originalité

Le produit ne doit pas afficher un score arbitraire comme preuve de singularité.

Les critiques doivent être argumentées et reliées à des éléments précis du projet.

---

## 17. Indicateurs de réussite

Les indicateurs du MVP peuvent être :

- pourcentage de projets atteignant l’étape de la bible ;
- pourcentage atteignant l’étape du plan ;
- pourcentage générant au moins un chapitre ;
- pourcentage générant trois chapitres ;
- nombre moyen de modifications avant validation ;
- nombre de contradictions détectées ;
- taux d’export ;
- coût moyen par projet ;
- temps moyen entre la création et le premier chapitre ;
- taux de régénération complète ;
- satisfaction déclarée sur la cohérence ;
- satisfaction déclarée sur l’originalité des directions.

L’indicateur principal ne doit pas être le volume de texte généré, mais le nombre de projets aboutissant à une structure validée et à plusieurs chapitres exploitables.

---

## 18. Définition du produit réussi

Calepin sera considéré comme réussi si un utilisateur peut partir d’une fiction courte, comprendre ce qu’elle contient réellement, choisir une direction qu’il n’aurait pas nécessairement trouvée seul, construire un roman cohérent et obtenir plusieurs chapitres qu’il souhaite continuer à travailler.

Le produit ne doit pas donner l’impression qu’un texte a simplement été gonflé. Il doit donner l’impression que ses conséquences ont été découvertes.

La proposition de valeur peut être formulée ainsi :

**Transformez une fiction courte en un roman construit, sans diluer ce qui la rend singulière.**