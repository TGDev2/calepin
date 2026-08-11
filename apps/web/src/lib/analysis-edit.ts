/**
 * The analysis editor's shared vocabulary (CAL-073): what the forms post, how
 * it is read back, and the French sentences both halves agree on.
 *
 * It lives here rather than beside the actions for the reason CAL-031 recorded:
 * a `"use server"` module may export nothing but async functions, so a type or
 * a message table put there refuses to build.
 *
 * **No rule is decided here.** What a section may say is `@calepin/analysis`'s
 * (`parseAnalysisSectionEdit`), how long a note may be is the repository's
 * (`ANALYSIS_ANNOTATION_CHAR_CEILING`), and what a provenance state *is* is
 * `@calepin/shared/provenance`'s. This module reads a `FormData` and names
 * things in French; a second ceiling written on this side would be a second
 * answer able to disagree with the stored one.
 */

import { ANALYSIS_SECTIONS, type AnalysisSection } from "@calepin/analysis";
import type { ProvenanceState } from "@calepin/shared/provenance";

/** What the section form and its action pass back and forth. */
export type AnalysisEditState =
  { readonly status: "idle" } | { readonly status: "error"; readonly message: string };

export const INITIAL_ANALYSIS_EDIT_STATE: AnalysisEditState = { status: "idle" };

export const ANALYSIS_MISSING_MESSAGE = "Ce projet n'existe plus, ou il ne vous appartient pas.";

export const ANALYSIS_EDIT_UNAVAILABLE_MESSAGE =
  "La modification n'a pas pu être enregistrée. La version précédente de cette section est intacte. Réessayez dans un instant.";

export const ANNOTATION_UNAVAILABLE_MESSAGE =
  "L'annotation n'a pas pu être enregistrée. Réessayez dans un instant.";

/** Why validating the analysis did not happen (CAL-074), for the `?error=` banner. */
export const ANALYSIS_VALIDATION_ERRORS = ["missing", "already-validated", "unavailable"] as const;
export type AnalysisValidationError = (typeof ANALYSIS_VALIDATION_ERRORS)[number];

const ANALYSIS_VALIDATION_MESSAGES: Record<AnalysisValidationError, string> = {
  missing: ANALYSIS_MISSING_MESSAGE,
  "already-validated": "Cette analyse est déjà validée.",
  unavailable: "La validation n'a pas pu être enregistrée. Réessayez dans un instant.",
};

/** `null` for no code at all — the caller renders no banner in that case. */
export function analysisValidationErrorMessage(code: string | string[] | undefined): string | null {
  const value = Array.isArray(code) ? code[0] : code;

  if (value === undefined) return null;

  return isAnalysisValidationError(value)
    ? ANALYSIS_VALIDATION_MESSAGES[value]
    : ANALYSIS_VALIDATION_MESSAGES.unavailable;
}

function isAnalysisValidationError(value: string): value is AnalysisValidationError {
  return (ANALYSIS_VALIDATION_ERRORS as readonly string[]).includes(value);
}

/**
 * How each provenance state is named on screen — the three the task asks for,
 * plus the one they are read against.
 *
 * The French is the interface layer's, as `project-action-error.ts` already
 * draws that line: `@calepin/shared/provenance` decides the state, this table
 * decides the words. `explanation` is what makes the marker mean something to
 * someone who has never thought about where a sentence came from.
 */
export const PROVENANCE_LABELS: Record<
  ProvenanceState,
  { readonly label: string; readonly explanation: string }
> = {
  proposed: {
    label: "Proposition du modèle",
    explanation: "Écrit par l'analyse. Vous ne l'avez pas encore relu.",
  },
  accepted: {
    label: "Élément validé",
    explanation: "Proposé par l'analyse, puis conservé tel quel lors de votre relecture.",
  },
  edited: {
    label: "Modification manuelle",
    explanation: "Proposé par l'analyse, puis réécrit par vous.",
  },
  "user-written": {
    label: "Rédigé par vous",
    explanation: "Ajouté par vous ; l'analyse ne l'avait pas proposé.",
  },
};

/** One element as the form posted it, before the domain has seen it. */
export interface PostedElement {
  readonly lineageId: string | null;
  readonly kind: unknown;
  readonly label: string | null;
  readonly statement: string;
  readonly evidence: string | null;
}

/** The section a form names, or `null` when it names nothing this app knows. */
export function readAnalysisSection(value: unknown): AnalysisSection | null {
  return typeof value === "string" && (ANALYSIS_SECTIONS as readonly string[]).includes(value)
    ? (value as AnalysisSection)
    : null;
}

/**
 * The elements a section form posted, in the order they were rendered.
 *
 * **A row the author marked for removal is dropped, and so is a blank row they
 * never filled in.** The editor renders spare rows for additions, and a form
 * whose blank rows became empty elements would refuse to save for a reason
 * nobody typed. A blank row that *does* carry a lineage is kept: the author
 * emptied an element that exists, and the domain's refusal is the right answer
 * rather than a silent deletion.
 *
 * Everything else is passed through untouched — `kind` as `unknown`, because
 * deciding whether it is a marker is the schema's job and not this module's.
 */
export function readPostedElements(
  formData: FormData,
  { listed }: { readonly listed: boolean },
): readonly PostedElement[] {
  const rowCount = Number(formData.get("rowCount"));
  if (!Number.isInteger(rowCount) || rowCount < 0 || rowCount > MAX_POSTED_ROWS) return [];

  const elements: PostedElement[] = [];

  for (let row = 0; row < rowCount; row += 1) {
    if (formData.get(`remove.${row}`) !== null) continue;

    const lineageId = readText(formData.get(`lineage.${row}`));
    const statement = readText(formData.get(`statement.${row}`)) ?? "";

    if (lineageId === null && statement === "") continue;

    elements.push({
      lineageId,
      kind: formData.get(`kind.${row}`),
      label: listed ? readText(formData.get(`label.${row}`)) : null,
      statement,
      evidence: readText(formData.get(`evidence.${row}`)),
    });
  }

  return elements;
}

/**
 * A ceiling on how many rows one post may describe. Not a product rule — the
 * domain's element counts are — but a bound on a loop driven by a number that
 * arrived from a browser.
 */
const MAX_POSTED_ROWS = 64;

/** The posted value, trimmed, or `null` when the field carried nothing. */
export function readText(value: unknown): string | null {
  if (typeof value !== "string") return null;

  const trimmed = value.trim();

  return trimmed === "" ? null : trimmed;
}

/** Where a section's editor lives, and where closing it returns to. */
export function analysisPath(projectId: string, query?: Record<string, string>): string {
  const base = `/projects/${encodeURIComponent(projectId)}/analysis`;
  const search = new URLSearchParams(query).toString();

  return search === "" ? base : `${base}?${search}`;
}
