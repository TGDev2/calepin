/**
 * Comparing two versions of one prompt (CAL-053).
 *
 * The tool the backlog asks for, and the reason the registry keeps every
 * version rather than only the current one: a quality regression is traced by
 * reading what changed between the version a good chapter recorded and the
 * version a bad one did.
 *
 * **Two versions of the *same* prompt, and nothing else.** Comparing two
 * different prompts is refused, because they do not share a variable set and
 * the diff would be a diff of two unrelated texts — a question nobody asked.
 *
 * A structured comparison first, a rendering second. The structure is what a
 * test can assert on and what an operations view can display later;
 * `formatPromptComparison` is what `pnpm prompt:diff` prints. Both are English:
 * this is a developer tool, and only the prompt text inside it is French.
 */

import { InternalError } from "@calepin/shared/errors";

import { promptAtVersion } from "./registry";
import type { PromptDefinition, PromptId, PromptVariable, PromptVariableType } from "./types";

export type DiffLineKind = "kept" | "added" | "removed";

export interface DiffLine {
  readonly kind: DiffLineKind;
  readonly text: string;
}

export interface TextComparison {
  readonly lines: readonly DiffLine[];
  readonly addedCount: number;
  readonly removedCount: number;
}

export interface VariableRetyping {
  readonly name: string;
  readonly from: PromptVariableType;
  readonly to: PromptVariableType;
}

/**
 * What the contract with the composer gained, lost or changed shape.
 *
 * Reported apart from the text diff because it is the half that breaks a call
 * site: a variable added is a value CAL-054 must now supply, and a variable
 * retyped is a value it must supply differently.
 */
export interface VariableComparison {
  readonly added: readonly PromptVariable[];
  readonly removed: readonly PromptVariable[];
  readonly retyped: readonly VariableRetyping[];
}

export interface PromptComparison {
  readonly promptId: PromptId;
  readonly from: number;
  readonly to: number;
  /** True when the two versions differ in nothing but their version number. */
  readonly identical: boolean;
  readonly variables: VariableComparison;
  readonly system: TextComparison;
  readonly instruction: TextComparison;
}

/**
 * Two versions of one prompt, by number — the entry point the tool uses.
 *
 * A version the registry never shipped fails in `promptAtVersion` rather than
 * producing a diff against nothing.
 */
export function comparePromptVersions(
  promptId: PromptId,
  from: number,
  to: number,
): PromptComparison {
  return comparePrompts(promptAtVersion(promptId, from), promptAtVersion(promptId, to));
}

/**
 * The comparison itself, over two definitions — the same prompt's, and only
 * ever the same prompt's.
 *
 * *Deux versions d'un même prompt* is the question the backlog asks, and it is
 * the only one that has an answer: two different prompts share no variable set,
 * so a diff of them would report every variable added and every variable
 * removed, which says nothing about either.
 */
export function comparePrompts(
  before: PromptDefinition,
  after: PromptDefinition,
): PromptComparison {
  if (before.id !== after.id) {
    throw new InternalError({
      message: "two different prompts cannot be compared",
      fieldPath: `${before.id}/${after.id}`,
    });
  }

  const promptId = before.id;
  const from = before.version;
  const to = after.version;

  const system = diffText(before.system, after.system);
  const instruction = diffText(before.instruction, after.instruction);
  const variables = diffVariables(before, after);

  return {
    promptId,
    from,
    to,
    identical:
      system.addedCount === 0 &&
      system.removedCount === 0 &&
      instruction.addedCount === 0 &&
      instruction.removedCount === 0 &&
      variables.added.length === 0 &&
      variables.removed.length === 0 &&
      variables.retyped.length === 0,
    variables,
    system,
    instruction,
  };
}

function diffVariables(before: PromptDefinition, after: PromptDefinition): VariableComparison {
  const byName = (definition: PromptDefinition): ReadonlyMap<string, PromptVariable> =>
    new Map(definition.variables.map((variable) => [variable.name, variable]));

  const previous = byName(before);
  const next = byName(after);

  return {
    added: after.variables.filter((variable) => !previous.has(variable.name)),
    removed: before.variables.filter((variable) => !next.has(variable.name)),
    retyped: after.variables.flatMap((variable) => {
      const was = previous.get(variable.name);

      return was === undefined || was.type === variable.type
        ? []
        : [{ name: variable.name, from: was.type, to: variable.type }];
    }),
  };
}

/**
 * A line-level diff, by longest common subsequence.
 *
 * Line-level rather than word-level on purpose: a prompt is a sequence of
 * instructions, one per line, and what a reader needs to see is which
 * instruction appeared or disappeared. Prompts are tens of lines long, so the
 * quadratic table is a few thousand cells.
 */
export function diffText(before: string, after: string): TextComparison {
  const previous = before.split("\n");
  const next = after.split("\n");
  const common = commonLengths(previous, next);

  const lines: DiffLine[] = [];
  let addedCount = 0;
  let removedCount = 0;
  let i = 0;
  let j = 0;

  while (i < previous.length && j < next.length) {
    if (previous[i] === next[j]) {
      lines.push({ kind: "kept", text: previous[i] ?? "" });
      i += 1;
      j += 1;
    } else if (lengthAt(common, i + 1, j) >= lengthAt(common, i, j + 1)) {
      lines.push({ kind: "removed", text: previous[i] ?? "" });
      removedCount += 1;
      i += 1;
    } else {
      lines.push({ kind: "added", text: next[j] ?? "" });
      addedCount += 1;
      j += 1;
    }
  }

  for (; i < previous.length; i += 1) {
    lines.push({ kind: "removed", text: previous[i] ?? "" });
    removedCount += 1;
  }

  for (; j < next.length; j += 1) {
    lines.push({ kind: "added", text: next[j] ?? "" });
    addedCount += 1;
  }

  return { lines, addedCount, removedCount };
}

/** `common[i][j]` — the length of the longest common subsequence of the two tails. */
function commonLengths(previous: readonly string[], next: readonly string[]): number[][] {
  const table: number[][] = Array.from({ length: previous.length + 1 }, () =>
    new Array<number>(next.length + 1).fill(0),
  );

  for (let i = previous.length - 1; i >= 0; i -= 1) {
    for (let j = next.length - 1; j >= 0; j -= 1) {
      const row = table[i];

      if (row === undefined) {
        continue;
      }

      row[j] =
        previous[i] === next[j]
          ? lengthAt(table, i + 1, j + 1) + 1
          : Math.max(lengthAt(table, i + 1, j), lengthAt(table, i, j + 1));
    }
  }

  return table;
}

function lengthAt(table: readonly number[][], i: number, j: number): number {
  return table[i]?.[j] ?? 0;
}

/**
 * The comparison as a human reads it: the variable contract first, because that
 * is what breaks a caller, then the two texts in the usual `+`/`-` shape.
 */
export function formatPromptComparison(comparison: PromptComparison): string {
  const out: string[] = [`${comparison.promptId}: version ${comparison.from} → ${comparison.to}`];

  if (comparison.identical) {
    return [...out, "", "No difference other than the version number."].join("\n");
  }

  const { added, removed, retyped } = comparison.variables;

  if (added.length > 0 || removed.length > 0 || retyped.length > 0) {
    out.push("", "Variables");

    for (const variable of removed) {
      out.push(`  - ${variable.name} (${variable.type})`);
    }

    for (const variable of added) {
      out.push(`  + ${variable.name} (${variable.type}) — ${variable.description}`);
    }

    for (const change of retyped) {
      out.push(`  ~ ${change.name}: ${change.from} → ${change.to}`);
    }
  }

  for (const [title, text] of [
    ["System", comparison.system],
    ["Instruction", comparison.instruction],
  ] as const) {
    if (text.addedCount === 0 && text.removedCount === 0) {
      continue;
    }

    out.push("", `${title} (+${text.addedCount} −${text.removedCount})`);

    for (const line of text.lines) {
      out.push(`${MARKERS[line.kind]} ${line.text}`);
    }
  }

  return out.join("\n");
}

const MARKERS: Readonly<Record<DiffLineKind, string>> = {
  kept: "  ",
  added: " +",
  removed: " -",
};
