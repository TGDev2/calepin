import { describe, expect, it } from "vitest";

import { unavailableQueueCancellation, unavailableStoragePurge } from "./ports";

/**
 * The stand-ins are the whole compliance argument for shipping CAL-031 before
 * the S3 client (CAL-165) and the worker (CAL-060) exist: a no-op would report
 * a purge it never performed, and no test could tell the difference. So the
 * behaviour under test is precisely the asymmetry — nothing to do succeeds,
 * something to do fails loudly.
 */
describe("the unavailable account-deletion ports", () => {
  it("purges an empty list of objects without complaining", async () => {
    await expect(unavailableStoragePurge.purgeObjects([])).resolves.toBe(0);
  });

  it("cancels an empty list of generations without complaining", async () => {
    await expect(unavailableQueueCancellation.cancelGenerations([])).resolves.toBe(0);
  });

  it("refuses to pretend it purged an object", async () => {
    await expect(unavailableStoragePurge.purgeObjects(["exports/one.md"])).rejects.toThrow(
      /composed no implementation/,
    );
  });

  it("refuses to pretend it cancelled a job", async () => {
    await expect(unavailableQueueCancellation.cancelGenerations(["gen-1"])).rejects.toThrow(
      /composed no implementation/,
    );
  });
});
