/**
 * @calepin/analysis — narrative diagnostic of the source text
 *
 * Public surface of the domain. Everything other workspaces are allowed to use
 * is re-exported from here; nothing reaches into `src/` directly.
 *
 * Backlog: E07 — CAL-070 to CAL-078
 */

export {
  ANALYSIS_CHAR_CEILINGS,
  ANALYSIS_ELEMENT_COUNTS,
  ANALYSIS_ELEMENT_KINDS,
  ANALYSIS_LABEL_CHAR_CEILING,
  ANALYSIS_SECTION_FIELDS,
  ANALYSIS_SECTIONS,
  ANALYSIS_TOTAL_WORD_BUDGET,
  ANALYSIS_WORD_TARGETS,
  type AnalysisElementKind,
  type AnalysisSection,
  type SourceTextAnalysis,
  sourceTextAnalysisSchema,
} from "./schema";
