/**
 * Turning a prompt resource into the text one call sends (CAL-053).
 *
 * `renderPrompt` is the only thing that mints a `RenderedPrompt`, which is what
 * makes the brand worth having: text reaching a provider has come through a
 * declared, versioned resource, and it carries the version it came from.
 *
 * **Every failure here is a throw, never a `Result`** (CLAUDE.md §7). The values
 * are supplied by our own composer, not by a model or by a client: a missing
 * variable, a wrong type or an undeclared placeholder is a call-site bug that
 * would produce a prompt with a hole in it, and it would fail on every call
 * rather than on the unlucky one. The `fieldPath` names the variable; the value
 * never travels — it is composed context, which is literary content (§9).
 */

import { InternalError } from "@calepin/shared/errors";

import {
  isRenderedPrompt,
  type MissionPrompt,
  type PromptDefinition,
  type PromptVariable,
  type PromptVariablesOf,
  RENDERED_PROMPT_BRAND,
  type RenderedPrompt,
  type RenderedPromptOf,
} from "./types";

/**
 * `{{camelCase}}`. Narrow on purpose: a pattern accepting anything would make a
 * stray brace in a French instruction look like a hole to fill.
 */
const PLACEHOLDER_PATTERN = /\{\{([a-z][a-zA-Z0-9]*)\}\}/g;

/** What an empty `list` renders as — a legible "nothing here", in no language. */
const EMPTY_LIST = "—";

/** The placeholders a piece of prompt text asks for, in order, without duplicates. */
export function placeholdersOf(text: string): readonly string[] {
  const found = new Set<string>();

  for (const match of text.matchAll(PLACEHOLDER_PATTERN)) {
    const name = match[1];

    if (name !== undefined) {
      found.add(name);
    }
  }

  return [...found];
}

/**
 * Fills a prompt's variables in and stamps the result with the version that
 * produced it.
 *
 * The substitution is a single pass over the text, so a *value* containing
 * something that looks like a placeholder is inserted verbatim rather than
 * re-scanned — the composed context routinely carries braces, and a second pass
 * over it would turn an author's own text into an instruction.
 */
export function renderPrompt<D extends PromptDefinition>(
  definition: D,
  variables: PromptVariablesOf<D>,
): RenderedPromptOf<D> {
  const supplied = variables as Readonly<Record<string, unknown>>;
  const declared = new Map<string, PromptVariable>();
  const rendered = new Map<string, string>();

  for (const variable of definition.variables) {
    declared.set(variable.name, variable);
    rendered.set(variable.name, renderValue(variable, supplied[variable.name]));
  }

  const fill = (text: string): string => {
    for (const name of placeholdersOf(text)) {
      if (!declared.has(name)) {
        // A hole nobody declared: the compiler cannot see it, because the text
        // is a string. Left alone it would ship `{{chapterOutline}}` to a
        // provider, which is the one failure this pass exists to make loud.
        throw new InternalError({
          code: "PROMPT_VARIABLE_INVALID",
          message: "the prompt text carries a placeholder the resource does not declare",
          fieldPath: name,
        });
      }
    }

    return text.replace(PLACEHOLDER_PATTERN, (whole, name: string) => rendered.get(name) ?? whole);
  };

  const prompt: RenderedPrompt = {
    [RENDERED_PROMPT_BRAND]: true,
    promptId: definition.id,
    version: definition.version,
    ...(definition.scope.kind === "mission" ? { missionId: definition.scope.missionId } : {}),
    system: fill(definition.system),
    text: fill(definition.instruction),
  };

  // The one cast here, and it restates what the line above just decided: a
  // mission-scoped definition produces a prompt carrying a mission id.
  // `render.test.ts` pins the pair so the claim is checked rather than asserted.
  return prompt as RenderedPromptOf<D>;
}

function renderValue(variable: PromptVariable, value: unknown): string {
  switch (variable.type) {
    case "text":
      if (typeof value !== "string" || value.trim() === "") {
        throw invalidVariable(variable);
      }

      return value;

    case "number":
      if (typeof value !== "number" || !Number.isFinite(value)) {
        throw invalidVariable(variable);
      }

      return String(value);

    case "list": {
      if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
        throw invalidVariable(variable);
      }

      const items = value as readonly string[];

      return items.length === 0 ? EMPTY_LIST : items.map((item) => `- ${item}`).join("\n");
    }
  }
}

/**
 * Names the variable and its declared type, never the value that failed —
 * `AppError.message` is the first line of a stack (§7) and the value is
 * composed context (§9). The type is safe to state: it is the schema's, not the
 * caller's.
 */
function invalidVariable(variable: PromptVariable): InternalError {
  return new InternalError({
    code: "PROMPT_VARIABLE_INVALID",
    message: "a prompt variable is missing or is not of its declared type",
    fieldPath: `${variable.name}:${variable.type}`,
  });
}

/**
 * Refuses a prompt the registry never minted — a plain object, a value that
 * crossed a serialisation boundary, anything a cast let through.
 *
 * A throw rather than a `Result`, for the reason `assertProjectScope` throws: a
 * provider reached with unversioned text is a mis-wired call site, not a
 * failure a caller could recover from. It is also the last line of §5.2's
 * defence — the type says a request carries a rendered prompt, and this says
 * the value actually is one.
 */
export function assertMissionPrompt(prompt: MissionPrompt): void {
  if (!isRenderedPrompt(prompt) || prompt.missionId === undefined) {
    throw new InternalError({
      code: "PROMPT_NOT_RENDERED",
      message: "a model request carries a prompt the registry did not render",
    });
  }
}
