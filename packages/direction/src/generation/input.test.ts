import { describe, expect, it } from "vitest";

import { proposeDirectionsAsk, proposeDirectionsInputSchema } from "./input";

describe("proposeDirectionsInputSchema", () => {
  it("names the source text version and nothing else", () => {
    expect(proposeDirectionsInputSchema.parse({ sourceTextVersionId: "version-1" })).toEqual({
      sourceTextVersionId: "version-1",
    });
  });

  // Strict, because the digest of this payload decides when two requests are
  // the same request: an extra field silently carried would make an ask
  // different from an identical one.
  it("refuses a field nobody declared", () => {
    expect(
      proposeDirectionsInputSchema.safeParse({
        sourceTextVersionId: "version-1",
        freedomLevel: "HIGH",
      }).success,
    ).toBe(false);
  });

  it("refuses an empty version", () => {
    expect(proposeDirectionsInputSchema.safeParse({ sourceTextVersionId: "" }).success).toBe(false);
  });
});

describe("proposeDirectionsAsk", () => {
  it("mints the payload a generation is reserved with", () => {
    expect(proposeDirectionsAsk("version-1")).toEqual({ sourceTextVersionId: "version-1" });
  });

  it("mints something the schema accepts", () => {
    expect(proposeDirectionsInputSchema.safeParse(proposeDirectionsAsk("version-1")).success).toBe(
      true,
    );
  });
});
