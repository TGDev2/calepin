/**
 * Combining elements of several directions into one, or refusing to (CAL-084).
 *
 * The author selects elements from two or three proposals and asks for their
 * fusion. The answer is one of two things and never both: a merged direction —
 * a peer of the proposals it draws from, of exactly their shape — or the
 * argued declaration that the combination is irreducible, naming the selected
 * elements that exclude each other. Directions are designed to diverge by
 * narrative engine (CAL-080), so the fusion serves one **dominant** engine
 * among the sources; the blend sitting between two of them is the failure the
 * backlog names — *le compromis mou* — and it is caught mechanically below.
 *
 * **One flat object, not a union — deliberately.** A `z.discriminatedUnion`
 * emits a root `oneOf` in its JSON Schema, and the structured-outputs schema
 * subset supports `anyOf`, never `oneOf`: a root union would be a latent
 * provider refusal discovered on the first live call, on both providers at
 * once. So the contract is one strict object discriminated by `outcome`, its
 * two branches required-but-nullable — evaluation's `evidence` and CAL-077's
 * `instruction`, for their reason: an absence is said, never elided — and tied
 * together by a check whose issues carry field paths, so a mixed answer is
 * malformed and repairable (§6), never off-topic.
 *
 * **A source direction is named by slot, never by number and never by id.**
 * `first` / `second` / `third` is a closed vocabulary: a number in the answer
 * would break *no score, structurally* (the recursive walks pin it), and an id
 * would trust the model with an identifier (§6). A slot is an index into the
 * ask's own list spelled as a word, and every `(slot, element)` pair an answer
 * names is verified against that ask — which is what makes the naming worth
 * anything.
 *
 * **Two gates, and both are reports, never `Result`s** — the divergence
 * doctrine. `checkDirectionCombinationSelection` runs before any generation is
 * paid for (principle 6.5: signal before generating): two selected engines
 * that are distinct are the acceptance criterion's own case, *combiner deux
 * moteurs incompatibles*, and no model is needed to see it.
 * `checkDirectionCombinationAnswer` reads the answer back against the ask:
 * dominance arithmetic for a merged one, selection membership for an
 * irreducible one. Every field of both is safe to log (§9): slots, axis
 * identifiers, element keys, indexes and booleans — never a word of a
 * direction and never `whyIrreducible`'s text.
 *
 * **Dominance is `compareNarrativeEngines`, never a second rule.** A source
 * engine dominates when the declared one differs from it on fewer than
 * `NARRATIVE_ENGINE_DIVERGENCE_MINIMUM` axes — *is* that engine, per the
 * established equivalence. With no engine selected, acceptable means exactly
 * one dominant: zero is a foreign engine nobody asked for, and two is the soft
 * compromise — arithmetically, a candidate within one axis of two distinct
 * sources exists exactly when they differ on exactly two axes and the
 * candidate splits them. With `narrativeEngine` selected, acceptable means
 * dominated by a selected slot and distinct from every unselected one. The
 * gate presumes pairwise-distinct source engines — the product's own proposals
 * are divergence-gated — and degrades to refusal, never to acceptance, when
 * they are not.
 *
 * **An unverifiable conflict refuses the answer whole — never dropped.**
 * `verifyDirectionEvaluationEvidence` clears an unfound quotation to null
 * because evidence is decoration on an argument that stands alone. A
 * conflict's `(slot, element)` pairs are its substance — the acceptance
 * criterion is *en nommant les éléments qui s'excluent* — and dropping one
 * could breach the list's own minimum, turning verification into a contract
 * failure (the CAL-076 trap). The caller decides the re-ask.
 *
 * **The ask is a value, not a rendering** — `directionCombinationInputSchema`
 * is what `Generation.input` stores and `generationIdempotencyKey` digests
 * (CAL-058). The check below keeps it canonical: one entry per direction, one
 * occurrence per element, so two spellings of one ask cannot digest as two
 * asks. The engines travel verbatim for `replace-direction`'s reason: they are
 * the gate's input, and a direction reworded without its engine moving is the
 * same question.
 *
 * **Nothing here is branded** — CAL-083's arrangement, for its reason: the
 * eventual writer lives in `@calepin/shared/repository`, which may not import
 * a domain (§3.2) and so could never read a brand.
 */

import { InternalError } from "@calepin/shared/errors";
import { z } from "zod";

import { compareNarrativeEngines, type NarrativeEngineComparison } from "./divergence";
import { narrativeEngineSchema } from "./narrative-engine";
import { ceilingFor, DIRECTION_PROPOSAL_COUNT, directionProposalSchema } from "./proposals";

/**
 * The elements a combination may select: the proposal's material, not its
 * self-descriptions. Three of `DIRECTION_ELEMENTS`' fourteen are absent, for
 * one rule — an element is combinable iff it is material of the novel:
 * `novelPotentialAssessment` is the proposer arguing for its own proposal,
 * `mainRisks` is its risks named against itself, and `dimensionTreatments`
 * describes the direction as it is — the fusion appraises, cautions and
 * declares for itself. `narrativeEngine` is selectable and means *this
 * direction's engine dominates*. Written out rather than derived so nothing
 * is cast; the test pins the list against `DIRECTION_ELEMENTS`.
 */
export const DIRECTION_COMBINABLE_ELEMENTS = [
  "workingTitle",
  "developedPremise",
  "dominantGenre",
  "mainConflict",
  "protagonistArc",
  "newStakes",
  "charactersToIntroduce",
  "endingNature",
  "elementsKeptFromSource",
  "elementsTransformed",
  "narrativeEngine",
] as const;

export type DirectionCombinableElement = (typeof DIRECTION_COMBINABLE_ELEMENTS)[number];

/**
 * How an answer or a report names a source direction: by position in the
 * ask's own list, spelled as a word. Exactly `DIRECTION_PROPOSAL_COUNT`
 * members — a combination can never name more directions than the product
 * proposes — and the test pins that equality.
 */
export const DIRECTION_COMBINATION_SLOTS = ["first", "second", "third"] as const;

export type DirectionCombinationSlot = (typeof DIRECTION_COMBINATION_SLOTS)[number];

/**
 * The French noun phrase for each slot — in the domain for
 * `DIRECTION_ELEMENT_LABELS`' reason: the author reads the same words the
 * prompt quotes. Totality is the type's.
 */
export const DIRECTION_COMBINATION_SLOT_LABELS: Readonly<Record<DirectionCombinationSlot, string>> =
  {
    first: "la première direction",
    second: "la deuxième direction",
    third: "la troisième direction",
  };

/** The two things an answer can be — the discriminator's own vocabulary. */
export const DIRECTION_COMBINATION_OUTCOMES = ["merged", "irreducible"] as const;

export type DirectionCombinationOutcome = (typeof DIRECTION_COMBINATION_OUTCOMES)[number];

/** How many directions one combination draws from — the backlog's own bounds. */
export const DIRECTION_COMBINATION_DIRECTION_COUNTS = {
  min: 2,
  max: DIRECTION_PROPOSAL_COUNT,
} as const;

/**
 * Bounds on an irreducible answer: at least one conflict (an irreducibility
 * that names nothing is not an answer), at least two elements per conflict
 * (exclusion is mutual), and six as the ceiling everywhere — past six a
 * prioritisation becomes an inventory.
 */
export const DIRECTION_COMBINATION_CONFLICT_COUNTS = {
  conflicts: { min: 1, max: 6 },
  elements: { min: 2, max: 6 },
} as const;

/**
 * The argued case for one conflict — the evaluation `argument`'s weight: why
 * the named elements cannot hold together, in words, never a number.
 */
export const DIRECTION_COMBINATION_WORD_TARGETS = {
  whyIrreducible: 60,
} as const;

export const DIRECTION_COMBINATION_CHAR_CEILINGS = {
  whyIrreducible: ceilingFor(DIRECTION_COMBINATION_WORD_TARGETS.whyIrreducible),
} as const;

/**
 * What one combination was asked — the payload `Generation.input` carries.
 *
 * Each entry is one source direction: its row, its engine verbatim (the
 * gates' input), and the elements selected from it. The check keeps the ask
 * canonical — a duplicate direction or a duplicate element would let one ask
 * digest as two (CAL-058). The same element selected from two *different*
 * directions is not a duplicate: it is the combination request itself.
 */
export const directionCombinationInputSchema = z
  .strictObject({
    /** The source text version the mission reads — never the text itself. */
    sourceTextVersionId: z.string().trim().min(1),
    /** The source directions, in the order the slots name them. */
    directions: z
      .array(
        z.strictObject({
          directionId: z.string().trim().min(1),
          narrativeEngine: narrativeEngineSchema,
          elements: z.array(z.enum(DIRECTION_COMBINABLE_ELEMENTS)).min(1),
        }),
      )
      .min(DIRECTION_COMBINATION_DIRECTION_COUNTS.min)
      .max(DIRECTION_COMBINATION_DIRECTION_COUNTS.max),
  })
  .check((ctx) => {
    const seenDirections = new Set<string>();

    ctx.value.directions.forEach((direction, index) => {
      if (seenDirections.has(direction.directionId)) {
        ctx.issues.push({
          code: "custom",
          message: "one direction selected twice in a combination ask",
          path: ["directions", index, "directionId"],
          input: ctx.value,
        });
      }
      seenDirections.add(direction.directionId);

      const seenElements = new Set<DirectionCombinableElement>();

      direction.elements.forEach((element, elementIndex) => {
        if (seenElements.has(element)) {
          ctx.issues.push({
            code: "custom",
            message: "one element selected twice from one direction",
            path: ["directions", index, "elements", elementIndex],
            input: ctx.value,
          });
        }
        seenElements.add(element);
      });
    });
  });

export type DirectionCombinationInput = z.infer<typeof directionCombinationInputSchema>;

/** One selected element, named as the vocabulary names it: a slot and a key. */
export interface DirectionCombinationElementRef {
  readonly direction: DirectionCombinationSlot;
  readonly element: DirectionCombinableElement;
}

/** Two selected engines that are distinct — the ask's own incompatibility. */
export interface DirectionCombinationSelectionConflict extends NarrativeEngineComparison {
  readonly elements: readonly [DirectionCombinationElementRef, DirectionCombinationElementRef];
}

export interface DirectionCombinationSelectionReport {
  /** No two selected engines are distinct — the gate the ask passes or fails. */
  readonly admissible: boolean;
  /** The slots whose `narrativeEngine` is selected, in slot order. */
  readonly engineSelections: readonly DirectionCombinationSlot[];
  /** One entry per pair of selected engines that are distinct. */
  readonly conflicts: readonly DirectionCombinationSelectionConflict[];
}

/**
 * The pre-generation gate: *combiner deux moteurs incompatibles produit un
 * avertissement explicite*, before anything is paid for (principle 6.5).
 *
 * Only the engine can be judged here — it is a five-tuple, and distinctness
 * is arithmetic. Two selected engines within one axis of each other *are* one
 * engine (the established equivalence), so selecting them both is a redundant
 * ask, not an incompatible one. Whether the selected prose can hold together
 * is a narrative judgement, and it is the mission's.
 */
export function checkDirectionCombinationSelection(
  input: DirectionCombinationInput,
): DirectionCombinationSelectionReport {
  const engineSelections = input.directions
    .map((direction, index) => ({ slot: slotAt(index), selection: direction }))
    .filter(({ selection }) => selection.elements.includes("narrativeEngine"));

  const conflicts: DirectionCombinationSelectionConflict[] = [];

  engineSelections.forEach((a, i) => {
    engineSelections.forEach((b, j) => {
      if (j <= i) return;

      const comparison = compareNarrativeEngines(
        a.selection.narrativeEngine,
        b.selection.narrativeEngine,
      );

      if (comparison.distinct) {
        conflicts.push({
          elements: [
            { direction: a.slot, element: "narrativeEngine" },
            { direction: b.slot, element: "narrativeEngine" },
          ],
          ...comparison,
        });
      }
    });
  });

  return {
    admissible: conflicts.length === 0,
    engineSelections: engineSelections.map(({ slot }) => slot),
    conflicts,
  };
}

/**
 * The answer to `combine-directions`: one strict object, two outcomes.
 *
 * `direction` reuses `directionProposalSchema` — a merged direction is a peer
 * of the three it draws from, `directionReplacementSchema`'s arrangement. The
 * branch the outcome does not own is null, written and never omitted; the
 * check ties them, and its issues land on the branch fields so a mixed answer
 * keeps its repair pass (§6).
 */
export const directionCombinationSchema = z
  .strictObject({
    outcome: z.enum(DIRECTION_COMBINATION_OUTCOMES),
    direction: directionProposalSchema
      .nullable()
      .describe("The merged direction, or null when the combination is irreducible."),
    conflicts: z
      .array(
        z.strictObject({
          elements: z
            .array(
              z.strictObject({
                direction: z.enum(DIRECTION_COMBINATION_SLOTS),
                element: z.enum(DIRECTION_COMBINABLE_ELEMENTS),
              }),
            )
            .min(DIRECTION_COMBINATION_CONFLICT_COUNTS.elements.min)
            .max(DIRECTION_COMBINATION_CONFLICT_COUNTS.elements.max),
          whyIrreducible: z
            .string()
            .trim()
            .min(1)
            .max(DIRECTION_COMBINATION_CHAR_CEILINGS.whyIrreducible),
        }),
      )
      .min(DIRECTION_COMBINATION_CONFLICT_COUNTS.conflicts.min)
      .max(DIRECTION_COMBINATION_CONFLICT_COUNTS.conflicts.max)
      .nullable()
      .describe("What excludes what, or null when a merged direction is returned."),
  })
  .check((ctx) => {
    const { outcome, direction, conflicts } = ctx.value;

    if (outcome === "merged" && direction === null) {
      ctx.issues.push({
        code: "custom",
        message: "a merged outcome owes its direction",
        path: ["direction"],
        input: ctx.value,
      });
    }

    if (outcome === "merged" && conflicts !== null) {
      ctx.issues.push({
        code: "custom",
        message: "a merged outcome carries no conflicts",
        path: ["conflicts"],
        input: ctx.value,
      });
    }

    if (outcome === "irreducible" && conflicts === null) {
      ctx.issues.push({
        code: "custom",
        message: "an irreducible outcome owes its conflicts",
        path: ["conflicts"],
        input: ctx.value,
      });
    }

    if (outcome === "irreducible" && direction !== null) {
      ctx.issues.push({
        code: "custom",
        message: "an irreducible outcome carries no direction",
        path: ["direction"],
        input: ctx.value,
      });
    }
  });

export type DirectionCombination = z.infer<typeof directionCombinationSchema>;

/** The declared engine against one source engine — `source` is the slot. */
export interface SourceEngineComparison extends NarrativeEngineComparison {
  readonly source: DirectionCombinationSlot;
}

export interface DirectionCombinationMergedReport {
  readonly outcome: "merged";
  /** One dominant, and the selected one when the ask selected — the gate. */
  readonly acceptable: boolean;
  /** One comparison per source direction, in slot order. */
  readonly comparisons: readonly SourceEngineComparison[];
  /** The sources the declared engine *is*, per the established equivalence. */
  readonly dominantSlots: readonly DirectionCombinationSlot[];
  /** The slots whose `narrativeEngine` the ask selected, in slot order. */
  readonly engineSelections: readonly DirectionCombinationSlot[];
}

/** One named element the ask never selected — `conflict` indexes the answer. */
export interface DirectionCombinationUnverifiableElement {
  readonly conflict: number;
  readonly element: DirectionCombinationElementRef;
}

export interface DirectionCombinationIrreducibleReport {
  readonly outcome: "irreducible";
  /** Every named element is among the ask's selections — the gate. */
  readonly acceptable: boolean;
  /** How many conflicts the answer argues. A count, safe to log (§9). */
  readonly conflictCount: number;
  /** The named elements the ask cannot vouch for. Empty when acceptable. */
  readonly unverifiable: readonly DirectionCombinationUnverifiableElement[];
}

export type DirectionCombinationAnswerReport =
  DirectionCombinationMergedReport | DirectionCombinationIrreducibleReport;

/**
 * The gate over the parsed answer and its own ask — the mission-shaped entry
 * point.
 *
 * A merged answer is read for dominance (the module header's arithmetic); an
 * irreducible one for membership — every `(slot, element)` pair it names must
 * be one the ask selected, because a warning about elements nobody chose is
 * an answer to a question nobody asked. Either way a refusal is a report, and
 * the re-ask is the caller's decision.
 */
export function checkDirectionCombinationAnswer(
  input: DirectionCombinationInput,
  answer: DirectionCombination,
): DirectionCombinationAnswerReport {
  if (answer.outcome === "merged") {
    if (answer.direction === null) {
      throw new InternalError({
        message: "a merged combination reached the gate without its direction",
        fieldPath: "direction",
      });
    }

    const candidate = answer.direction.narrativeEngine;

    const comparisons = input.directions.map((direction, index) => ({
      source: slotAt(index),
      ...compareNarrativeEngines(direction.narrativeEngine, candidate),
    }));

    const dominantSlots = comparisons
      .filter((comparison) => !comparison.distinct)
      .map((comparison) => comparison.source);

    const engineSelections = checkDirectionCombinationSelection(input).engineSelections;

    const acceptable =
      engineSelections.length > 0
        ? dominantSlots.some((slot) => engineSelections.includes(slot)) &&
          comparisons.every(
            (comparison) => engineSelections.includes(comparison.source) || comparison.distinct,
          )
        : dominantSlots.length === 1;

    return { outcome: "merged", acceptable, comparisons, dominantSlots, engineSelections };
  }

  if (answer.conflicts === null) {
    throw new InternalError({
      message: "an irreducible combination reached the gate without its conflicts",
      fieldPath: "conflicts",
    });
  }

  const selectedElements = new Map<DirectionCombinationSlot, ReadonlySet<string>>();

  input.directions.forEach((direction, index) => {
    selectedElements.set(slotAt(index), new Set(direction.elements));
  });

  const unverifiable: DirectionCombinationUnverifiableElement[] = [];

  answer.conflicts.forEach((conflict, conflictIndex) => {
    conflict.elements.forEach((element) => {
      const selected = selectedElements.get(element.direction);

      if (selected === undefined || !selected.has(element.element)) {
        unverifiable.push({ conflict: conflictIndex, element });
      }
    });
  });

  return {
    outcome: "irreducible",
    acceptable: unverifiable.length === 0,
    conflictCount: answer.conflicts.length,
    unverifiable,
  };
}

/**
 * A throw rather than a `Result` (§7): the input schema caps the list at the
 * slot vocabulary's own length, so running out of slots is a bug, not an
 * answer.
 */
function slotAt(index: number): DirectionCombinationSlot {
  const slot = DIRECTION_COMBINATION_SLOTS[index];

  if (slot === undefined) {
    throw new InternalError({
      message: "a combination ask names more directions than there are slots",
      fieldPath: "directions",
    });
  }

  return slot;
}
