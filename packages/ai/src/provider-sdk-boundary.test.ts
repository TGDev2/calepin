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
];

/** The one place a provider SDK may live (CLAUDE.md §5, ADR-001). */
const ADAPTER_HOME = "packages/ai/src/adapters/anthropic.ts";

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

  it("lets the adapters — and only the adapters — hold an SDK", async () => {
    expect(await restrictedImportsAt(ADAPTER_HOME, SDK_IMPORTS.join("\n"))).toEqual([]);
  }, 15_000);

  // §3.2 in the same breath: the AI layer knows nothing about narrative
  // meaning, so a domain import is refused everywhere in it — the adapter
  // carve-out included — while @calepin/shared stays importable.
  it("keeps the AI layer out of the domains, adapters included", async () => {
    const domainImport = 'import { anything } from "@calepin/bible";';

    expect(await restrictedImportsAt("packages/ai/src/routing.ts", domainImport)).toHaveLength(1);
    expect(await restrictedImportsAt(ADAPTER_HOME, domainImport)).toHaveLength(1);
  }, 15_000);

  it("leaves @calepin/shared importable from the AI layer", async () => {
    const sharedImport = 'import { fail } from "@calepin/shared/errors";';

    expect(await restrictedImportsAt("packages/ai/src/port.ts", sharedImport)).toEqual([]);
    expect(await restrictedImportsAt(ADAPTER_HOME, sharedImport)).toEqual([]);
  }, 15_000);
});
