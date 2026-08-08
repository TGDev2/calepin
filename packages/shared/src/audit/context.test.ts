import { describe, expect, it } from "vitest";

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
