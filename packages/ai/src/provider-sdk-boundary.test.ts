/**
 * CAL-048's acceptance criterion: **no business code imports a provider SDK,
 * and a lint rule guarantees it.** A lint rule that stops firing fails
 * silently — a config reorganised, a glob narrowed, an override that forgot
 * to repeat a pattern (ESLint replaces rule options, it never merges them) —
 * so the rule is executed here against the real repository configuration,
 * the way `data-access-boundary.test.ts` already executes CAL-023's.
 *
 * The package list is discovered, never written down: a package added by any
 * later task is covered the moment it exists.
 */

import { readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { ESLint } from "eslint";
import { beforeAll, describe, expect, it } from "vitest";

const REPO_ROOT = fileURLToPath(new URL("../../..", import.meta.url));

/** Every spelling of "give me a provider SDK" a call site could reach for. */
const SDK_IMPORTS = [
  'import Anthropic from "@anthropic-ai/sdk";',
  'import OpenAI from "openai";',
  'import { GoogleGenAI } from "@google/genai";',
  'import { generateText } from "ai";',
  'import { anthropic } from "@ai-sdk/anthropic";',
  'import { AnthropicBedrockMantle } from "@anthropic-ai/bedrock-sdk";',
];

/**
 * The one place a provider SDK may live (CLAUDE.md §5, ADR-001) — a directory,
 * not a file, and CAL-050 is what made that distinction load-bearing: the
 * second adapter and the translation the two share sit beside the first.
 */
const ADAPTER_HOMES = [
  "packages/ai/src/adapters/anthropic.ts",
  "packages/ai/src/adapters/bedrock.ts",
  "packages/ai/src/adapters/messages.ts",
];

const packageEntryPoints = readdirSync(join(REPO_ROOT, "packages"), { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => `packages/${entry.name}/src/index.ts`)
  .sort();

/**
 * Fixed representative locations on top of the discovered entry points: the
 * app, the AI layer's own pipeline (guarded — only `adapters/` is not), a
 * deep domain path that does not exist yet, the scripts and the test trees.
 */
const GUARDED = [
  ...packageEntryPoints,
  "apps/web/src/app/page.tsx",
  "apps/web/src/lib/current-user.ts",
  "packages/ai/src/create-model-port.ts",
  "packages/manuscript/src/write/scene.ts",
  "prisma/seed.ts",
  "test/integration/generation-pipeline.integration.test.ts",
];

describe("the provider-SDK boundary", () => {
  let eslint: ESLint;

  beforeAll(() => {
    // The real configuration, resolved exactly as `pnpm lint` resolves it.
    eslint = new ESLint({ cwd: REPO_ROOT });
  });

  async function restrictedImportsAt(path: string, source: string): Promise<string[]> {
    const [result] = await eslint.lintText(`${source}\nexport {};\n`, {
      filePath: join(REPO_ROOT, path),
    });

    return (result?.messages ?? [])
      .filter((message) => message.ruleId === "no-restricted-imports")
      .map((message) => message.message);
  }

  it("discovers the packages at all", () => {
    expect(packageEntryPoints.length).toBeGreaterThanOrEqual(9);
    expect(packageEntryPoints).toContain("packages/ai/src/index.ts");
  });

  it.each(GUARDED)(
    "refuses every provider SDK in %s",
    async (path) => {
      expect(await restrictedImportsAt(path, SDK_IMPORTS.join("\n"))).toHaveLength(
        SDK_IMPORTS.length,
      );
    },
    15_000,
  );

  it.each(ADAPTER_HOMES)(
    "lets %s — and only the adapters — hold an SDK",
    async (home) => {
      expect(await restrictedImportsAt(home, SDK_IMPORTS.join("\n"))).toEqual([]);
    },
    15_000,
  );

  // §3.2 in the same breath: the AI layer knows nothing about narrative
  // meaning, so a domain import is refused everywhere in it — the adapter
  // carve-out included — while @calepin/shared stays importable.
  it("keeps the AI layer out of the domains, adapters included", async () => {
    const domainImport = 'import { anything } from "@calepin/bible";';

    expect(
      await restrictedImportsAt("packages/ai/src/mission-registry.ts", domainImport),
    ).toHaveLength(1);

    for (const home of ADAPTER_HOMES) {
      expect(await restrictedImportsAt(home, domainImport)).toHaveLength(1);
    }
  }, 15_000);

  it("leaves @calepin/shared importable from the AI layer", async () => {
    const sharedImport = 'import { fail } from "@calepin/shared/errors";';

    expect(await restrictedImportsAt("packages/ai/src/port.ts", sharedImport)).toEqual([]);

    for (const home of ADAPTER_HOMES) {
      expect(await restrictedImportsAt(home, sharedImport)).toEqual([]);
    }
  }, 15_000);

  /**
   * The other direction of the same rule, and the one that was quietly broken
   * until CAL-055 exercised it.
   *
   * `ai` — the Vercel SDK — is banned by name, and ESLint matches a `group`
   * entry with minimatch's `matchBase`, so a pattern with no slash is compared
   * against the *basename* of the specifier. `@calepin/ai`'s basename is `ai`,
   * so the rule refused this repository's own AI layer everywhere: in every
   * domain package, which §3.2 lets depend on it, and in `apps/web`, which may
   * depend on anything. No file had ever imported it, so nothing failed.
   *
   * A ban that also forbids the thing it exists to route callers *towards* is
   * worth a test of its own, because the next person to hit it will read the
   * message and conclude the architecture forbids the import.
   */
  it("still lets its callers reach @calepin/ai itself", async () => {
    const aiLayerImport = 'import { MISSION_IDS } from "@calepin/ai";';

    for (const path of [
      "packages/manuscript/src/index.ts",
      "packages/bible/src/index.ts",
      "packages/coherence/src/index.ts",
      "apps/web/src/lib/current-user.ts",
    ]) {
      expect(await restrictedImportsAt(path, aiLayerImport), path).toEqual([]);
    }
  }, 15_000);

  it("keeps refusing the Vercel SDK the bare name belongs to", async () => {
    for (const source of [
      'import { generateText } from "ai";',
      'import { tool } from "ai/tools";',
    ]) {
      expect(
        await restrictedImportsAt("packages/manuscript/src/index.ts", source),
        source,
      ).toHaveLength(1);
    }
  }, 15_000);
});
