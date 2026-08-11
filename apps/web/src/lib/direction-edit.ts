/**
 * Rewriting a direction by hand, and writing one from scratch — the interface
 * layer's side of CAL-085.
 *
 * The division `lib/direction-discard.ts` already draws, one form later: a
 * `"use server"` module may export nothing but async functions, so the state
 * type, the French sentences and the field readers live here and the actions
 * import them. `directionsPath` and `readText` are `direction-discard.ts`'s
 * own — reused rather than duplicated, since a project id in a URL and a
 * trimmed form field mean the same thing for every direction-related form.
 *
 * **What a direction may say is `parseDirectionContent`'s answer, in
 * `@calepin/direction`.** This module only shapes a `FormData` into the raw
 * object the domain parses — a list field is a textarea, one item per line;
 * the narrative engine is five posted `<select>`s. Whether a line is too long
 * or an axis names no member is not decided here.
 */

import { NARRATIVE_ENGINE_AXES } from "@calepin/direction";

import { readText } from "@/lib/direction-discard";

/** The form's answer: nothing to say, or one sentence to show above the fields. */
export type DirectionEditState =
  { readonly status: "idle" } | { readonly status: "error"; readonly message: string };

export const INITIAL_DIRECTION_EDIT_STATE: DirectionEditState = { status: "idle" };

export const DIRECTION_EDIT_UNAVAILABLE_MESSAGE =
  "Cette direction n'a pas pu être enregistrée. La version précédente est intacte. Réessayez dans un instant.";

export const DIRECTION_CREATE_UNAVAILABLE_MESSAGE =
  "Cette direction n'a pas pu être enregistrée. Réessayez dans un instant.";

/** A textarea's content, one item per line — blank lines dropped, everything else trimmed. */
export function readDirectionListField(formData: FormData, name: string): readonly string[] {
  const raw = formData.get(name);
  if (typeof raw !== "string") return [];

  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

/**
 * The five posted engine axes, read as `unknown` — whether a value names a
 * real member of its axis is `narrativeEngineSchema`'s question, not this
 * reader's (the `PostedElement.kind` convention `lib/analysis-edit.ts`
 * already sets).
 */
export function readDirectionEngineSubmission(formData: FormData): unknown {
  return Object.fromEntries(
    NARRATIVE_ENGINE_AXES.map((axis) => [axis, formData.get(`engine.${axis}`)]),
  );
}

/** The full raw submission `parseDirectionContent` validates. */
export function readDirectionContentSubmission(formData: FormData): unknown {
  return {
    workingTitle: readText(formData.get("workingTitle")) ?? "",
    developedPremise: readText(formData.get("developedPremise")) ?? "",
    dominantGenre: readText(formData.get("dominantGenre")) ?? "",
    mainConflict: readText(formData.get("mainConflict")) ?? "",
    protagonistArc: readText(formData.get("protagonistArc")) ?? "",
    newStakes: readDirectionListField(formData, "newStakes"),
    charactersToIntroduce: readDirectionListField(formData, "charactersToIntroduce"),
    endingNature: readText(formData.get("endingNature")) ?? "",
    mainRisks: readDirectionListField(formData, "mainRisks"),
    elementsKeptFromSource: readDirectionListField(formData, "elementsKeptFromSource"),
    elementsTransformed: readDirectionListField(formData, "elementsTransformed"),
    novelPotentialAssessment: readText(formData.get("novelPotentialAssessment")) ?? "",
    narrativeEngine: readDirectionEngineSubmission(formData),
  };
}
