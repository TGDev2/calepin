import { describe, expect, it } from "vitest";

import {
  ACKNOWLEDGE_FIELD,
  DIRECTION_CANONICAL_UNAVAILABLE_MESSAGE,
  INITIAL_DIRECTION_CANONICAL_STATE,
  readAcknowledgement,
} from "./direction-canonical";

describe("readAcknowledgement", () => {
  // A browser posts a checkbox only when it is ticked, so absence is the
  // answer "no" and there is nothing else to read.
  it("reads an unticked checkbox as no acknowledgement", () => {
    expect(readAcknowledgement(null)).toBe(false);
    expect(readAcknowledgement(undefined)).toBe(false);
    expect(readAcknowledgement("")).toBe(false);
  });

  it("reads whatever value a ticked checkbox posts as an acknowledgement", () => {
    expect(readAcknowledgement("yes")).toBe(true);
    expect(readAcknowledgement("on")).toBe(true);
  });

  // A `File` is what a multipart form sends for a file input; nothing here
  // treats a non-string as a yes.
  it("refuses a value that is not a posted string", () => {
    expect(readAcknowledgement(new Blob())).toBe(false);
    expect(readAcknowledgement(1)).toBe(false);
    expect(readAcknowledgement(true)).toBe(false);
  });
});

describe("the form's own copy", () => {
  it("starts with nothing to say", () => {
    expect(INITIAL_DIRECTION_CANONICAL_STATE).toEqual({ status: "idle" });
  });

  // §7: the author sees a French sentence, and one that says the project is
  // intact — a failed choice must never read as a project that moved halfway.
  it("says the project is intact when the write could not happen", () => {
    expect(DIRECTION_CANONICAL_UNAVAILABLE_MESSAGE).toContain("intact");
  });

  it("names the field the repository's acknowledgement gate reads", () => {
    expect(ACKNOWLEDGE_FIELD).toBe("acknowledgeObsolescence");
  });
});
