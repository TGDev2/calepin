import { describe, expect, it } from "vitest";

import {
  INITIAL_SOURCE_TEXT_EDIT_STATE,
  readSourceTextContent,
  SOURCE_TEXT_EDIT_UNAVAILABLE_MESSAGE,
} from "./source-text-edit";

describe("readSourceTextContent", () => {
  it("keeps a real text exactly as it was posted", () => {
    // Not trimmed here on purpose: the repository normalizes the string it
    // stores, and a second trim on this side would make the two disagree about
    // what was saved the moment either one changes.
    const posted = "  Premier paragraphe.\n\nSecond paragraphe.  ";

    expect(readSourceTextContent(posted)).toBe(posted);
  });

  it("refuses a field that holds nothing but whitespace", () => {
    expect(readSourceTextContent("")).toBeNull();
    expect(readSourceTextContent("   \n\t  ")).toBeNull();
  });

  it("refuses anything that is not a string", () => {
    // `FormData.get` answers `null` for a missing field and a `File` for an
    // upload; neither is a text, and neither may reach the repository.
    expect(readSourceTextContent(null)).toBeNull();
    expect(readSourceTextContent(undefined)).toBeNull();
    expect(readSourceTextContent(42)).toBeNull();
    expect(readSourceTextContent({ content: "x" })).toBeNull();
  });
});

describe("the editor's state", () => {
  it("starts idle, so nothing is announced before anything is submitted", () => {
    expect(INITIAL_SOURCE_TEXT_EDIT_STATE).toEqual({ status: "idle" });
  });

  it("promises the previous version is intact when a save fails", () => {
    // The load-bearing half of the sentence: this screen's whole contract is
    // that nothing is destroyed, so a failure has to say so.
    expect(SOURCE_TEXT_EDIT_UNAVAILABLE_MESSAGE).toContain("intacte");
  });
});
