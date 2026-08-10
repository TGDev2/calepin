/**
 * `pnpm prompt:diff` — the comparison tool CAL-053 asks for, with a face.
 *
 *   pnpm prompt:diff                          list every prompt and its versions
 *   pnpm prompt:diff <prompt-id>              list one prompt's versions
 *   pnpm prompt:diff <prompt-id> <from> <to>  compare two versions of it
 *
 * A command, not a library: `console` is its return value, which is the one
 * place §7's *never `console.log` in shipped code* does not apply — nothing
 * imports this file, and it lives outside `src/` for that reason. It is
 * typechecked and linted like everything else (`tsconfig.json` includes
 * `scripts/`), because a tool that stops compiling is a tool nobody runs.
 *
 * It prints prompt text, which is a repository artefact and not literary
 * content: the composed context — the novel — never enters a definition, only
 * the `{{placeholders}}` that will receive it (§9).
 */

import {
  comparePromptVersions,
  formatPromptComparison,
  PROMPT_IDS,
  type PromptId,
  promptVersions,
} from "../src/prompts";

const USAGE = [
  "Usage:",
  "  pnpm prompt:diff                          list every prompt and its versions",
  "  pnpm prompt:diff <prompt-id>              list one prompt's versions",
  "  pnpm prompt:diff <prompt-id> <from> <to>  compare two versions of it",
].join("\n");

function isPromptId(value: string): value is PromptId {
  return (PROMPT_IDS as readonly string[]).includes(value);
}

function describe(id: PromptId): string {
  const versions = promptVersions(id);
  const current = versions[versions.length - 1];
  const scope = current?.scope.kind === "mission" ? current.scope.missionId : "pipeline";

  return `${id}  versions ${versions.map((one) => one.version).join(", ")}  (${scope})`;
}

function main(argv: readonly string[]): number {
  const [id, from, to] = argv;

  if (id === undefined) {
    console.log(PROMPT_IDS.map(describe).join("\n"));

    return 0;
  }

  if (!isPromptId(id)) {
    console.error(`Unknown prompt: ${id}\n\n${PROMPT_IDS.join("\n")}`);

    return 1;
  }

  if (from === undefined || to === undefined) {
    console.log(describe(id));

    return 0;
  }

  const [before, after] = [Number(from), Number(to)];

  if (!Number.isInteger(before) || !Number.isInteger(after)) {
    console.error(`Versions are whole numbers.\n\n${USAGE}`);

    return 1;
  }

  console.log(formatPromptComparison(comparePromptVersions(id, before, after)));

  return 0;
}

try {
  process.exitCode = main(process.argv.slice(2));
} catch (error: unknown) {
  // A version the registry does not hold, in the main case. The code and the
  // reference are what the failure carries (§7); the stack is noise here.
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
