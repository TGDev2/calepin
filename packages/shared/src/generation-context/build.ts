import type { FreedomLevel } from "../freedom-level";
import type { GenerationContext } from "./types";

/**
 * A pure passthrough on purpose: both settings are already resolved by the
 * time this runs. `project.language` is the wizard's manual choice, which
 * always overrides the detected proposal at creation (CAL-042), and
 * `project.freedomLevel` is a stored enum with no default to apply here — the
 * column's own `BALANCED` default already applied at insert (CAL-044).
 */
export function buildGenerationContext(project: {
  readonly language: string;
  readonly freedomLevel: FreedomLevel;
}): GenerationContext {
  return { language: project.language, freedomLevel: project.freedomLevel };
}
