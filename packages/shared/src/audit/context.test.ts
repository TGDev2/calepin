import { describe, expect, it, vi } from "vitest";

import { getAuditContext, getContextActorId, runWithActor } from "./context";

describe("actor scope", () => {
  it("has no actor outside any scope", () => {
    expect(getContextActorId()).toBeUndefined();
    expect(getAuditContext()).toBeUndefined();
  });

  it("credits the actor inside the scope", () => {
    runWithActor("usr_1", () => {
      expect(getContextActorId()).toBe("usr_1");
    });
  });

  it("follows the scope across awaits — the reason it is not a parameter", async () => {
    await runWithActor("usr_1", async () => {
      await Promise.resolve();
      expect(getContextActorId()).toBe("usr_1");
    });
  });

  it("nests, so a job started inside a request can name its own actor", () => {
    runWithActor("usr_outer", () => {
      runWithActor("usr_inner", () => {
        expect(getContextActorId()).toBe("usr_inner");
      });

      expect(getContextActorId()).toBe("usr_outer");
    });
  });

  it("does not leak after the scope closes", () => {
    runWithActor("usr_1", () => getContextActorId());

    expect(getContextActorId()).toBeUndefined();
  });

  /**
   * The bundle-split hazard, reproduced in one process (CAL-035).
   *
   * `vi.resetModules()` makes the next import build a genuinely second copy of
   * this module — the same thing `apps/web` does when it compiles
   * `packages/*` from source into more than one chunk graph, with
   * `runWithActor` called from a server action and the audit extension built at
   * boot from `instrumentation.ts`. With a module-level `AsyncLocalStorage` the
   * two copies each get their own store, the extension sees no actor, and every
   * audited write from a server action is refused with `AUDIT_ACTOR_REQUIRED`.
   * That is not hypothetical: it is how the first one ever written failed.
   */
  it("shares one store across two copies of this module", async () => {
    vi.resetModules();
    const secondCopy = await import("./context");

    expect(secondCopy.runWithActor).not.toBe(runWithActor);

    const seenByTheOtherCopy = runWithActor("usr_1", () => secondCopy.getContextActorId());
    const seenByThisCopy = secondCopy.runWithActor("usr_2", () => getContextActorId());

    expect(seenByTheOtherCopy).toBe("usr_1");
    expect(seenByThisCopy).toBe("usr_2");
  });

  it("keeps two concurrent scopes apart", async () => {
    const seen = await Promise.all([
      runWithActor("usr_a", async () => {
        await new Promise((resolve) => setTimeout(resolve, 5));
        return getContextActorId();
      }),
      runWithActor("usr_b", async () => getContextActorId()),
    ]);

    expect(seen).toEqual(["usr_a", "usr_b"]);
  });
});
