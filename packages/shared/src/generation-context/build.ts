import type { FreedomLevel } from "../freedom-level";
import type { GenerationContext } from "./types";

/**
 * A pure passthrough on purpose: all three settings are already resolved by
 * the time this runs. `project.language` is the wizard's manual choice, which
 * always overrides the detected proposal at creation (CAL-042);
 * `project.freedomLevel` is a stored enum with no default to apply here — the
 * column's own `BALANCED` default already applied at insert (CAL-044); and
 * `project.targetAudience` is the wizard's short-list-or-free-text choice,
 * with its own `"Grand public"` column default (CAL-045).
 */
export function buildGenerationContext(project: {
  readonly language: string;
  readonly freedomLevel: FreedomLevel;
  readonly targetAudience: string;
}): GenerationContext {
  return {
    language: project.language,
    freedomLevel: project.freedomLevel,
    targetAudience: project.targetAudience,
  };
}
