/**
 * @calepin/analysis — narrative diagnostic of the source text
 *
 * Public surface of the domain. Everything other workspaces are allowed to use
 * is re-exported from here; nothing reaches into `src/` directly.
 *
 * Backlog: E07 — CAL-070 to CAL-078
 */

export {
  CLICHE_RISK_CATEGORIES,
  CLICHE_RISK_CHAR_CEILINGS,
  CLICHE_RISK_COUNT,
  CLICHE_RISK_WORD_TARGETS,
  type ClicheRisk,
  type ClicheRiskCategory,
  type ClicheRiskDetection,
  clicheRiskDetectionSchema,
  type ClicheRiskDrop,
  type ClicheRiskEvidenceCheck,
  type ClicheRiskEvidenceReport,
  isVerifiedClicheRiskDetection,
  VERIFIED_CLICHE_DETECTION_BRAND,
  type VerifiedClicheRiskDetection,
  verifyClicheRiskEvidence,
} from "./cliche";
export {
  type AnalysisEvidenceCheck,
  type AnalysisEvidenceReport,
  EVIDENCE_CORRECTION_REASONS,
  type EvidenceCorrection,
  type EvidenceCorrectionReason,
  isVerifiedAnalysis,
  VERIFIED_ANALYSIS_BRAND,
  type VerifiedSourceTextAnalysis,
  verifyAnalysisEvidence,
} from "./evidence";
export {
  isVerifiedNovelPotentialAssessment,
  NOVEL_POTENTIAL_CHAR_CEILINGS,
  NOVEL_POTENTIAL_COUNTS,
  NOVEL_POTENTIAL_EVIDENCED_LISTS,
  NOVEL_POTENTIAL_WORD_TARGETS,
  type NovelPotentialAssessment,
  novelPotentialAssessmentSchema,
  type NovelPotentialEvidenceCheck,
  type NovelPotentialEvidenceCorrection,
  type NovelPotentialEvidencedList,
  type NovelPotentialEvidenceReport,
  type NovelPotentialExhaustion,
  type NovelPotentialExpansion,
  type NovelPotentialFragility,
  type NovelPotentialGap,
  VERIFIED_NOVEL_POTENTIAL_BRAND,
  type VerifiedNovelPotentialAssessment,
  verifyNovelPotentialEvidence,
} from "./potential";
export {
  ANALYSIS_CHAR_CEILINGS,
  ANALYSIS_ELEMENT_COUNTS,
  ANALYSIS_ELEMENT_KINDS,
  ANALYSIS_FIXED_KINDS,
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
export {
  type AnalysisElementDraft,
  analysisSectionElementLimit,
  isListedAnalysisSection,
  parseAnalysisSectionEdit,
} from "./section-edit";
