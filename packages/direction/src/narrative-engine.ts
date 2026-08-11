/**
 * The narrative engine of a direction (CAL-080) — the operational definition
 * of what makes two directions *different novels* rather than two decors on
 * one novel.
 *
 * The specification accepts three directions only when they diverge on their
 * narrative engine, not on their setting. "Engine" is given an operational
 * meaning here: **what a direction declares on five closed axes** — the
 * nature of the conflict, the source of the tension, what the protagonist
 * stands to lose, what triggers the story's turn, and the nature of the
 * resolution. Two directions share an engine exactly when their declarations
 * coincide; `./divergence` draws the line.
 *
 * **The vocabulary cannot name a decor — that is the mechanism.** Every
 * member names a dramatic mechanism (a dilemma, a betrayal, a renunciation),
 * never a place, an era, a milieu or a cast. A direction moved from a village
 * to a space station therefore declares the same five members, and the
 * difference has nowhere to register; a difference that does register is a
 * difference of mechanism by construction. That is what turns "ne différer
 * que par le décor" from a literary judgement into a comparison of two
 * five-tuples.
 *
 * The declaration follows `dimensionTreatments`' discipline (CAL-079): asked
 * for by the prompt, carried by the schema, describing the direction *as it
 * is* — the model classifies what its own prose fields already say, and the
 * check compares declarations. Like the treatments, it is ahead of any
 * `CreativeDirection` column: persistence belongs to the persistence task.
 *
 * The French copy lives here, beside the vocabulary, for the reason
 * `FreedomConstraint`'s clauses live in the business layer: the axis is the
 * domain's rule, the instruction built around it is `@calepin/ai`'s, and the
 * author must be able to read the same words the prompt quotes (CAL-082's
 * screen, CAL-083's exclusion clauses).
 */

import { z } from "zod";

/**
 * What opposes, by nature, what the protagonist wants. Five natures, drawn
 * from the classical conflict taxonomy because it is already setting-free.
 */
export const CONFLICT_NATURES = [
  "interpersonal", // another will
  "internal", // the protagonist's own division
  "societal", // a collective order
  "environmental", // a hostile, unintending world
  "metaphysical", // the non-negotiable: time, death, fate
] as const;

export type ConflictNature = (typeof CONFLICT_NATURES)[number];

/** What keeps the reader in suspense from one chapter to the next. */
export const TENSION_SOURCES = [
  "pursuit", // something closing in
  "concealment", // a truth demanding to surface
  "deadline", // time running out
  "dilemma", // two legitimate, incompatible demands
  "escalation", // every attempt makes it worse
  "temptation", // a desire whose satisfaction would destroy
] as const;

export type TensionSource = (typeof TENSION_SOURCES)[number];

/** What the protagonist stands to lose, in kind. */
export const PROTAGONIST_STAKES = [
  "life", // their life or body
  "loved-ones", // someone dear, or the bond itself
  "belonging", // their place: home, status, membership
  "identity", // what they believe themselves to be
  "moral-integrity", // becoming what they refuse
  "freedom", // their power to act or choose
] as const;

export type ProtagonistStake = (typeof PROTAGONIST_STAKES)[number];

/** The kind of event that tips the story into its final movement. */
export const SHIFT_TRIGGERS = [
  "revelation", // a truth surfaces and reorders what preceded
  "betrayal", // a trust turns
  "transgression", // the protagonist crosses a line of no return
  "irreversible-loss", // what was defended is taken for good
  "irruption", // an outside event forces the hand
] as const;

export type ShiftTrigger = (typeof SHIFT_TRIGGERS)[number];

/** How the engine comes to rest — the kind of ending, never its scene. */
export const RESOLUTION_NATURES = [
  "victory", // the want is obtained
  "defeat", // the want is lost
  "sacrifice", // obtained, at an equal cost
  "renunciation", // the wanting stops; the conflict dissolves
  "transformation", // the terms change; the question was wrong
  "suspension", // deliberately left open
] as const;

export type ResolutionNature = (typeof RESOLUTION_NATURES)[number];

/**
 * The five axes, in the order the product states them and every comparison
 * reports them. The order is part of the definition: reports, prompt lines
 * and the comparison screen all walk it, so it is pinned by test.
 */
export const NARRATIVE_ENGINE_AXES = [
  "conflictNature",
  "tensionSource",
  "protagonistStake",
  "shiftTrigger",
  "resolutionNature",
] as const;

export type NarrativeEngineAxis = (typeof NARRATIVE_ENGINE_AXES)[number];

/**
 * The declaration itself: one member per axis, nothing else. Strict and
 * enum-only, so a score — or a decor — has no field to live in.
 */
export const narrativeEngineSchema = z.strictObject({
  conflictNature: z.enum(CONFLICT_NATURES),
  tensionSource: z.enum(TENSION_SOURCES),
  protagonistStake: z.enum(PROTAGONIST_STAKES),
  shiftTrigger: z.enum(SHIFT_TRIGGERS),
  resolutionNature: z.enum(RESOLUTION_NATURES),
});

export type NarrativeEngine = z.infer<typeof narrativeEngineSchema>;

interface NarrativeEngineAxisCopy<Member extends string> {
  /** The axis, as the specification words it. */
  readonly label: string;
  /** One declarative clause per member — stated of the novel, addressed to nobody. */
  readonly members: Readonly<Record<Member, string>>;
}

/**
 * The French copy of the whole vocabulary. Totality is the type's own:
 * a member added to an axis without a clause here stops compiling.
 */
export const NARRATIVE_ENGINE_COPY: {
  readonly conflictNature: NarrativeEngineAxisCopy<ConflictNature>;
  readonly tensionSource: NarrativeEngineAxisCopy<TensionSource>;
  readonly protagonistStake: NarrativeEngineAxisCopy<ProtagonistStake>;
  readonly shiftTrigger: NarrativeEngineAxisCopy<ShiftTrigger>;
  readonly resolutionNature: NarrativeEngineAxisCopy<ResolutionNature>;
} = {
  conflictNature: {
    label: "la nature du conflit",
    members: {
      interpersonal:
        "une volonté adverse — un autre personnage s'oppose à ce que veut le protagoniste",
      internal: "une division intérieure — le protagoniste est son propre obstacle",
      societal:
        "un ordre collectif — des normes, une institution ou un groupe pèsent sur l'individu",
      environmental: "un monde hostile — un milieu qui menace sans intention",
      metaphysical: "l'inéluctable — le temps, la mort, le destin, ce qui ne se négocie pas",
    },
  },
  tensionSource: {
    label: "la source de la tension",
    members: {
      pursuit: "une traque — quelque chose ou quelqu'un se rapproche",
      concealment: "un secret — une vérité cachée demande à éclater ou à être découverte",
      deadline: "un compte à rebours — le temps manque pour agir",
      dilemma: "un dilemme — deux exigences légitimes ne peuvent être satisfaites ensemble",
      escalation: "une spirale — chaque tentative de réparer aggrave",
      temptation: "une tentation — un désir dont la satisfaction détruirait ce qui compte",
    },
  },
  protagonistStake: {
    label: "ce que le protagoniste risque",
    members: {
      life: "sa vie ou son intégrité physique",
      "loved-ones": "un être cher, ou le lien qui l'y attache",
      belonging: "sa place — appartenance, foyer, statut",
      identity: "ce qu'il croit être — nom, mémoire, raison",
      "moral-integrity": "son intégrité morale — devenir ce qu'il refuse",
      freedom: "sa liberté d'agir ou de choisir",
    },
  },
  shiftTrigger: {
    label: "ce qui provoque le basculement",
    members: {
      revelation: "une vérité surgit et change le sens de ce qui précède",
      betrayal: "une confiance se retourne",
      transgression: "le protagoniste franchit une limite dont on ne revient pas",
      "irreversible-loss": "une perte définitive retire ce qui était défendu",
      irruption: "un fait extérieur s'impose et force la main",
    },
  },
  resolutionNature: {
    label: "la nature de la résolution",
    members: {
      victory: "ce qui était voulu est obtenu",
      defeat: "ce qui était voulu est perdu",
      sacrifice: "obtenu, au prix d'un renoncement d'un poids égal",
      renunciation: "le vouloir cesse — le conflit se dissout plutôt qu'il ne se règle",
      transformation: "les termes changent — la question du départ n'est plus la bonne",
      suspension: "délibérément laissé ouvert",
    },
  },
};

function axisLine<Member extends string>(
  axis: NarrativeEngineAxis,
  members: readonly Member[],
  copy: NarrativeEngineAxisCopy<Member>,
): string {
  const glossed = members.map((member) => `« ${member} » (${copy.members[member]})`).join(", ");

  return `« ${axis} » — ${copy.label} : ${glossed}.`;
}

/**
 * One line per axis — its key, its label, its members glossed, in the axes'
 * own order — for the prompt's `engineAxes` variable, so the vocabulary is
 * never restated in prose (the `dimensionKeys` arrangement, CAL-079).
 */
export function describeNarrativeEngineAxes(): readonly string[] {
  return [
    axisLine("conflictNature", CONFLICT_NATURES, NARRATIVE_ENGINE_COPY.conflictNature),
    axisLine("tensionSource", TENSION_SOURCES, NARRATIVE_ENGINE_COPY.tensionSource),
    axisLine("protagonistStake", PROTAGONIST_STAKES, NARRATIVE_ENGINE_COPY.protagonistStake),
    axisLine("shiftTrigger", SHIFT_TRIGGERS, NARRATIVE_ENGINE_COPY.shiftTrigger),
    axisLine("resolutionNature", RESOLUTION_NATURES, NARRATIVE_ENGINE_COPY.resolutionNature),
  ];
}

/**
 * One engine as a declarative French clause — what fills the prompt's
 * `excludedEngines` variable on a relaunch (this task's report) or a
 * replacement (CAL-083), and what the comparison screen quotes (CAL-082).
 * Closed vocabulary end to end: nothing here is the author's or the model's
 * prose, so the clause is not literary content (§9).
 */
export function describeNarrativeEngine(engine: NarrativeEngine): string {
  const copy = NARRATIVE_ENGINE_COPY;

  return [
    `${copy.conflictNature.label} : ${copy.conflictNature.members[engine.conflictNature]}`,
    `${copy.tensionSource.label} : ${copy.tensionSource.members[engine.tensionSource]}`,
    `${copy.protagonistStake.label} : ${copy.protagonistStake.members[engine.protagonistStake]}`,
    `${copy.shiftTrigger.label} : ${copy.shiftTrigger.members[engine.shiftTrigger]}`,
    `${copy.resolutionNature.label} : ${copy.resolutionNature.members[engine.resolutionNature]}`,
  ].join(" ; ");
}
