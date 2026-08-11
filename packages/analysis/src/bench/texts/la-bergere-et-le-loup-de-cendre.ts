/**
 * Corpus story 3/5 (CAL-078) — register: conte merveilleux.
 *
 * An original short story, written for this corpus. Not a historical work,
 * not attributed to any author (§8's "synthetic ... fixture, committed
 * knowingly"): no third-party rights, wording authored by this project.
 */

import type { CorpusText } from "./types";

const REFERENCE_TEXT = `Il était une fois, à la lisière de la forêt de Brenne, une bergère nommée Ysabel qui gardait les moutons de tout le village, bien qu'elle n'eût que treize ans. Elle était pauvre, mais elle savait chanter aux bêtes des airs qui les calmaient, et son troupeau ne s'égarait jamais.

Un matin de brume, comme elle menait ses moutons près du vieux chêne fendu, elle vit surgir d'entre les fougères un loup dont le pelage n'était ni gris ni noir, mais couleur de cendre froide, et dont les yeux, au lieu de luire comme ceux des loups ordinaires, restaient ternes comme des pièces de monnaie usées. Ysabel eut peur, et voulut fuir ; mais le loup parla, d'une voix rauque et lente :

« Ne crains rien, bergère. Je garde cette forêt depuis plus longtemps que ton village ne porte son nom, et je ne mange que ce que la forêt m'accorde. »

Ysabel, qui n'avait jamais entendu un loup parler, resta d'abord muette de saisissement. Puis, voyant qu'il ne s'approchait pas, elle demanda ce qu'il voulait d'elle. Le loup de cendre répondit qu'il ne voulait rien, sinon qu'on ne le chassât point, et qu'il connaissait tous les sentiers, toutes les sources, et l'heure à laquelle les autres loups, les vrais, ceux qui avaient faim, descendaient des collines.

Les jours suivants, Ysabel revint au chêne fendu, et le loup de cendre l'y attendait chaque fois, sans jamais s'approcher de plus de dix pas. Il lui apprit à reconnaître les traces fraîches, à mener le troupeau contre le vent pour que son odeur ne le trahît pas, et à ne jamais camper près des ravins où l'écho trompe l'oreille. Elle ne le raconta à personne, car elle savait qu'on ne l'aurait pas crue, ou pire, qu'on serait venu chasser le loup avec des piques et des chiens.

Vint l'automne où une meute de loups véritables, affamés par un été sec, descendit des collines de l'Est. Ysabel les entendit hurler une nuit de pleine lune, si proches qu'elle réunit son troupeau contre la paroi rocheuse et resta debout, son bâton à la main, sachant qu'elle ne pourrait rien contre six loups affamés.

Le loup de cendre vint se placer devant elle, entre le troupeau et la meute, et se mit à hurler à son tour — non pas un hurlement de loup, mais un son plus grave, plus ancien, qui fit trembler les feuilles du sous-bois. La meute s'arrêta, hésita, puis rebroussa chemin vers les collines, comme si elle avait reconnu quelque chose qu'aucun jeune loup n'ose braver.

Quand le silence revint, le loup de cendre se tourna vers Ysabel et lui dit :

« Je t'ai protégée ce soir, bergère, comme je protège cette forêt depuis toujours. Mais rien de ce que je donne n'est donné sans retour : promets-moi qu'à ton tour, quand tu seras vieille et que la forêt aura besoin d'un gardien, tu enverras quelqu'un pour me remplacer, afin que je puisse enfin me reposer. »

Ysabel, qui ne comprenait pas encore ce que signifiait une telle promesse, la fit néanmoins, car elle lui devait la vie de son troupeau et peut-être la sienne. Le loup de cendre hocha la tête et s'enfonça dans les fougères, et elle ne le revit plus de tout l'hiver.

On raconte, dans les villages autour de la forêt de Brenne, que chaque génération compte une bergère ou un berger qui, un matin de brume, rencontre près du vieux chêne fendu un loup couleur de cendre — et que celui ou celle qui accepte de lui parler devient, à son tour, gardien de la forêt, jusqu'au jour où il trouvera quelqu'un digne de tenir la promesse à sa place.`;

export const LA_BERGERE_ET_LE_LOUP_DE_CENDRE: CorpusText = {
  id: "la-bergere-et-le-loup-de-cendre",
  title: "La Bergère et le Loup de Cendre",
  provenance:
    "Synthetic fixture written for Calepin's CAL-078 reference corpus — an original short story, not a historical work, no third-party rights.",
  referenceText: REFERENCE_TEXT,
  expectations: [
    "Résumé factuel : doit suivre la rencontre d'Ysabel avec le loup de cendre, son enseignement, la nuit où la meute menace le troupeau, l'intervention du loup, puis la promesse exigée en retour.",
    "Prémisse : une jeune bergère rencontre un loup capable de parler, qui se présente comme le gardien de la forêt.",
    "Conflit principal : la protection qu'offre le loup de cendre a un prix qu'Ysabel accepte sans en mesurer la portée, ce qui met en tension le service rendu et la dette qu'il crée.",
    "Promesse du récit : le texte annonce, dès l'apparition du loup, un pacte à venir, et la fin doit honorer cette attente en formulant explicitement la promesse.",
    "Thèmes : la dette envers ce qui protège, et la transmission d'une charge de génération en génération.",
    "Personnages : Ysabel (la bergère de treize ans), le loup de cendre (gardien parlant de la forêt), la meute de loups véritables (menace collective sans individuation).",
    "Relations : Ysabel → loup de cendre, relation d'apprentissage puis de dette, marquée par une distance physique constante (dix pas) qui ne se referme jamais.",
    "Point de vue : narration à la troisième personne, omnisciente mais restreinte aux événements observables, avec un cadre légendaire final qui déborde le seul point de vue d'Ysabel.",
    "Temps verbal : passé simple pour le récit et présent de vérité générale dans le cadre légendaire final, qui inscrit l'histoire d'Ysabel dans une répétition cyclique.",
    "Tonalité : une gravité de conte populaire, sans ironie, portée par un rythme de formules répétées et un dénouement qui ouvre sur une légende plutôt que de se refermer.",
    "Éléments singuliers : le hurlement du loup de cendre, décrit comme plus grave qu'un hurlement de loup ordinaire, et la distance de dix pas jamais franchie de tout le texte.",
    "Ambiguïtés : la nature exacte du loup de cendre — animal, esprit ou ancien gardien humain — n'est jamais précisée, et le texte maintient cette incertitude jusqu'à la fin.",
    "Questions non résolues : ce que signifie, pour le loup, le repos qu'il demande, et ce qu'il adviendrait de lui si personne n'acceptait jamais de le remplacer.",
    "Éléments à préserver : la structure cyclique portée par le cadre légendaire final, qui inscrit l'histoire d'Ysabel dans une série plutôt que de la clore.",
    "Fragilités : la meute de loups véritables n'existe que comme menace fonctionnelle, sans qu'aucun trait ne la distingue d'un danger générique.",
    "Risques de clichés : l'animal protecteur parlant et la bergère élue sont des motifs très fréquentés du conte merveilleux ; un développement devra donner au pacte une contrepartie plus concrète que la seule protection.",
    "Potentiel de développement : le cadre légendaire final ouvre explicitement sur d'autres gardiens et d'autres générations, matière directement exploitable pour une intrigue longue centrée sur la transmission de la charge.",
  ],
};
