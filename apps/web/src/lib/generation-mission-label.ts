import type { GenerationMission } from "@calepin/shared/repository";

/**
 * The French label for a generation mission, same shape as
 * `project-status-label.ts`. Order matches the eighteen mission identifiers
 * CLAUDE.md's glossary lists (CAL-051, CAL-055, CAL-075, CAL-076, CAL-077,
 * CAL-083, CAL-084, CAL-088, CAL-089).
 *
 * Presentation only: what a mission actually does belongs to the mission
 * registry (`@calepin/ai`, CAL-051), not here.
 */
const GENERATION_MISSION_LABELS: Record<GenerationMission, string> = {
  ANALYZE_SOURCE_TEXT: "Analyse du texte source",
  DETECT_CLICHE_RISKS: "Détection des risques de clichés",
  ASSESS_NOVEL_POTENTIAL: "Évaluation du potentiel romanesque",
  REGENERATE_ANALYSIS_SECTION: "Régénération d'une section d'analyse",
  PROPOSE_DIRECTIONS: "Proposition de directions",
  REPLACE_DIRECTION: "Remplacement d'une direction",
  EVALUATE_DIRECTION: "Évaluation d'une direction",
  COMBINE_DIRECTIONS: "Combinaison de directions",
  DEFINE_NOVEL_IDENTITY: "Définition de l'identité du roman",
  DEFINE_STYLE: "Définition de la section style",
  CREATE_CHARACTER_SHEET: "Création d'une fiche personnage",
  RELATE_CHARACTERS: "Mise en relation des personnages",
  DEFINE_WORLD: "Définition de la bible du monde",
  BUILD_CHAPTER_OUTLINE: "Construction d'un plan de chapitre",
  WRITE_SCENE: "Rédaction d'une scène",
  EXTRACT_FACTS: "Extraction des faits",
  CHECK_COHERENCE: "Contrôle de cohérence",
  FIX_ISSUE: "Correction d'un problème",
  SUMMARIZE_CHAPTER: "Résumé d'un chapitre",
  SUMMARIZE_PART: "Résumé d'une partie",
};

export function generationMissionLabel(mission: GenerationMission): string {
  return GENERATION_MISSION_LABELS[mission];
}
