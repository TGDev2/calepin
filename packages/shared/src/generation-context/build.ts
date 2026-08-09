import type { GenerationContext } from "./types";

/**
 * A pure passthrough on purpose: `project.language` is already the resolved
 * value by the time this runs, since the wizard's manual choice (CAL-042)
 * always overrides the detected proposal at creation, and nothing afterwards
 * second-guesses it.
 */
export function buildGenerationContext(project: { readonly language: string }): GenerationContext {
  return { language: project.language };
}
