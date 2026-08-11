/**
 * Corpus story 2/5 (CAL-078) — register: fantastique.
 *
 * An original short story, written for this corpus. Not a historical work,
 * not attributed to any author (§8's "synthetic ... fixture, committed
 * knowingly"): no third-party rights, wording authored by this project.
 */

import type { CorpusText } from "./types";

const REFERENCE_TEXT = `Je n'ai jamais aimé les objets qui viennent des morts. Celui-là, pourtant, je n'avais pas eu le choix de le refuser : ma grand-tante Herminie me l'avait légué avec le reste, une horloge de parquet, en bois de noyer, dont le tic-tac, disait-elle de son vivant, « n'avait jamais menti sur rien ». Je la fis porter dans mon salon de la rue Vaugirard, faute d'un autre endroit où la mettre, entre le miroir et la fenêtre.

Les premiers soirs, je ne remarquai rien qu'un peu de retard, comme il arrive aux vieux mécanismes. Puis, un jeudi de novembre, en rentrant tard d'un concert, je vis que les aiguilles marquaient minuit moins vingt, alors que ma montre, à mon poignet, en marquait minuit passé de cinq minutes. Je réglai l'horloge sans y attacher d'importance particulière.

Le lendemain, à la même heure, exactement, le décalage avait repris : vingt minutes de retard, ni plus, ni moins. J'ouvris le boîtier, je vérifiai le balancier, je ne trouvai rien qui expliquât cette régularité dans l'erreur — car une erreur qui se répète à l'identique, chaque nuit, à la même minute, n'est plus tout à fait une erreur.

C'est le troisième soir que je vis, pour la première fois, dans le miroir qui fait face à l'horloge, quelque chose que je ne sus nommer sur le moment. Le miroir me renvoyait mon salon tel qu'il était, mais avec, dans le coin, près de la fenêtre, un fauteuil que je ne possède pas — un fauteuil à oreillettes, recouvert d'un tissu à fleurs fanées, et dans ce fauteuil, une femme assise de profil, la tête penchée sur un ouvrage de couture. Je me retournai vivement : il n'y avait, derrière moi, que le mur nu et la fenêtre fermée. Je regardai de nouveau le miroir : le fauteuil et la femme y étaient toujours, à leur place, comme s'ils avaient toujours été là et que ce fût mon salon, à moi, qui fût l'intrus reflété dans le leur.

Elle ne bougeait pas. Je restai ainsi de longues minutes, debout, sans oser approcher, jusqu'à ce que l'horloge sonnât minuit — la vraie minuit, celle de ma montre — et qu'elle disparût du miroir en même temps que le douzième coup, comme si le son l'eût effacée.

Je crus d'abord à la fatigue, au vin du concert, à l'heure tardive. Mais le phénomène se répéta le quatrième soir, puis le cinquième, toujours entre minuit moins vingt, à l'heure de l'horloge, et minuit, à l'heure de ma montre — ce vingt minutes d'écart qui n'était donc pas une erreur du mécanisme, mais une mesure, un intervalle ouvert sur autre chose.

Le sixième soir, je m'assis face au miroir, décidé à ne pas détourner les yeux. La femme apparut comme les fois précédentes, penchée sur son ouvrage. Puis, pour la première fois, elle leva la tête, et je vis — je vois encore, chaque fois que j'y pense — qu'elle avait le visage de ma grand-tante Herminie, non pas tel que je l'avais connu, ridé et blanchi, mais tel qu'il devait être cinquante ans plus tôt, quand elle avait, elle aussi, vécu dans un salon de la rue Vaugirard, avant que la rue ne fût refaite et les numéros changés.

Elle me regarda — ou regarda, à travers moi, quelque chose que je ne pouvais pas voir — puis l'horloge sonna, et elle disparut.

Je n'ai pas fait réparer le mécanisme. Je n'ai pas non plus déplacé le miroir, ni l'horloge, bien qu'un ami m'ait conseillé de vendre l'une et l'autre à un brocanteur de la rue de Seine. Chaque soir, à minuit moins vingt, je m'assois dans le fauteuil qui fait face au miroir — le mien, pas le sien — et j'attends de savoir si c'est elle qui me rendra visite, ou moi qui, une nuit, resterai de l'autre côté.`;

export const L_HORLOGE_DE_LA_RUE_VAUGIRARD: CorpusText = {
  id: "l-horloge-de-la-rue-vaugirard",
  title: "L'Horloge de la rue Vaugirard",
  provenance:
    "Synthetic fixture written for Calepin's CAL-078 reference corpus — an original short story, not a historical work, no third-party rights.",
  referenceText: REFERENCE_TEXT,
  expectations: [
    "Résumé factuel : doit suivre, dans l'ordre, l'héritage de l'horloge, le décalage récurrent de vingt minutes, puis les apparitions progressives dans le miroir jusqu'au visage reconnu de la grand-tante.",
    "Prémisse : un narrateur hérite d'une horloge dont le mécanisme paraît, chaque nuit, se dérégler de la même façon exacte.",
    "Conflit principal : le narrateur cherche une explication rationnelle à un phénomène qui, de nuit en nuit, résiste à toute explication et l'entraîne vers une identification progressive avec le reflet.",
    "Promesse du récit : l'ouverture annonce un dérèglement d'abord mécanique, et engage à ce que la suite en révèle la nature — le texte doit tenir cette progression sans la résoudre entièrement.",
    "Thèmes : la persistance du passé dans les objets hérités, et la porosité entre le temps mesuré et le temps vécu.",
    "Personnages : le narrateur (non nommé, focalisé sur sa propre perception), la grand-tante Herminie (absente puis reconnue dans le reflet), la femme du miroir avant son identification.",
    "Relations : narrateur → grand-tante Herminie, relation d'héritage qui se change en relation de vision, sans qu'aucun dialogue ne les relie jamais directement.",
    "Point de vue : première personne, strictement limitée à ce que le narrateur perçoit et interprète, sans accès extérieur validant ou invalidant ses visions.",
    "Temps verbal : passé composé et imparfait pour le récit rétrospectif, avec un basculement notable au présent (« je vois encore ») au moment où le souvenir de la dernière vision rejoint l'instant de la narration.",
    "Tonalité : une retenue clinique dans la description du phénomène, qui laisse le trouble venir de l'accumulation des détails plutôt que d'un vocabulaire d'effroi.",
    "Éléments singuliers : l'écart fixe de vingt minutes entre l'heure de l'horloge et celle de la montre, présenté comme une mesure plutôt qu'une simple panne.",
    "Ambiguïtés : le texte ne tranche pas entre hallucination, hantise et boucle temporelle, et maintient les trois lectures jusqu'à la dernière ligne.",
    "Questions non résolues : ce qu'il adviendra le soir où le narrateur ne sera plus celui qui regarde, mais peut-être celui que l'on regarde depuis l'autre côté du miroir.",
    "Éléments à préserver : la mécanique du décalage de vingt minutes et son rôle de seuil, qui structurent toute la progression et ne doivent pas être aplatis en un simple effet d'horreur.",
    "Fragilités : la vie du narrateur en dehors de l'horloge — son activité de concertiste mentionnée une fois, ses relations — n'est presque pas développée, ce qui prive le phénomène d'un contrepoint quotidien.",
    "Risques de clichés : l'objet hérité hanté et le miroir ouvrant sur le passé sont des motifs fantastiques très fréquentés ; un développement devra trouver au décalage horaire un usage qui dépasse le simple frisson.",
    "Potentiel de développement : la relation non résolue entre le narrateur et la grand-tante offre une matière biographique à explorer, mais le texte ne donne aucune information sur la vie d'Herminie qui permettrait, en l'état, de la développer sans invention.",
  ],
};
