/**
 * The diagnostic as everything downstream of it reads it (CAL-210).
 *
 * The seventeen sections named in French, and the rendering a mission quotes
 * them by. Here rather than in `@calepin/analysis` because the readers are other
 * domains — the directions today, the bible next — and a domain may not import a
 * domain (§3.2).
 *
 * Pure: no database read, no Prisma value import, nothing a browser bundle would
 * refuse. What produces the input is `getAnalysis` in
 * `@calepin/shared/repository`, one entry point over.
 */

export {
  type AnalysisElementForPrompt,
  type AnalysisSectionForPrompt,
  describeAnalysis,
} from "./describe";
export { ANALYSIS_ELEMENT_KIND_LABELS, ANALYSIS_SECTION_LABELS } from "./labels";
