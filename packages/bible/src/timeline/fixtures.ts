/**
 * Test material for the chronology (CAL-093). Never exported from the package.
 *
 * The default chronology is **arithmetically true**, and every number in it was
 * worked out rather than typed: Nora is 34 when the novel opens, so she is 4
 * thirty years earlier and 35 once a year has passed inside the novel; Émile is
 * twenty-seven years older than her at every one of them. That is the point of
 * the fixture — the deliberately false chronologies in the suites are minimal
 * mutations of it, so a test that fires proves the check found *the one thing
 * that was changed* rather than something that was wrong all along.
 *
 * It exercises the shapes that are easy to get wrong, on purpose:
 *
 *   - a chain rooted in a date, two hops deep, at mixed precisions;
 *   - an event carrying a date **and** an anchor, the pair CAL-017 made
 *     storable so this task could compare them;
 *   - a character whose age at the opening the bible does not state, folded
 *     from her presences alone;
 *   - a birthday crossed inside the novel, which is where an off-by-one in the
 *     interval arithmetic would show.
 *
 * Everything is French, short and invented. §9 keeps a real novel out of this
 * repository, and a chronology needs no borrowed one: what is under test is
 * whether the numbers agree, never what happens in the events.
 */

import {
  type BibleTimelineInput,
  type DatedTimeline,
  type TimelineEvent,
  type TimelineSource,
} from "./schema";

/** The passages a chronology answers to — two kinds, the ask's floor. */
export function timelineSources(): TimelineSource[] {
  return [
    {
      kind: "direction",
      key: "direction.pitch",
      label: "La direction retenue",
      text: "Une femme revient dans la ville qu'elle a quittée après la fermeture de l'atelier familial.",
    },
    {
      kind: "world",
      key: "world.era",
      label: "L'époque",
      text: "Une ville moyenne, aujourd'hui. Rien qui ne soit possible dans le monde ordinaire.",
    },
    {
      kind: "identity",
      key: "identity.centralQuestion",
      label: "La question centrale",
      text: "Peut-on revenir sans redevenir celle qu'on était ?",
    },
  ];
}

/** The cast the chronology places, with the one number every age is anchored to. */
export function aTimelineInput(): BibleTimelineInput {
  return {
    sourceTextVersionId: "version-1",
    directionId: "direction-1",
    freedomLevel: "BALANCED",
    cast: [
      { name: "Nora", summary: "Revient dans la ville qu'elle a quittée.", ageAtOpening: 34 },
      { name: "Émile", summary: "Son père, resté sur place.", ageAtOpening: 61 },
      // No age at the opening: Lise is née pendant le roman, and a negative age
      // is not a value `Character.age` can hold. Her birth day is folded from
      // her presences instead.
      { name: "Lise", summary: "L'enfant du voisinage.", ageAtOpening: null },
    ],
    sources: timelineSources(),
  };
}

function anEvent(
  event: Partial<TimelineEvent> & Pick<TimelineEvent, "name" | "summary">,
): TimelineEvent {
  return {
    absoluteDay: null,
    datePrecision: null,
    dateLabel: null,
    precedingEventName: null,
    daysAfterPreceding: null,
    durationPrecision: null,
    participants: [],
    ...event,
  };
}

/** A chronology whose every number can be true at once. */
export function aTimeline(): DatedTimeline {
  return {
    backstoryEvents: [
      anEvent({
        name: "La fermeture de l'atelier",
        summary: "L'atelier ferme, et la famille se disperse dans l'année qui suit.",
        // Thirty years before the opening, known to the year.
        absoluteDay: -10_950,
        datePrecision: "YEAR",
        dateLabel: "trente ans plus tôt",
        participants: [
          { characterName: "Nora", declaredAge: 4 },
          { characterName: "Émile", declaredAge: 31 },
        ],
      }),
      anEvent({
        name: "Le départ d'Émile",
        summary: "Émile quitte la ville et n'en donne plus de nouvelles.",
        // Ten years after the closure, and dated only through it.
        precedingEventName: "La fermeture de l'atelier",
        daysAfterPreceding: 3_650,
        durationPrecision: "YEAR",
        participants: [
          { characterName: "Nora", declaredAge: 14 },
          { characterName: "Émile", declaredAge: 41 },
        ],
      }),
      anEvent({
        name: "L'incendie",
        summary: "Le hangar brûle une nuit d'hiver ; personne ne réclame l'assurance.",
        absoluteDay: -1_825,
        datePrecision: "MONTH",
        dateLabel: "cinq ans plus tôt",
        participants: [
          { characterName: "Nora", declaredAge: 29 },
          { characterName: "Émile", declaredAge: 56 },
        ],
      }),
    ],
    plannedEvents: [
      anEvent({
        name: "Le retour",
        summary: "Nora descend du car et trouve la maison telle qu'elle l'a laissée.",
        absoluteDay: 0,
        datePrecision: "DAY",
        dateLabel: "jour d'ouverture",
        participants: [{ characterName: "Nora", declaredAge: 34 }],
      }),
      anEvent({
        name: "La lettre",
        summary: "Une lettre non ouverte réapparaît dans un tiroir de l'atelier.",
        precedingEventName: "Le retour",
        daysAfterPreceding: 30,
        durationPrecision: "DAY",
        participants: [{ characterName: "Nora", declaredAge: 34 }],
      }),
      anEvent({
        name: "Le retour d'Émile",
        summary: "Émile revient sans prévenir et s'installe dans l'ancienne remise.",
        precedingEventName: "La lettre",
        daysAfterPreceding: 90,
        durationPrecision: "DAY",
        participants: [
          { characterName: "Nora", declaredAge: 34 },
          { characterName: "Émile", declaredAge: 61 },
          { characterName: "Lise", declaredAge: 7 },
        ],
      }),
      anEvent({
        // Placed both ways at once — the pair CAL-017 made storable so that a
        // disagreement between them would survive to be detected here. These
        // two agree: 120 + 200 = 320.
        name: "L'affrontement",
        summary: "Ce qui n'a jamais été dit se dit enfin, et mal.",
        absoluteDay: 320,
        datePrecision: "DAY",
        dateLabel: "presque un an après le retour",
        precedingEventName: "Le retour d'Émile",
        daysAfterPreceding: 200,
        durationPrecision: "DAY",
        participants: [{ characterName: "Nora", declaredAge: 34 }],
      }),
      anEvent({
        // A year and a day after the opening: Nora has had a birthday, so 35 is
        // the only age the interval allows.
        name: "La décision",
        summary: "Nora choisit ce qu'elle garde de la maison et ce qu'elle laisse.",
        precedingEventName: "L'affrontement",
        daysAfterPreceding: 45,
        durationPrecision: "DAY",
        participants: [
          { characterName: "Nora", declaredAge: 35 },
          { characterName: "Lise", declaredAge: 8 },
        ],
      }),
    ],
  };
}
