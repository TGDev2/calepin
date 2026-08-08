import { describe, expect, it } from "vitest";

import { signInDestination } from "./sign-in-redirect";

describe("signInDestination", () => {
  it("encodes a bare path", () => {
    expect(signInDestination("/account")).toBe("/sign-in?callbackUrl=%2Faccount");
  });

  it("carries the query string along with the path", () => {
    expect(signInDestination("/account", "?tab=security")).toBe(
      "/sign-in?callbackUrl=%2Faccount%3Ftab%3Dsecurity",
    );
  });

  it("defaults to an empty search when none is given", () => {
    expect(signInDestination("/account")).toBe(signInDestination("/account", ""));
  });
});
