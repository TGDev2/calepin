import { afterEach, describe, expect, it } from "vitest";

import { getDatabaseClient, resetDatabaseClient } from "./client";

describe("the database seam", () => {
  afterEach(() => {
    resetDatabaseClient();
  });

  // A repository reached before the shell registered a client is mis-wired, and
  // the failure has to say so. The alternative — a lazily self-constructing
  // client — would connect a unit test to whatever DATABASE_URL happened to be
  // in the environment.
  it("refuses to hand out a client no process registered", () => {
    expect(() => getDatabaseClient()).toThrowError(
      expect.objectContaining({ code: "DATABASE_NOT_CONFIGURED", category: "internal" }),
    );
  });

  it("still refuses after a reset", () => {
    resetDatabaseClient();

    expect(() => getDatabaseClient()).toThrowError(
      expect.objectContaining({ code: "DATABASE_NOT_CONFIGURED" }),
    );
  });
});
