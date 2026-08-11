/**
 * `@calepin/shared/provenance` — the traceability pattern (CAL-073).
 *
 * Established for the analysis and written to be reused as is by the bible
 * (E08), the outline (E10) and the chapters (E11): the same three rules apply
 * wherever a person edits something a model proposed. See `provenance.ts` for
 * what those rules are and why each one is where it is.
 */

export {
  CONTENT_ORIGINS,
  type ContentOrigin,
  PROVENANCE_STATES,
  type ProvenanceState,
} from "./origins";
export {
  type CarriedElement,
  type CarriedProvenance,
  carryProvenance,
  type CarryProvenanceInput,
  originAfterEdit,
  type PreviousElement,
  type Provenance,
  resolveProvenanceState,
  type SubmittedElement,
} from "./provenance";
