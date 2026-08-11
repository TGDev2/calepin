/**
 * Corpus story 1/5 (CAL-078) — register: réalisme, ironie sociale.
 *
 * An original short story, written for this corpus. It is not a historical
 * work and is not attributed to any author, living or dead: §8 allows a
 * fixture to be "synthetic or public-domain", and this one is synthetic —
 * it carries no third-party rights, and its wording is authored by this
 * project rather than fetched from an external source.
 */

import type { CorpusText } from "./types";

const REFERENCE_TEXT = `Édouard Vasseur travaillait depuis onze ans au troisième bureau de la Compagnie des Assurances Fluviales, dans une pièce qui sentait la poussière et l'encre séchée. Il tenait les registres avec une application que personne ne remarquait, sinon lui-même, chaque soir, en comparant ses colonnes de chiffres à celles de la veille.

On annonça, au mois de mars, qu'un poste de sous-chef allait s'ouvrir. M. Grellier, qui l'occupait depuis vingt ans, partait à la retraite, et le directeur, M. Passerat, recevrait en entretien les trois employés les plus anciens du bureau avant de choisir.

Vasseur n'avait qu'un habit correct, un habit de laine grise qu'il portait aux enterrements et aux mariages, et qu'il jugeait, en l'examinant à la lumière de la fenêtre, un peu jauni aux poignets. Il économisa pendant six semaines sur son déjeuner pour s'en offrir un neuf, noir, avec un col qui lui parut, chez le tailleur, du dernier chic. Il l'essaya trois fois avant le jour fixé, se regardant dans la glace de l'armoire avec une gravité qu'il ne se connaissait pas.

Le matin de l'entretien, il partit une heure en avance, pour ne pas arriver essoufflé. Le ciel était bas, un peu de pluie tombait par intervalles ; il prit soin d'éviter les flaques, de marcher au bord du trottoir, du côté des maisons. Rue de Rennes, un enfant qui courait après un cerceau le heurta à l'épaule ; Vasseur, pour ne pas tomber, posa la main contre le mur d'un chantier, où l'on venait de passer une couche de peinture fraîche à la grille. Il ne s'en aperçut qu'en entrant dans l'antichambre du directeur, sous le gaz, en voyant sur sa manche une large tache grise qui avait déjà séché en durcissant le tissu.

Dans l'escalier, il croisa Berthier, l'huissier, qui portait une pile de dossiers et qui lui dit, en désignant sa manche d'un mouvement de menton : « Vous devriez remonter vous changer, Vasseur, il est encore temps. » Mais il n'était plus temps : le tramway pour repasser chez lui et revenir aurait pris quarante minutes, et l'entretien commençait dans un quart d'heure. Vasseur remercia Berthier d'un signe et monta.

Il resta assis vingt minutes dans l'antichambre, la main droite ramenée sur la manche gauche, essayant de la couvrir, à composer des phrases qu'il ne dirait pas. Les deux autres candidats, Rambourg et Thévenin, causaient à voix basse près de la fenêtre ; Thévenin portait un habit plus vieux que celui de Vasseur, mais sans tache, et riait d'une plaisanterie que Vasseur n'entendit pas.

Quand son tour vint, M. Passerat le reçut debout, la main tendue, et Vasseur, en la lui donnant, sentit que le directeur avait vu la tache avant même qu'il eût fini de s'asseoir. L'entretien dura huit minutes. On lui posa des questions sur les registres, sur le nombre d'années de service, sur un dossier de sinistre qu'il avait réglé l'an dernier ; Vasseur répondit avec exactitude, mais sa voix lui parut, à lui-même, un peu trop rapide, comme s'il voulait qu'on cessât de le regarder avant qu'on eût remarqué sa manche.

Le poste échut à Thévenin, dont l'habit était vieux mais propre, et qui, disait-on dans le bureau, n'avait pas économisé pour l'occasion, n'ayant simplement pas pensé qu'il fallût en changer.

Vasseur porta l'habit noir encore deux ans, aux enterrements, en ayant soin, chaque fois, de faire un détour par la rue Bonaparte pour éviter le chantier de la rue de Rennes, bien que la grille eût été repeinte depuis longtemps et que la couleur, désormais, fût sèche.`;

export const L_ANTICHAMBRE: CorpusText = {
  id: "l-antichambre",
  title: "L'Antichambre",
  provenance:
    "Synthetic fixture written for Calepin's CAL-078 reference corpus — an original short story, not a historical work, no third-party rights.",
  referenceText: REFERENCE_TEXT,
  expectations: [
    "Résumé factuel : doit rendre, dans l'ordre, la préparation de l'entretien, l'achat de l'habit, l'incident de peinture, l'entretien lui-même et son issue — sans commenter la portée sociale des faits.",
    "Prémisse : un employé sans grade doit se présenter à un entretien de promotion qui dépend en partie de l'image qu'il donnera.",
    "Conflit principal : Vasseur veut être vu comme digne du poste, mais un accident matériel — la tache de peinture — menace de le trahir avant même qu'il ait pu parler.",
    "Promesse du récit : le texte annonce une mécanique d'ironie sociale où un détail matériel décide d'un sort professionnel ; la chute doit honorer cette mécanique sans la commenter.",
    "Thèmes : l'apparence comme condition d'accès à la reconnaissance sociale, et l'écart entre le mérite réel (Vasseur, Thévenin) et ce qui se voit en entretien.",
    "Personnages : Vasseur (le candidat soigneux et anxieux), Thévenin (le candidat qui obtient le poste sans avoir cherché à soigner son apparence), Berthier (l'huissier qui avertit sans pouvoir aider), M. Passerat (le directeur qui juge).",
    "Relations : Vasseur → Berthier (collègue bienveillant, sans pouvoir réel), Vasseur → Thévenin (rivaux involontaires), Vasseur → M. Passerat (subordonné jugé).",
    "Point de vue : narration à la troisième personne, centrée sur Vasseur, qui donne accès à ses pensées et à sa perception de la tache, sans jamais entrer dans celles des autres personnages.",
    "Temps verbal : passé simple et imparfait dominants, à l'usage narratif classique du récit français ; aucune bascule de temps notable n'est attendue.",
    "Tonalité : une ironie retenue, jamais moqueuse envers Vasseur, qui s'interdit le pathos explicite au profit de la sécheresse des faits.",
    "Éléments singuliers : le détour durable par la rue Bonaparte des années après que la grille a séché, comme trace physique d'une humiliation qui ne s'efface pas avec la peinture.",
    "Ambiguïtés : le texte ne tranche pas si Thévenin a obtenu le poste pour son mérite réel ou simplement parce qu'il n'a pas eu d'accident — l'un et l'autre restent plausibles.",
    "Questions non résolues : ce qui se serait passé si Vasseur avait suivi le conseil de Berthier et avait pris le temps de se changer.",
    "Éléments à préserver : la scène de l'antichambre et le détail de la manche cachée, qui portent toute la tension du texte sans qu'un mot ne soit dit sur l'enjeu.",
    "Fragilités : les personnages secondaires (Rambourg, M. Passerat) restent des silhouettes fonctionnelles, sans trait distinctif qui tiendrait sur la durée d'un roman.",
    "Risques de clichés : le pauvre employé méritant broyé par un détail absurde est un ressort balzacien connu ; un développement devra éviter d'en rester au seul pathos de la petite gens.",
    "Potentiel de développement : la mécanique de l'entretien peut porter un roman si elle s'articule à une trajectoire plus longue de Vasseur — mais le texte, à lui seul, n'esquisse ni passé ni avenir du personnage au-delà de cette matinée.",
  ],
};
