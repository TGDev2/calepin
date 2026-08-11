/**
 * Corpus story 5/5 (CAL-078) — register: tragique, dramatique.
 *
 * An original short story, written for this corpus. Not a historical work,
 * not attributed to any author (§8's "synthetic ... fixture, committed
 * knowingly"): no third-party rights, wording authored by this project.
 */

import type { CorpusText } from "./types";

const REFERENCE_TEXT = `À Pietranera, un hameau accroché aux pentes du Monte Rotondo, deux familles se partageaient depuis des générations les meilleures terres à châtaigniers : les Alberti et les Fieschi. On disait, dans le hameau, que la frontière entre leurs terres passait exactement par le vieux puits de pierre, au bas du chemin, et que nul, de mémoire d'homme, n'avait jamais contesté cette limite.

Andrea Alberti et Pancrace Fieschi, qui avaient grandi ensemble, gardé les chèvres ensemble, s'étaient juré, un soir d'été où ils avaient tous deux dix-sept ans, une amitié qui devait, disaient-ils, durer plus longtemps que les châtaigniers eux-mêmes. Ils scellèrent ce serment en enterrant chacun un couteau au pied du vieux puits, lame tournée vers l'autre terre, en signe que jamais l'un ne lèverait la main contre le bien de l'autre.

Les années passèrent. Andrea épousa une fille de Bastia et hérita, à la mort de son père, de la parcelle qui touchait le puits. Pancrace, resté seul après la mort de ses parents, s'endetta pour racheter deux mules et un pressoir, et se trouva, un hiver, dans l'obligation de vendre une bande de terre pour éponger ses dettes.

C'est alors qu'un notaire de la vallée, venu mesurer les parcelles pour l'acte de vente, découvrit que le vieux puits, contrairement à ce que croyaient les deux familles depuis toujours, se trouvait en réalité sur la terre des Fieschi, et non sur la limite exacte. Andrea, apprenant la chose, refusa d'abord d'y croire ; puis, voyant les papiers du cadastre, il comprit qu'il cultivait depuis vingt ans une bande de terre qui, en droit, ne lui appartenait pas.

Il aurait pu se taire. Nul, dans la vallée, n'aurait songé à remettre en cause vingt ans de possession tranquille. Mais Andrea, qui tenait par-dessus tout à sa réputation d'homme droit, se rendit chez Pancrace pour lui proposer un dédommagement — non pas la terre elle-même, qu'il refusait de rendre, prétextant qu'il l'avait, disait-il, « gagnée par le travail », mais une somme d'argent qu'il jugeait honnête.

Pancrace, que les dettes rendaient amer, y vit une insulte plutôt qu'une réparation : on lui offrait de l'argent pour une terre qui, disait-il, aurait dû lui revenir tout entière depuis le début, et qu'on avait cultivée, vingt ans durant, à son détriment, sans qu'il en sût rien. Il refusa la somme, exigea la terre, et, devant le refus d'Andrea, prononça des mots que ni l'un ni l'autre ne purent, par la suite, retirer.

L'hiver suivant, on retrouva le pressoir de Pancrace incendié. Personne ne vit qui avait porté le feu, mais le hameau tout entier sut, sans qu'il fût besoin de le dire à voix haute, à qui la vengeance revenait de droit. Pancrace ne porta pas plainte, n'accusa personne devant les gendarmes de la vallée : il attendit le printemps, et un matin de mai, alors qu'Andrea descendait au marché de Corte par le sentier qui passait près du vieux puits, un coup de fusil partit du bois de châtaigniers.

Andrea Alberti mourut sur le chemin, à quelques pas de l'endroit où, quarante ans plus tôt, deux garçons de dix-sept ans avaient enterré leurs couteaux en jurant une amitié éternelle. Pancrace Fieschi quitta le hameau dans la nuit et l'on ne sut jamais, ni au village ni au tribunal de Corte, ce qu'il était devenu — si les collines l'avaient caché, ou la mer.

On dit encore à Pietranera que les deux couteaux sont toujours enterrés au pied du puits, et que nul n'a jamais osé les déterrer, de peur, disent les vieux du hameau, de découvrir que la rouille, avec le temps, en a effacé jusqu'aux lames tournées l'une vers l'autre.`;

export const LE_SERMENT_DE_PIETRANERA: CorpusText = {
  id: "le-serment-de-pietranera",
  title: "Le Serment de Pietranera",
  provenance:
    "Synthetic fixture written for Calepin's CAL-078 reference corpus — an original short story, not a historical work, no third-party rights.",
  referenceText: REFERENCE_TEXT,
  expectations: [
    "Résumé factuel : doit suivre, dans l'ordre, le serment d'amitié des deux garçons, le mariage d'Andrea, l'endettement de Pancrace, la découverte cadastrale, le refus de Pancrace, l'incendie du pressoir, puis la mort d'Andrea.",
    "Prémisse : deux amis d'enfance se partagent des terres dont la frontière exacte, crue connue depuis toujours, se révèle fausse par un acte notarié.",
    "Conflit principal : Andrea veut réparer honnêtement une erreur découverte tardivement sans renoncer à la terre qu'il cultive depuis vingt ans, tandis que Pancrace, endetté, exige la restitution entière.",
    "Promesse du récit : le rappel initial du serment des deux couteaux enterrés engage le texte à revenir sur ce geste à la fin, et la clôture doit honorer cette boucle.",
    "Thèmes : la fragilité d'un lien d'enfance face à l'intérêt matériel, et le poids d'un code d'honneur qui rend la vengeance silencieuse inévitable une fois l'offense reconnue.",
    "Personnages : Andrea Alberti (l'homme droit qui refuse de rendre la terre mais veut réparer), Pancrace Fieschi (l'ami endetté qui vit le geste comme une insulte), le notaire (déclencheur extérieur du conflit).",
    "Relations : Andrea → Pancrace, amitié d'enfance scellée par serment puis brisée par l'intérêt et l'honneur ; le hameau tout entier → les deux hommes, complicité silencieuse qui ne dénonce jamais l'incendiaire supposé.",
    "Point de vue : narration à la troisième personne, omnisciente sur les faits du hameau mais sans accès direct aux pensées intimes des deux hommes au moment de la rupture.",
    "Temps verbal : passé simple dominant, propre au récit de tradition orale rapportée, avec un présent de légende dans la dernière phrase sur les couteaux toujours enterrés.",
    "Tonalité : une gravité tragique retenue, qui rapporte la violence sans la décrire directement — l'incendie et le coup de fusil sont mentionnés, jamais montrés.",
    "Éléments singuliers : les deux couteaux enterrés lame tournée l'une vers l'autre, motif qui ouvre et referme le texte et change de sens entre le serment et la légende finale.",
    "Ambiguïtés : le texte ne confirme jamais explicitement que c'est Pancrace qui a incendié le pressoir ni qui a tiré le coup de fusil, laissant la responsabilité déduite plutôt qu'affirmée.",
    "Questions non résolues : ce qu'est devenu Pancrace après sa fuite, que le texte présente comme définitivement inconnu du hameau et du tribunal.",
    "Éléments à préserver : le motif des deux couteaux enterrés et sa reprise finale, qui portent seuls toute la charge symbolique du texte sans qu'un jugement moral ne soit énoncé.",
    "Fragilités : la découverte cadastrale qui déclenche tout le drame repose sur un notaire de passage dont l'intervention reste un mécanisme extérieur peu motivé par le reste du texte.",
    "Risques de clichés : la vendetta corse et le silence complice du village sont des motifs très identifiés ; un développement devra ancrer le conflit dans autre chose que la seule couleur locale attendue du genre.",
    "Potentiel de développement : la relation d'enfance entre Andrea et Pancrace, esquissée en une phrase, offre une matière importante à développer en amont du drame, mais le texte n'en montre presque rien au-delà du serment initial.",
  ],
};
