/**
 * What a finding says, in the project's language (CAL-099).
 *
 * Domain-owned copy, for `NARRATIVE_ENGINE_COPY`'s and `describeWorldBounds`'s
 * reason rather than by exception: this is not an error message the interface
 * phrases, it is the `QualityIssue.explanation` column, and the column is
 * written by whatever writes the row. `apps/web` owns the *labels* — the name
 * of a check, the word on a button — and nothing else here.
 *
 * **Every sentence below names elements of the novel, so every sentence below
 * is literary content** (§9). It goes to the column and to the screen. It never
 * goes to a log line, and there is no field on a report that could carry it.
 *
 * The specification forbids a bare verdict: each explanation says what is wrong
 * *and* which elements are involved, and each proposed correction names an act
 * the author can perform. Where there is no mechanical fix — an absence to
 * confirm rather than an edit to make — `proposedFix` is null, which is the
 * shape `QualityIssue.proposedFix` already documents.
 */

const OPEN_QUOTE = "« ";
const CLOSE_QUOTE = " »";

/** One element, quoted the way the rest of the bible's copy quotes one. */
export function quoted(value: string): string {
  return `${OPEN_QUOTE}${value}${CLOSE_QUOTE}`;
}

/** A day of the chronology, phrased so a negative one reads as *before the opening*. */
export function describeDay(day: number): string {
  if (day === 0) return "le jour d'ouverture du roman";
  if (day > 0) return `le jour ${String(day)}`;

  return `le jour ${String(-day)} avant l'ouverture`;
}

function joinNames(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? "";

  return `${names.slice(0, -1).join(", ")} et ${names[names.length - 1] ?? ""}`;
}

export function describeAgeConflict(characterName: string, eventNames: readonly string[]): string {
  const where =
    eventNames.length === 0
      ? "la fiche du personnage"
      : `les événements ${joinNames(eventNames.map(quoted))}`;

  return `Les âges donnés à ${characterName} ne peuvent pas être vrais ensemble : ceux de ${where} contredisent ceux que le reste de la chronologie soutient.`;
}

export function describeAgeConflictFix(characterName: string): string {
  return `Corriger l'âge annoncé pour ${characterName} là où il diverge, ou l'âge porté par sa fiche.`;
}

export function describeDateContradiction(
  eventName: string,
  anchorName: string,
  statedDay: number,
  impliedDay: number,
  toleranceDays: number,
): string {
  return `${quoted(eventName)} est daté ${describeDay(statedDay)}, mais l'écart déclaré depuis ${quoted(anchorName)} le place ${describeDay(impliedDay)} (tolérance de ${String(toleranceDays)} jours).`;
}

export function describeDateContradictionFix(eventName: string, anchorName: string): string {
  return `Corriger la date de ${quoted(eventName)}, l'écart depuis ${quoted(anchorName)}, ou la précision annoncée pour l'un des deux.`;
}

export function describeBackwardsChain(
  eventName: string,
  anchorName: string,
  day: number,
  anchorDay: number,
): string {
  return `${quoted(eventName)} suit ${quoted(anchorName)} dans la chronologie mais lui est antérieur : ${describeDay(day)} contre ${describeDay(anchorDay)}.`;
}

export function describeBackwardsChainFix(eventName: string, anchorName: string): string {
  return `Inverser l'enchaînement, ou corriger la date de ${quoted(eventName)} ou celle de ${quoted(anchorName)}.`;
}

export function describeChainCycle(eventName: string): string {
  return `${quoted(eventName)} appartient à une boucle : en remontant les événements qui le précèdent, on revient sur lui.`;
}

export function describeChainCycleFix(eventName: string): string {
  return `Rattacher ${quoted(eventName)} à un événement qui ne descend pas de lui, ou le dater directement.`;
}

export function describeUndatedEvent(eventName: string): string {
  return `${quoted(eventName)} n'est rattaché à aucune date : ni jour de la chronologie, ni écart depuis un événement daté. Les durées et les âges autour de lui ne peuvent pas être vérifiés.`;
}

export function describeUndatedEventFix(eventName: string): string {
  return `Dater ${quoted(eventName)}, ou le placer à un écart donné d'un événement qui l'est.`;
}

export function describeCategoryContradiction(
  eventName: string,
  category: string,
  day: number,
): string {
  if (category === "BACKSTORY") {
    return `${quoted(eventName)} est rangé dans le passé du roman, mais il tombe ${describeDay(day)}, c'est-à-dire après son ouverture.`;
  }

  return `${quoted(eventName)} est rangé dans le récit ou dans ce qui doit advenir, mais il tombe ${describeDay(day)}, c'est-à-dire avant l'ouverture du roman.`;
}

export function describeCategoryContradictionFix(eventName: string): string {
  return `Changer la nature de ${quoted(eventName)}, ou sa date.`;
}

export function describeBrokenAnchor(eventName: string): string {
  return `${quoted(eventName)} renvoie à un événement précédent qui n'existe pas, ou à lui-même.`;
}

export function describeBrokenAnchorFix(eventName: string): string {
  return `Rattacher ${quoted(eventName)} à un autre événement, ou le dater directement.`;
}

export function describeParticipation(eventName: string): string {
  return `${quoted(eventName)} fait intervenir un personnage inconnu, ou le fait intervenir deux fois.`;
}

export function describeOneSidedRelationship(holder: string, subject: string): string {
  return `${holder} déclare un lien avec ${subject}, mais ${subject} n'en déclare aucun en retour. Le lien n'existe donc que d'un côté.`;
}

export function describeOneSidedRelationshipFix(holder: string, subject: string): string {
  return `Ajouter le lien que ${subject} entretient avec ${holder}, ou confirmer que ce silence est voulu.`;
}

/** The sections a name was found in, already in French, for the explanation below. */
export const BIBLE_PROSE_SOURCE_NAMES = {
  identity: "l'identité du roman",
  style: "la section style",
  world: "la section monde",
  place: "un lieu",
  "world-rule": "une règle du monde",
  character: "une fiche personnage",
  relationship: "un lien entre personnages",
  "timeline-event": "la chronologie",
  "canon-fact": "un fait canonique",
} as const;

export function describeUndeclaredName(name: string, sections: readonly string[]): string {
  const where = sections.length === 0 ? "la bible" : joinNames(sections);

  return `${quoted(name)} est nommé dans ${where} sans avoir de fiche personnage ni de lieu dans la bible.`;
}

/**
 * The one correction that names no element: the explanation above has already
 * quoted the name, and the third branch — *ce n'est ni un personnage ni un
 * lieu* — is what makes this heuristic check bearable. Dismissing it once
 * settles it for good, because the arbitration is written against the finding's
 * fingerprint.
 */
export function describeUndeclaredNameFix(): string {
  return "Créer la fiche ou le lieu qui porte ce nom, corriger son orthographe, ou écarter ce signalement s'il ne désigne ni un personnage ni un lieu du roman.";
}

export function describeOpposedFacts(trueStatement: string, falseStatement: string): string {
  return `Deux faits canoniques énoncent la même chose et lui donnent une valeur opposée : ${quoted(trueStatement)} est tenu pour vrai, ${quoted(falseStatement)} pour faux.`;
}

export function describeOpposedFactsFix(): string {
  return `Écarter l'un des deux faits, ou restreindre leur période de validité pour qu'ils ne se recouvrent plus.`;
}

export function describeContradictoryBelief(characterName: string, statement: string): string {
  return `Deux faits canoniques identiques — ${quoted(statement)} — donnent à ${characterName} deux connaissances différentes de ce même fait.`;
}

export function describeContradictoryBeliefFix(characterName: string): string {
  return `Fusionner les deux faits et ne garder qu'un seul état de connaissance pour ${characterName}.`;
}
