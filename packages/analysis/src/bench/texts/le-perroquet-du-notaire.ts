/**
 * Corpus story 4/5 (CAL-078) — register: comique.
 *
 * An original short story, written for this corpus. Not a historical work,
 * not attributed to any author (§8's "synthetic ... fixture, committed
 * knowingly"): no third-party rights, wording authored by this project.
 */

import type { CorpusText } from "./types";

const REFERENCE_TEXT = `Depuis six mois que je travaillais comme clerc chez Maître Pontier, notaire de son état, je m'étais habitué à peu près à tout, sauf au perroquet.

Il s'appelait Sigismond, avait le plumage gris et la queue rouge, et vivait dans une cage dorée posée sur l'armoire du grand bureau, d'où il assistait, jour après jour, à tous les rendez-vous, tous les actes, toutes les disputes d'héritage qui se réglaient devant Maître Pontier. Le notaire, qui ne se méfiait de rien, avait pris l'habitude de décrocher son téléphone en disant toujours la même phrase, avant même de savoir qui l'appelait : « Allô, oui, c'est encore pour l'histoire des Dubreuil, je suppose ? »

Sigismond avait retenu la phrase. Il l'avait retenue si bien qu'il la répétait, de sa voix nasillarde, à toute heure du jour, dès qu'un client entrait dans l'étude, dès que la sonnette de la porte tintait, dès que le silence durait plus d'une minute.

Le premier incident survint avec Mme Aurélie Feschet, qui venait justement régler une affaire concernant les Dubreuil, ses cousins, avec lesquels elle était brouillée depuis douze ans pour une histoire de grange. À peine avait-elle franchi le seuil que Sigismond, du haut de son armoire, lança de toute sa voix : « Allô, oui, c'est encore pour l'histoire des Dubreuil, je suppose ? » Mme Feschet, blême, se tourna vers moi en demandant qui avait bien pu prévenir le perroquet, et si toute l'étude se moquait ainsi de son malheur derrière son dos.

J'eus beau lui expliquer que Sigismond ne faisait que répéter une phrase du notaire, sans le moindre rapport avec sa situation personnelle, elle ne me crut qu'à moitié, et sortit de l'entretien persuadée que Maître Pontier tenait des propos sur elle dès qu'elle avait le dos tourné.

L'affaire aurait pu s'arrêter là si Sigismond n'avait, la semaine suivante, appris une seconde phrase — celle que Maître Pontier murmurait, lui, à voix basse, en refermant la porte de son bureau après le départ d'un client particulièrement pénible : « Encore une heure de perdue avec cet imbécile. » Le perroquet, économe de ses effets, attendit le client suivant, M. Rambert, gros propriétaire terrien connu pour son caractère difficile, pour placer la phrase au moment précis où celui-ci s'asseyait.

M. Rambert quitta l'étude en claquant la porte, et Maître Pontier dut lui écrire trois lettres d'excuses, sans jamais avouer que l'auteur du mot malheureux portait des plumes.

On proposa de vendre Sigismond, de le donner, de le confier à la nièce de Maître Pontier qui habitait la campagne. Le notaire refusa net : le perroquet avait appartenu à sa défunte épouse, et il ne pouvait s'y résoudre. On décida, à la place, de le couvrir d'un drap noir dès qu'un client entrait, comme on fait aux cages des serins qu'on veut endormir.

Cela fonctionna quelque temps. Puis Sigismond, sous son drap, prit l'habitude de dire, à intervalles réguliers, d'une voix étouffée mais parfaitement audible : « Encore une heure de perdue avec cet imbécile », ce qui, pour les clients qui l'ignoraient, semblait provenir directement du mur, ou de sous le bureau, ou de nulle part — et se révéla, à l'usage, bien plus inquiétant qu'un perroquet visible qui parle.

Maître Pontier finit par renoncer au drap. Il se contenta, chaque matin, d'annoncer aux nouveaux clients, avant qu'ils ne s'installent : « Ne faites pas attention à l'oiseau, il ne pense pas ce qu'il dit » — phrase que Sigismond, naturellement, apprit à son tour, et qu'il se mit à répéter, lui aussi, avec un aplomb qui achevait de convaincre les clients du contraire.`;

export const LE_PERROQUET_DU_NOTAIRE: CorpusText = {
  id: "le-perroquet-du-notaire",
  title: "Le Perroquet du Notaire",
  provenance:
    "Synthetic fixture written for Calepin's CAL-078 reference corpus — an original short story, not a historical work, no third-party rights.",
  referenceText: REFERENCE_TEXT,
  expectations: [
    "Résumé factuel : doit suivre, dans l'ordre, l'installation du perroquet, l'incident avec Mme Feschet, l'apprentissage de la seconde phrase, l'incident avec M. Rambert, puis les tentatives ratées pour faire taire l'oiseau.",
    "Prémisse : un perroquet installé dans une étude notariale répète les phrases privées du notaire devant les clients qu'elles concernent.",
    "Conflit principal : le notaire cherche à faire taire ou dissimuler le perroquet, mais chaque solution tentée aggrave la situation plutôt qu'elle ne la résout.",
    "Promesse du récit : l'ouverture annonce un running gag fondé sur la répétition inopportune, et chaque incident doit surenchérir sur le précédent jusqu'à la chute.",
    "Thèmes : la parole privée qui échappe à son auteur, et l'écart entre l'intention professionnelle et ce que révèle, malgré elle, l'étude.",
    "Personnages : le narrateur clerc (non nommé, témoin des incidents), Maître Pontier (le notaire, attaché à l'oiseau par fidélité à sa défunte épouse), Sigismond (le perroquet), Mme Feschet et M. Rambert (clients victimes de ses répliques).",
    "Relations : narrateur → Maître Pontier (clerc et employeur), Maître Pontier → Sigismond (attachement sentimental qui l'empêche de trancher), Sigismond → les clients (relation comique à sens unique, sans intention réelle de l'oiseau).",
    "Point de vue : première personne, le clerc narrateur, témoin de tous les incidents mais jamais acteur direct de leur résolution.",
    "Temps verbal : passé composé et imparfait, registre oral du récit rapporté, sans bascule de temps notable.",
    "Tonalité : un comique d'escalade, porté par le décalage entre la gravité du cadre notarial et la trivialité de sa cause, sans jamais glisser vers la farce absurde pure.",
    "Éléments singuliers : la phrase répétée sous le drap noir, plus inquiétante d'être invisible que visible, qui retourne la tentative de dissimulation contre elle-même.",
    "Ambiguïtés : le texte laisse ouvert si Sigismond comprend le sens de ce qu'il répète ou s'il ne fait qu'imiter sans intention — la dernière phrase apprise entretient délibérément le doute.",
    "Questions non résolues : ce que Maître Pontier fera si le perroquet apprend une troisième phrase encore plus compromettante que les deux premières.",
    "Éléments à préserver : la structure d'escalade en trois incidents (Mme Feschet, M. Rambert, le drap noir), qui porte tout le comique et ne doit pas être résumée en un seul épisode.",
    "Fragilités : Mme Feschet et M. Rambert disparaissent du récit sitôt leur incident passé, sans qu'aucune conséquence durable de leur mécontentement ne soit montrée.",
    "Risques de clichés : l'animal qui répète des phrases compromettantes est un ressort comique très courant ; un développement devra donner à Sigismond un trait plus singulier que la seule fonction de mécanisme à répétition.",
    "Potentiel de développement : l'attachement de Maître Pontier à l'oiseau de sa défunte épouse esquisse une matière sentimentale sous le comique, mais le texte n'en dit pas assez sur cette épouse pour qu'un roman puisse la développer sans invention.",
  ],
};
