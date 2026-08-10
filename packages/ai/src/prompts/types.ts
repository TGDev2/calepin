/**
 * What a prompt *is* in this codebase (CAL-053).
 *
 * A prompt is a **versioned resource**, not a string: an identifier, a version
 * number, the mission it serves, the variables it expects — typed — and the two
 * pieces of text it is made of. CLAUDE.md §5.2 puts every prompt in the
 * registry, and ADR-001 asks that any output be attributable to exactly what
 * produced it. Both of those are claims about a resource; neither can be made
 * about a template literal sitting in a function.
 *
 * **Versions are append-only.** A wording change ships a new version beside the
 * old one; nothing is overwritten and nothing is deleted, which is what makes
 * `GenerationAttempt.promptVersion` worth recording — a number pointing at text
 * that has since been edited in place attributes nothing. It is the shape
 * `SourceTextVersion` already uses: numbering from 1, the current one is the
 * highest.
 *
 * **A rendered prompt is branded.** `RenderedPrompt` carries a symbol only
 * `renderPrompt` sets, so the port can require one and a caller cannot hand it
 * text it assembled itself. That is the same device `ProjectScope` uses one
 * layer up, for the same reason: the value is a receipt that a rule was
 * followed, and a receipt anyone can forge is a comment. It is what makes both
 * halves of this task structural — no prompt text reaches a provider from
 * outside the registry, and no call can happen without a version to record.
 */

import { MISSION_IDS, type MissionId } from "../missions";

/**
 * Every prompt this layer holds.
 *
 * The ten mission prompts are named after the mission they serve, because today
 * each mission has exactly one prompt. The identifier is still its own
 * vocabulary rather than an alias of the mission: `scope` is what says which
 * mission a prompt serves, so a second prompt for one mission — an experiment,
 * a variant — arrives as a new id and changes nothing about how the pipeline
 * finds it.
 *
 * `repair-structured-output` serves no mission and every mission: it is the
 * pipeline's own re-ask (CAL-052), appended to whichever mission prompt was
 * just rejected.
 *
 * The three `bench-*` prompts are the evaluation bench's judge (CAL-059): the
 * review of one output, the blinded comparison of two, and the synthesis of a
 * whole comparison run. They instruct a model, so §5.2 puts them here — being
 * registry resources is also what versions the judge itself, and a judgement
 * is only comparable to last month's if the question asked was the same.
 */
export const PROMPT_IDS = [
  ...MISSION_IDS,
  "repair-structured-output",
  "bench-review-output",
  "bench-compare-outputs",
  "bench-synthesize-comparison",
] as const;

export type PromptId = (typeof PROMPT_IDS)[number];

/**
 * Who a prompt is for.
 *
 * A discriminated union rather than an optional `missionId`, so a mission
 * prompt cannot exist without naming its mission and the pipeline's own prompts
 * cannot pretend to have one. It is also what lets `ModelRequest` require a
 * mission-scoped prompt at the top level: a repair re-ask is never a request on
 * its own.
 *
 * `bench` (CAL-059) is the evaluation bench's own scope: a judge prompt serves
 * no mission — it judges mission *outputs* — and it never reaches the mission
 * pipeline, whose requests still demand a mission-scoped prompt. The bench's
 * executor is the only caller that renders one.
 */
export type PromptScope =
  | { readonly kind: "mission"; readonly missionId: MissionId }
  | { readonly kind: "pipeline" }
  | { readonly kind: "bench" };

export const PROMPT_VARIABLE_TYPES = ["text", "number", "list"] as const;

/**
 * The three shapes a composed context block can take.
 *
 * `list` is also how an *optional* section is expressed: an empty list renders
 * as a dash, which is a legible "nothing here" in any language, while an empty
 * `text` is refused. That is deliberate — see `variables` below.
 */
export type PromptVariableType = (typeof PROMPT_VARIABLE_TYPES)[number];

export interface PromptVariable {
  /** `camelCase`, and the spelling of the `{{placeholder}}` in the text. */
  readonly name: string;
  readonly type: PromptVariableType;
  /** English, like every comment here: what the composer must put there. */
  readonly description: string;
}

export interface PromptDefinition {
  readonly id: PromptId;
  /** From 1, incremented by a new version placed after this one. */
  readonly version: number;
  readonly scope: PromptScope;
  /**
   * The variables the text expects, declared and typed.
   *
   * **All of them are required.** An optional variable is a section that
   * silently renders empty, and a version that renders differently for the same
   * inputs is not comparable — which would undercut `comparePromptVersions`. A
   * section that is genuinely sometimes absent is declared as a `list`, and an
   * empty one renders as a dash.
   *
   * The declaration is checked in both directions by `registry.test.ts`: every
   * placeholder in the text is declared, and every declared variable is used.
   * A variable nobody fills and a hole nobody declared are the two ways a
   * prompt quietly stops saying what it says.
   */
  readonly variables: readonly PromptVariable[];
  /** The permanent instruction, sent as the provider's `system`. */
  readonly system: string;
  /** The mission's request itself, sent as the user message. */
  readonly instruction: string;
}

/**
 * `Symbol.for`, for the reason `ProjectScope` and `AppError` use one: `apps/web`
 * compiles `packages/*` from source into more than one chunk graph, so a
 * module-local symbol would make a prompt rendered on one side unrecognisable
 * on the other (CLAUDE.md §12).
 */
export const RENDERED_PROMPT_BRAND: unique symbol = Symbol.for("calepin.RenderedPrompt");

/**
 * A prompt with its variables filled in, ready to be sent — and carrying the
 * exact version that produced it, which is the whole point.
 *
 * Never logged, never persisted: `text` holds the composed context, and that
 * context is literary content (§9). What travels into a log line and into a
 * `GenerationAttempt` row is `promptId` and `version`.
 */
export interface RenderedPrompt {
  readonly [RENDERED_PROMPT_BRAND]: true;
  readonly promptId: PromptId;
  readonly version: number;
  /** Absent for a pipeline prompt, which serves every mission and names none. */
  readonly missionId?: MissionId;
  readonly system: string;
  readonly text: string;
}

/** A rendered prompt that names its mission — the only kind a request may carry. */
export interface MissionPrompt extends RenderedPrompt {
  readonly missionId: MissionId;
}

/** The value one declared variable accepts. */
export type PromptValue<T extends PromptVariableType> = T extends "text"
  ? string
  : T extends "number"
    ? number
    : readonly string[];

/**
 * The typed variable record a definition demands.
 *
 * Resolved from the definition's own `variables` tuple, so a call site passing
 * a literal definition — which `currentPrompt` returns — is checked at compile
 * time: a missing variable, a misspelt one and a number where a list belongs
 * are all type errors. Shipping a version that declares a new variable then
 * breaks every call site that does not supply it, which is what declaring them
 * is for.
 */
export type PromptVariablesOf<D extends PromptDefinition> = {
  readonly [V in D["variables"][number] as V["name"]]: PromptValue<V["type"]>;
};

/** The kind of rendered prompt a definition produces, mission-scoped or not. */
export type RenderedPromptOf<D extends PromptDefinition> = D["scope"] extends {
  readonly kind: "mission";
}
  ? MissionPrompt
  : RenderedPrompt;

export function isRenderedPrompt(value: unknown): value is RenderedPrompt {
  return typeof value === "object" && value !== null && RENDERED_PROMPT_BRAND in value;
}
