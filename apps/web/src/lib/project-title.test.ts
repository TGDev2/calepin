import { describe, expect, it } from "vitest";

import {
  duplicatedProjectTitle,
  matchesProjectTitle,
  PROJECT_TITLE_MAX_LENGTH,
  readProjectTitle,
} from "./project-title";

describe("readProjectTitle", () => {
  it("accepts a title and trims it", () => {
    expect(readProjectTitle("  Le titre  ")).toBe("Le titre");
  });

  it("refuses an empty or blank field", () => {
    expect(readProjectTitle("")).toBeNull();
    expect(readProjectTitle("   ")).toBeNull();
  });

  it("refuses a field that is not a string at all", () => {
    // What `formData.get` answers for a file input, or for a name nobody sent.
    expect(readProjectTitle(null)).toBeNull();
    expect(readProjectTitle(undefined)).toBeNull();
  });

  it("refuses a title longer than the limit, and accepts one at it", () => {
    expect(readProjectTitle("t".repeat(PROJECT_TITLE_MAX_LENGTH))).toHaveLength(
      PROJECT_TITLE_MAX_LENGTH,
    );
    expect(readProjectTitle("t".repeat(PROJECT_TITLE_MAX_LENGTH + 1))).toBeNull();
  });
});

describe("duplicatedProjectTitle", () => {
  it("suffixes an ordinary title", () => {
    expect(duplicatedProjectTitle("Le manuscrit")).toBe("Le manuscrit (copie)");
  });

  it("numbers the copy of a copy rather than stacking suffixes", () => {
    expect(duplicatedProjectTitle("Le manuscrit (copie)")).toBe("Le manuscrit (copie 2)");
    expect(duplicatedProjectTitle("Le manuscrit (copie 2)")).toBe("Le manuscrit (copie 3)");
    expect(duplicatedProjectTitle("Le manuscrit (copie 9)")).toBe("Le manuscrit (copie 10)");
  });

  it("leaves a title that merely mentions a copy alone", () => {
    expect(duplicatedProjectTitle("La copie du roi")).toBe("La copie du roi (copie)");
  });

  it("keeps the result within the length the form accepts", () => {
    const long = "t".repeat(PROJECT_TITLE_MAX_LENGTH);

    const copy = duplicatedProjectTitle(long);

    expect(copy.length).toBeLessThanOrEqual(PROJECT_TITLE_MAX_LENGTH);
    expect(readProjectTitle(copy)).not.toBeNull();
  });
});

describe("matchesProjectTitle", () => {
  it("accepts the title, whatever the case and the surrounding spaces", () => {
    expect(matchesProjectTitle("  le MANUSCRIT ", "Le manuscrit")).toBe(true);
  });

  it("refuses anything else", () => {
    expect(matchesProjectTitle("Le manuscri", "Le manuscrit")).toBe(false);
    expect(matchesProjectTitle("", "Le manuscrit")).toBe(false);
    expect(matchesProjectTitle("   ", "Le manuscrit")).toBe(false);
    expect(matchesProjectTitle(null, "Le manuscrit")).toBe(false);
  });
});
