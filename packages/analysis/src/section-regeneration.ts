/**
 * Redoing one section of the diagnostic, and nothing else (CAL-077).
 *
 * The specification's principle 4.1 asks that the author stay in control of
 * what the product produces for them: a section they are not satisfied with is
 * relaunched on its own, optionally with a word about what to do differently,
 * and everything they have already read, edited and annotated stays exactly
 * where it was. `AnalysisSectionRevision` has been shaped for it since CAL-073
 * — the section is the unit of versioning — so this module owns the two things
 * the table cannot state: **what the mission is asked**, and **what it may
 * answer**.
 *
 * **The answer's schema is the section's own.** `analysisSectionElementsSchema`
 * is the very object the editor parses against (`section-edit.ts`), reached
 * rather than restated: the ceilings, the element counts and the five fixed
 * markers are one declaration with three readers — the whole-analysis mission,
 * the author's form, and this. §6 asks that a model answer be parsed before
 * anything happens to it; §5.5 asks that the domain own the schema. Reusing one
 * object satisfies both without a second contract able to disagree.
 *
 * **The ask is a value, not a rendering.** `analysisSectionRegenerationInput`
 * is what `Generation.input` stores and `generationIdempotencyKey` digests, and
 * it names the versions it is built on: the source text version read and the
 * revision being replaced. Two consequences the feature depends on — asking
 * again with a *different* instruction is a different ask and gets its own
 * generation, while a job the queue redelivers is the same one and is answered
 * from the row that already exists. The digest is also why the column can carry
 * the author's own words at all: it is never rendered anywhere (§9).
 *
 * **Verification is CAL-071's, at section granularity.** A regenerated section
 * is a model answer like any other, and the rule that a claim the text does not
 * support comes back an interpretation does not stop applying because only one
 * section was asked for. `verifyAnalysisSectionEvidence` runs the same
 * per-element rule `verifyAnalysisEvidence` runs — literally the same function
 * — over the elements of one section.
 *
 * **Nothing here is branded.** `verifyAnalysisEvidence` brands its result so a
 * domain-side writer can demand a checked analysis instead of remembering to
 * check one; the writer for this path is `regenerateAnalysisSection` in
 * `@calepin/shared/repository`, which may not import a domain (§3.2) and so
 * could never inspect a brand. A receipt nobody can read is a comment, so this
 * takes `editAnalysisSection`'s arrangement instead: the domain owns the rule,
 * the caller applies it at its own layer.
 */

import {
  fail,
  InternalError,
  type Result,
  succeed,
  toFieldPath,
  ValidationError,
} from "@calepin/shared/errors";
import { createVerbatimMatcher } from "@calepin/shared/text";
import { z } from "zod";

import {
  type AnalysisEvidenceReport,
  checkElementEvidence,
  type EvidenceCorrection,
} from "./evidence";
import { ANALYSIS_SECTIONS, type AnalysisSection } from "./schema";
import { type AnalysisElementDraft, analysisSectionElementsSchema } from "./section-edit";

/**
 * The longest complementary instruction the regeneration accepts.
 *
 * The same order as `ANALYSIS_ANNOTATION_CHAR_CEILING`, and a separate number
 * for the reason CAL-055 states about targets: the two bound different things —
 * a note *about* an element and a directive *for* a section — and one of them
 * moving is no reason for the other to. What the ceiling is really refusing is
 * the second brief: an instruction long enough to redefine what the section is
 * would be competing with the section's own definition, which the prompt holds
 * and the author does not.
 */
export const ANALYSIS_REGENERATION_INSTRUCTION_CHAR_CEILING = 1_000;

/**
 * What one regeneration was asked — the payload `Generation.input` carries.
 *
 * `fromRevisionNumber` is `0` when the section has never been produced, which
 * is a legitimate ask: a diagnostic whose `RELATIONSHIPS` came back empty is
 * exactly the case an author relaunches with an instruction. Naming it at all
 * is what makes the idempotency key mean *this* ask: relaunching the section
 * after editing it is a new question, not a redelivery of the old one.
 */
export const analysisSectionRegenerationInputSchema = z.strictObject({
  section: z.enum(ANALYSIS_SECTIONS),
  /** The source text version the mission reads — never the text itself. */
  sourceTextVersionId: z.string().trim().min(1),
  /** The revision this ask starts from; 0 when the section is not there yet. */
  fromRevisionNumber: z.number().int().nonnegative(),
  /** The author's complementary instruction, or null when they gave none. */
  instruction: z
    .string()
    .trim()
    .min(1)
    .max(ANALYSIS_REGENERATION_INSTRUCTION_CHAR_CEILING)
    .nullable(),
});

export type AnalysisSectionRegenerationInput = z.infer<
  typeof analysisSectionRegenerationInputSchema
>;

/**
 * Reads the author's optional instruction, or refuses it with a French
 * sentence.
 *
 * Absent, blank and whitespace are one answer — `null`, meaning *relaunch it as
 * it was asked the first time*. A `Result` rather than a throw for
 * `parseAnalysisSectionEdit`'s reason (§7): an author typing past the ceiling
 * is a failure the caller has to show them. The sentence names the rule and
 * never repeats what was typed, which here matters more than usual — the text
 * is the author's own words about their novel (§9).
 */
export function parseAnalysisRegenerationInstruction(value: unknown): Result<string | null> {
  if (value === null || value === undefined) return succeed(null);

  if (typeof value !== "string") {
    return fail(
      new ValidationError({
        message: "regeneration instruction is not text",
        userMessage: "Cette consigne n'a pas pu être lue.",
        fieldPath: "instruction",
      }),
    );
  }

  const instruction = value.trim();

  if (instruction === "") return succeed(null);

  if (instruction.length > ANALYSIS_REGENERATION_INSTRUCTION_CHAR_CEILING) {
    return fail(
      new ValidationError({
        message: "regeneration instruction exceeds its ceiling",
        userMessage: `Une consigne de régénération est limitée à ${ANALYSIS_REGENERATION_INSTRUCTION_CHAR_CEILING} caractères.`,
        fieldPath: "instruction",
      }),
    );
  }

  return succeed(instruction);
}

/** What the check made of one regenerated section — the elements, and counts. */
export interface AnalysisSectionEvidenceCheck {
  readonly elements: readonly AnalysisElementDraft[];
  readonly report: AnalysisEvidenceReport;
}

/**
 * Reads every quotation of one regenerated section back against the source
 * text.
 *
 * The input is an answer already parsed by `analysisSectionElementsSchema`
 * (§6). The output is parsed again by the same schema, because that parse *is*
 * the guarantee the corrections stayed inside the contract — the move
 * `verifyAnalysisEvidence` makes, one granularity down. The report is counts
 * and positions, never a word of the text (§9).
 */
export function verifyAnalysisSectionEvidence(
  section: AnalysisSection,
  elements: readonly AnalysisElementDraft[],
  sourceText: string,
): AnalysisSectionEvidenceCheck {
  const quotesTheText = createVerbatimMatcher(sourceText);
  const corrections: EvidenceCorrection[] = [];

  let quoted = 0;

  const checked = elements.map((element, index) => {
    if (element.evidence !== null) quoted += 1;

    const outcome = checkElementEvidence(element, section, index, quotesTheText);

    if (outcome.correction !== undefined) corrections.push(outcome.correction);

    return {
      kind: outcome.element.kind,
      label: outcome.element.label ?? null,
      statement: outcome.element.statement,
      evidence: outcome.element.evidence,
    };
  });

  const quotationsDropped = corrections.filter((entry) => entry.quotationDropped).length;

  return {
    elements: reparse(section, checked),
    report: {
      elements: elements.length,
      quoted,
      supported: quoted - quotationsDropped,
      reclassified: corrections.filter((entry) => entry.reclassified).length,
      quotationsDropped,
      corrections,
    },
  };
}

/**
 * A throw rather than a `Result` (§7): the only way here is a bug above — the
 * corrections made are dropping a quotation, which every section allows, and
 * relaxing a marker in a section that does not fix one. The path travels, the
 * value never does (§9).
 */
function reparse(
  section: AnalysisSection,
  checked: readonly AnalysisElementDraft[],
): readonly AnalysisElementDraft[] {
  const parsed = analysisSectionElementsSchema(section).safeParse(checked);

  if (!parsed.success) {
    throw new InternalError({
      message: "verifying a section produced a shape its own schema refuses",
      fieldPath: toFieldPath(parsed.error.issues[0]?.path ?? []),
    });
  }

  return parsed.data as readonly AnalysisElementDraft[];
}
