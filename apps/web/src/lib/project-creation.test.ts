import {
  FRENCH_WORD_COUNT_CORPUS,
  FRENCH_WORD_COUNT_CORPUS_WORDS,
  measureSourceText,
} from "@calepin/shared/text";
import { describe, expect, it } from "vitest";

import {
  draftFromFormData,
  EMPTY_PROJECT_CREATION_DRAFT,
  OTHER_OPTION_VALUE,
  type ProjectCreationDraft,
  SOURCE_TEXT_MAX_WORDS,
  validateProjectCreationDraft,
} from "./project-creation";
import { PROJECT_TITLE_MAX_LENGTH } from "./project-title";

function validDraft(overrides: Partial<ProjectCreationDraft> = {}): ProjectCreationDraft {
  return {
    ...EMPTY_PROJECT_CREATION_DRAFT,
    title: "Le Roman de Test",
    sourceText: "alpha beta gamma delta epsilon",
    language: "fr",
    targetLength: "STANDARD",
    targetAudience: "Grand public",
    freedomLevel: "BALANCED",
    ...overrides,
  };
}

describe("validateProjectCreationDraft", () => {
  it("accepts a fully valid draft and resolves it to createProjectWithSourceText's input shape", () => {
    const result = validateProjectCreationDraft(validDraft());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual({
      title: "Le Roman de Test",
      // No `wordCount`: the repository derives it, so nothing here states it
      // and nothing here can state it wrongly (CAL-041).
      sourceText: { content: "alpha beta gamma delta epsilon" },
      language: "fr",
      targetLength: "STANDARD",
      targetWordCount: null,
      targetAudience: "Grand public",
      freedomLevel: "BALANCED",
    });
  });

  it("rejects a blank title", () => {
    const result = validateProjectCreationDraft(validDraft({ title: "   " }));

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.title).toBeDefined();
  });

  it("rejects a title over the shared length limit", () => {
    const result = validateProjectCreationDraft(
      validDraft({ title: "a".repeat(PROJECT_TITLE_MAX_LENGTH + 1) }),
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.title).toBeDefined();
  });

  it("rejects an empty source text", () => {
    const result = validateProjectCreationDraft(validDraft({ sourceText: "   " }));

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.sourceText).toBeDefined();
  });

  it("rejects a source text over the 2000-word limit", () => {
    const overLimit = Array.from({ length: SOURCE_TEXT_MAX_WORDS + 1 }, () => "mot").join(" ");
    const result = validateProjectCreationDraft(validDraft({ sourceText: overLimit }));

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.sourceText).toContain(String(SOURCE_TEXT_MAX_WORDS));
  });

  it("accepts a source text at exactly the 2000-word limit", () => {
    const atLimit = Array.from({ length: SOURCE_TEXT_MAX_WORDS }, () => "mot").join(" ");
    const result = validateProjectCreationDraft(validDraft({ sourceText: atLimit }));

    expect(result.ok).toBe(true);
  });

  it("counts the source text the way the counter and the repository do", () => {
    // The shared corpus, so this cannot drift from what the browser displays
    // (`source-text-counter.test.tsx`) or from what the server stores
    // (`word-count-parity.test.ts`, `word-count.spec.ts`).
    const result = validateProjectCreationDraft(
      validDraft({ sourceText: FRENCH_WORD_COUNT_CORPUS }),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(measureSourceText(result.value.sourceText.content).wordCount).toBe(
      FRENCH_WORD_COUNT_CORPUS_WORDS,
    );
  });

  it("normalizes the source text once, so what is stored is what was counted", () => {
    // A form submission delivers a textarea with CRLF line endings; the
    // counter measured the `\n` the visitor typed. One string reaches the
    // repository, or the column disagrees with the number beside it.
    const result = validateProjectCreationDraft(
      validDraft({ sourceText: "  alpha\r\nbeta\r\n\r\ngamma  " }),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.sourceText.content).toBe("alpha\nbeta\n\ngamma");
  });

  it("rejects a source text that holds only punctuation", () => {
    // Zero words is empty, whatever the character count says.
    const result = validateProjectCreationDraft(validDraft({ sourceText: "... — «» !" }));

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.sourceText).toBe("Le texte source ne peut pas être vide.");
  });

  it("rejects a CUSTOM target length with no positive word count", () => {
    for (const targetWordCount of ["", "0", "-5", "not-a-number"]) {
      const result = validateProjectCreationDraft(
        validDraft({ targetLength: "CUSTOM", targetWordCount }),
      );

      expect(result.ok).toBe(false);
      if (result.ok) continue;
      expect(result.errors.targetLength).toBeDefined();
    }
  });

  it("accepts a CUSTOM target length with a positive word count and carries it through", () => {
    const result = validateProjectCreationDraft(
      validDraft({ targetLength: "CUSTOM", targetWordCount: "95000" }),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.targetLength).toBe("CUSTOM");
    expect(result.value.targetWordCount).toBe(95_000);
  });

  it("ignores a stray target word count on a non-CUSTOM length", () => {
    const result = validateProjectCreationDraft(
      validDraft({ targetLength: "SHORT", targetWordCount: "12345" }),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.targetWordCount).toBeNull();
  });

  it("rejects an unrecognised target length", () => {
    const result = validateProjectCreationDraft(validDraft({ targetLength: "EPIC" }));

    expect(result.ok).toBe(false);
  });

  it("requires the free-text language when 'Autre' is chosen, and resolves it", () => {
    const blank = validateProjectCreationDraft(
      validDraft({ language: OTHER_OPTION_VALUE, languageOther: "  " }),
    );
    expect(blank.ok).toBe(false);

    const filled = validateProjectCreationDraft(
      validDraft({ language: OTHER_OPTION_VALUE, languageOther: "Occitan" }),
    );
    expect(filled.ok).toBe(true);
    if (!filled.ok) return;
    expect(filled.value.language).toBe("Occitan");
  });

  it("requires the free-text audience when 'Autre' is chosen, and resolves it", () => {
    const blank = validateProjectCreationDraft(
      validDraft({ targetAudience: OTHER_OPTION_VALUE, targetAudienceOther: "" }),
    );
    expect(blank.ok).toBe(false);

    const filled = validateProjectCreationDraft(
      validDraft({ targetAudience: OTHER_OPTION_VALUE, targetAudienceOther: "Amateurs de polar" }),
    );
    expect(filled.ok).toBe(true);
    if (!filled.ok) return;
    expect(filled.value.targetAudience).toBe("Amateurs de polar");
  });

  it("rejects an unrecognised freedom level", () => {
    const result = validateProjectCreationDraft(validDraft({ freedomLevel: "EXTREME" }));

    expect(result.ok).toBe(false);
  });
});

describe("draftFromFormData", () => {
  it("reads every field present in the form data", () => {
    const formData = new FormData();
    formData.set("title", "Mon roman");
    formData.set("sourceText", "un texte");
    formData.set("language", "en");
    formData.set("languageOther", "");
    formData.set("targetLength", "CUSTOM");
    formData.set("targetWordCount", "70000");
    formData.set("targetAudience", "Adultes");
    formData.set("targetAudienceOther", "");
    formData.set("freedomLevel", "HIGH");

    expect(draftFromFormData(formData)).toEqual({
      title: "Mon roman",
      sourceText: "un texte",
      language: "en",
      languageOther: "",
      targetLength: "CUSTOM",
      targetWordCount: "70000",
      targetAudience: "Adultes",
      targetAudienceOther: "",
      freedomLevel: "HIGH",
    });
  });

  it("falls back to the empty draft's defaults for a field missing from the form data", () => {
    const formData = new FormData();
    formData.set("title", "Mon roman");

    expect(draftFromFormData(formData)).toEqual({
      ...EMPTY_PROJECT_CREATION_DRAFT,
      title: "Mon roman",
    });
  });
});
