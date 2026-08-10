import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { MODEL_CAPABILITIES, MODEL_IDS } from "./capabilities";
import {
  BENCH_JUDGE,
  DOMAIN_PACKAGES,
  MISSION_REGISTRY,
  type MissionDefinition,
} from "./mission-registry";
import { MISSION_IDS } from "./missions";

describe("the mission registry", () => {
  it("declares every mission, and nothing else", () => {
    expect(Object.keys(MISSION_REGISTRY).sort()).toEqual([...MISSION_IDS].sort());
  });

  it.each(MISSION_IDS)("%s is a coherent declaration", (missionId) => {
    // Widened to the declared shape: the literal table narrows every field.
    const mission: MissionDefinition = MISSION_REGISTRY[missionId];
    const primary = MODEL_CAPABILITIES[mission.model];
    const backup = MODEL_CAPABILITIES[mission.fallbackModel];

    expect(mission.id).toBe(missionId);

    // A backup identical to the primary is no backup at all — and a backup
    // behind the same endpoint, the same key and the same outage is no better
    // (CAL-050). Failover is only failover across providers.
    expect(mission.fallbackModel).not.toBe(mission.model);
    expect(backup.provider).not.toBe(primary.provider);

    // Parameters within what both models will accept, since either may serve.
    expect(mission.maxOutputTokens).toBeGreaterThan(0);
    expect(mission.maxOutputTokens).toBeLessThanOrEqual(primary.maxOutputTokens);
    expect(mission.maxOutputTokens).toBeLessThanOrEqual(backup.maxOutputTokens);
    expect(mission.timeoutMs).toBeGreaterThan(0);
    expect(primary.supportsEffort).toBe(true);
    expect(backup.supportsEffort).toBe(true);

    // The output kind CAL-051 declares: a structured mission can only route to
    // models that constrain their answer to a schema, and it names the package
    // that owns that schema — a reference, never a copy (§5.5).
    if (mission.output.kind === "structured") {
      expect(primary.supportsStructuredOutput).toBe(true);
      expect(backup.supportsStructuredOutput).toBe(true);
      expect(DOMAIN_PACKAGES).toContain(mission.output.schemaOwner);
    }
  });

  it.each(MISSION_IDS)("%s expects a cost it also permits", (missionId) => {
    const mission: MissionDefinition = MISSION_REGISTRY[missionId];
    const smallestWindow = Math.min(
      MODEL_CAPABILITIES[mission.model].contextWindowTokens,
      MODEL_CAPABILITIES[mission.fallbackModel].contextWindowTokens,
    );

    expect(mission.contextBudgetTokens).toBeGreaterThan(0);
    expect(mission.expectedUsage.inputTokens).toBeGreaterThan(0);
    expect(mission.expectedUsage.outputTokens).toBeGreaterThan(0);

    // The forecast has to fit inside the ceilings declared beside it, or the
    // entry expects more than it allows and one of the two numbers is wrong.
    expect(mission.expectedUsage.inputTokens).toBeLessThanOrEqual(mission.contextBudgetTokens);
    expect(mission.expectedUsage.outputTokens).toBeLessThanOrEqual(mission.maxOutputTokens);

    // Prompt and answer share one window, on whichever model serves. This
    // holds trivially today and is the assertion that fires the day a mission
    // routes to a model with a smaller one.
    expect(mission.contextBudgetTokens + mission.maxOutputTokens).toBeLessThanOrEqual(
      smallestWindow,
    );
  });

  it.each(MISSION_IDS)("%s expects a duration it is also allowed (CAL-057)", (missionId) => {
    const mission: MissionDefinition = MISSION_REGISTRY[missionId];

    expect(Number.isInteger(mission.expectedDurationMs)).toBe(true);
    expect(mission.expectedDurationMs).toBeGreaterThan(0);

    // A mission expected to take longer than its own deadline is a mission
    // expected to fail. The forecast is of the normal path; `timeoutMs` is the
    // point past which there is no longer a normal path.
    expect(mission.expectedDurationMs).toBeLessThan(mission.timeoutMs);
  });

  // §5.4: never one general-purpose prompt. The registry being total over
  // `MissionId` is what makes that structural — a mission cannot be served
  // without a declaration of its own, so there is no shared default to fall
  // back to and no entry that covers two missions at once.
  it("gives each mission its own entry, tuned per mission", () => {
    const entries = Object.values(MISSION_REGISTRY);

    expect(entries).toHaveLength(MISSION_IDS.length);
    expect(new Set(entries.map((mission) => mission.id)).size).toBe(MISSION_IDS.length);
    expect(new Set(entries.map((mission) => mission.model)).size).toBeGreaterThan(1);
    expect(new Set(entries.map((mission) => mission.effort)).size).toBeGreaterThan(1);
  });
});

describe("the bench judge (CAL-059)", () => {
  it("is a coherent declaration its model can serve", () => {
    const capability = MODEL_CAPABILITIES[BENCH_JUDGE.model];

    // The judge's answers are structured contracts, under `effort` — a model
    // that supports neither cannot judge.
    expect(capability.supportsStructuredOutput).toBe(true);
    expect(capability.supportsEffort).toBe(true);

    expect(BENCH_JUDGE.maxOutputTokens).toBeGreaterThan(0);
    expect(BENCH_JUDGE.maxOutputTokens).toBeLessThanOrEqual(capability.maxOutputTokens);
    expect(BENCH_JUDGE.timeoutMs).toBeGreaterThan(0);
  });
});

/**
 * CAL-051's acceptance criterion: **changing the model behind a mission is an
 * edit to one file, and no calling code moves.**
 *
 * The only way to prove that is to look everywhere else. A model id naming
 * itself anywhere but the capability sheet and the registry is a second place
 * a model change would have to be made — and the one that would be forgotten.
 */
const REPO_ROOT = fileURLToPath(new URL("../../..", import.meta.url));

/** Where calling code lives: every package's sources, and the app's. */
const SEARCHED_ROOTS = [
  ...readdirSync(join(REPO_ROOT, "packages"), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => join("packages", entry.name, "src")),
  join("apps", "web", "src"),
];

/**
 * The three files that may name a model, and one test double.
 *
 * `pricing.ts` (CAL-056) is the tariff table, keyed by model exactly as
 * `capabilities.ts`'s capability sheet is — a third declared-per-model
 * registry, not a caller naming a model of its own choosing.
 *
 * `adapters/simulated.ts` fakes a provider's response, and a provider's
 * response names the model that served it. It lives under `src/` rather than
 * beside a test only because the lint boundary keeps SDK types inside
 * `adapters/` (CAL-050); nothing outside a test imports it.
 */
const MODEL_ID_HOMES = [
  join("packages", "ai", "src", "capabilities.ts"),
  join("packages", "ai", "src", "mission-registry.ts"),
  join("packages", "ai", "src", "pricing.ts"),
  join("packages", "ai", "src", "adapters", "simulated.ts"),
];

function sourceFilesUnder(root: string): string[] {
  const absolute = join(REPO_ROOT, root);
  const found: string[] = [];

  for (const entry of readdirSync(absolute, { withFileTypes: true, recursive: true })) {
    const name = entry.name;

    if (!entry.isFile() || !/\.tsx?$/.test(name) || /\.test\.tsx?$/.test(name)) {
      continue;
    }

    found.push(relative(REPO_ROOT, join(entry.parentPath, name)));
  }

  return found;
}

describe("the one file a model change touches", () => {
  const searched = SEARCHED_ROOTS.flatMap(sourceFilesUnder);

  it("searches the workspace it claims to search", () => {
    expect(searched.length).toBeGreaterThan(100);
    expect(searched).toContain(join("packages", "ai", "src", "create-model-port.ts"));
    expect(searched).toContain(join("apps", "web", "src", "lib", "current-user.ts"));
  });

  it("finds no model id outside the capability sheet and the registry", () => {
    const naming = searched.filter((path) => {
      const source = readFileSync(join(REPO_ROOT, path), "utf8");

      return MODEL_IDS.some((modelId) => source.includes(modelId));
    });

    expect(naming.sort()).toEqual([...MODEL_ID_HOMES].sort());
  });
});
