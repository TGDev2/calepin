/**
 * What the author is allowed to make one section of the diagnostic say
 * (CAL-073).
 *
 * **One schema, two write paths.** A section arrives either from
 * `analyze-source-text` — parsed whole by `sourceTextAnalysisSchema` before
 * anything is persisted (§6) — or from a person editing it on screen. Those two
 * must be bound by the same rules, so this does not restate them: it reaches
 * into `sourceTextAnalysisSchema.shape` and reuses the section's own schema.
 * A ceiling raised there is raised here in the same diff, and a section whose
 * definition changes cannot leave a second copy behind.
 *
 * **A paragraph section is one element with no label.** CAL-014 draws that line
 * and the schema encodes it as a different *shape* rather than a different
 * field list; the editor needs one shape for all seventeen sections, so the
 * paragraph schema is lifted into an array of exactly one and the absent label
 * is required to be null rather than merely tolerated as missing. A stray label
 * is then a refusal instead of a silent discard.
 *
 * **Nothing here checks the evidence against the source text.**
 * `verifyAnalysisEvidence` rewrites the marker *the model chose* (CAL-071); the
 * author is the authority on their own text, and reclassifying their `FACTUAL`
 * behind their back would be the product arguing with them. What still applies
 * is the section's definition — the element counts, the ceilings and the five
 * fixed kinds — because those say what a section *is*, not whether someone is
 * right about it.
 */

import { fail, fromValidationIssues, type Result, succeed } from "@calepin/shared/errors";
import { z } from "zod";

import {
  ANALYSIS_ELEMENT_COUNTS,
  ANALYSIS_FIXED_KINDS,
  ANALYSIS_SECTION_FIELDS,
  type AnalysisElementKind,
  type AnalysisSection,
  sourceTextAnalysisSchema,
} from "./schema";

/**
 * One element of a section in the shape persistence takes it — `label` present
 * and null for a paragraph section rather than absent, so a caller walks one
 * shape over all seventeen sections.
 */
export interface AnalysisElementDraft {
  readonly kind: AnalysisElementKind;
  readonly label: string | null;
  readonly statement: string;
  readonly evidence: string | null;
}

/**
 * Whether a section is a list of elements or a single paragraph — read off the
 * schema rather than restated as a second list able to disagree with it.
 */
export function isListedAnalysisSection(section: AnalysisSection): boolean {
  return sectionShape(section) instanceof z.ZodArray;
}

/**
 * How many elements a section may hold — what the editor renders rows for.
 * `ANALYSIS_ELEMENT_COUNTS` is the same table the schema's bounds are built
 * from, so the form cannot offer a row the schema is about to refuse. A
 * paragraph section is one, always.
 */
export function analysisSectionElementLimit(section: AnalysisSection): number {
  const field = ANALYSIS_SECTION_FIELDS[section];

  return field in ANALYSIS_ELEMENT_COUNTS
    ? ANALYSIS_ELEMENT_COUNTS[field as keyof typeof ANALYSIS_ELEMENT_COUNTS].max
    : 1;
}

/**
 * Parses an edited section, or refuses it with a French sentence.
 *
 * A `Result` rather than a throw: an author writing a theme past the ceiling,
 * or emptying a section that must not be empty, is a failure the caller has to
 * show them and not a bug (§7). The sentence names the rule and never quotes
 * what was typed; `fieldPath` is the path of the first issue and never its
 * value (§9) — `fromValidationIssues` is what guarantees the second half, since
 * it declares no `message` field to copy a validator's own into.
 */
export function parseAnalysisSectionEdit(
  section: AnalysisSection,
  submitted: unknown,
): Result<readonly AnalysisElementDraft[]> {
  const parsed = sectionElementsSchema(section).safeParse(submitted);

  if (!parsed.success) {
    return fail(
      fromValidationIssues(parsed.error, {
        userMessage: refusalMessage(section, parsed.error),
      }),
    );
  }

  return succeed(parsed.data as readonly AnalysisElementDraft[]);
}

function sectionShape(section: AnalysisSection) {
  return sourceTextAnalysisSchema.shape[ANALYSIS_SECTION_FIELDS[section]];
}

/**
 * The section's own schema, lifted to a list of elements.
 *
 * A listed section already is one and is reused untouched — bounds, ceilings,
 * fixed kind and all. A paragraph section becomes an array of exactly one with
 * `label: null` required.
 */
function sectionElementsSchema(section: AnalysisSection): z.ZodType {
  const shape = sectionShape(section);

  return shape instanceof z.ZodArray ? shape : z.array(shape.extend({ label: z.null() })).length(1);
}

/**
 * One French sentence for the reader, chosen from the *kind* of the first issue
 * and never from its value.
 *
 * Four remedies are worth distinguishing: too few elements, too many, something
 * too long, and a marker the section's definition fixes.
 */
function refusalMessage(section: AnalysisSection, error: z.ZodError): string {
  const issue = error.issues[0];

  if (issue === undefined) return GENERIC_REFUSAL;

  if (issue.code === "too_small") {
    if (issue.origin !== "array") {
      return "Chaque élément doit porter un énoncé ; un champ obligatoire est vide.";
    }

    return isListedAnalysisSection(section)
      ? "Cette section doit garder au moins un élément."
      : "Cette section attend un texte, et un seul.";
  }

  if (issue.code === "too_big") {
    return issue.origin === "array"
      ? "Cette section n'accepte pas autant d'éléments."
      : "Un des textes saisis est trop long pour cette section.";
  }

  if (issue.path.at(-1) === "kind" && section in ANALYSIS_FIXED_KINDS) {
    return "La nature des éléments de cette section est fixée par sa définition et ne peut pas être changée.";
  }

  return GENERIC_REFUSAL;
}

const GENERIC_REFUSAL = "Cette section n'a pas pu être enregistrée telle quelle.";
