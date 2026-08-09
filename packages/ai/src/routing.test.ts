import { describe, expect, it } from "vitest";

import { MODEL_CAPABILITIES } from "./capabilities";
import { MISSION_IDS } from "./missions";
import { MISSION_MODEL_ROUTING, type MissionRouting } from "./routing";

describe("the mission model routing", () => {
  it("routes every mission, and nothing else", () => {
    expect(Object.keys(MISSION_MODEL_ROUTING).sort()).toEqual([...MISSION_IDS].sort());
  });

  it.each(MISSION_IDS)("%s is a coherent route", (missionId) => {
    // Widened to the declared shape: the literal table omits optional fields.
    const route: MissionRouting = MISSION_MODEL_ROUTING[missionId];
    const primary = MODEL_CAPABILITIES[route.model];
    const backup = MODEL_CAPABILITIES[route.fallbackModel];

    // A backup identical to the primary is no backup at all — and a backup
    // behind the same endpoint, the same key and the same outage is no better
    // (CAL-050). Failover is only failover across providers.
    expect(route.fallbackModel).not.toBe(route.model);
    expect(backup.provider).not.toBe(primary.provider);

    expect(route.maxOutputTokens).toBeGreaterThan(0);
    expect(route.maxOutputTokens).toBeLessThanOrEqual(primary.maxOutputTokens);
    expect(route.maxOutputTokens).toBeLessThanOrEqual(backup.maxOutputTokens);

    expect(route.timeoutMs).toBeGreaterThan(0);

    // Until CAL-051 declares each mission's output kind, every routed model
    // must be able to serve a structured call — the stricter of the two.
    expect(primary.supportsStructuredOutput).toBe(true);
    expect(backup.supportsStructuredOutput).toBe(true);

    if (route.effort !== undefined) {
      expect(primary.supportsEffort).toBe(true);
      expect(backup.supportsEffort).toBe(true);
    }
  });
});
