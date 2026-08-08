import { describe, expect, it } from "vitest";

import { matchesDeletionConfirmation } from "./confirmation";

const EMAIL = "marie.durand@example.test";

describe("the account deletion confirmation", () => {
  it("accepts the stored address typed exactly", () => {
    expect(matchesDeletionConfirmation(EMAIL, EMAIL)).toBe(true);
  });

  // The person who owns an address does not think of it as case-sensitive, and
  // refusing their own capitalisation only teaches them to distrust the form.
  it.each([
    ["a different case", "Marie.Durand@Example.Test"],
    ["surrounding whitespace", `  ${EMAIL}\n`],
    ["both at once", "  MARIE.DURAND@EXAMPLE.TEST  "],
  ])("accepts it with %s", (_label, typed) => {
    expect(matchesDeletionConfirmation(typed, EMAIL)).toBe(true);
  });

  it("matches a stored address that itself carries stray case or spacing", () => {
    expect(matchesDeletionConfirmation(EMAIL, " Marie.Durand@Example.Test ")).toBe(true);
  });

  // Every one of these is a way the irreversible button could be reached
  // without the visitor having stated which account they mean.
  it.each([
    ["an empty field", ""],
    ["whitespace only", "   "],
    ["another address", "marie.durand@example.org"],
    ["a prefix of the address", "marie.durand@example"],
    ["the address with something appended", `${EMAIL}x`],
    ["the local part alone", "marie.durand"],
  ])("refuses %s", (_label, typed) => {
    expect(matchesDeletionConfirmation(typed, EMAIL)).toBe(false);
  });

  // A blank field must confirm nothing, whatever the row looks like — without
  // the empty check, trimming both sides would make these two equal.
  it("refuses an empty field even against an empty stored address", () => {
    expect(matchesDeletionConfirmation("", "")).toBe(false);
    expect(matchesDeletionConfirmation("   ", "  ")).toBe(false);
  });
});
