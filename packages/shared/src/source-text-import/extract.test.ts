import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  extractSourceTextFromFile,
  IMPORTABLE_SOURCE_TEXT_EXTENSIONS,
  importableExtensionOf,
  MAX_SOURCE_TEXT_IMPORT_BYTES,
} from "./extract";

/**
 * The three committed sample files under `./fixtures` (CLAUDE.md §8 — "tests
 * avec des fichiers d'exemple"). Each is synthetic and technical (§9): no
 * real prose, chosen only to exercise the artifacts a real import produces —
 * a byte-order mark, a run of spaces from justified text, an unconverted
 * dialogue dash, Markdown decoration, and a `.docx` built by hand so this
 * suite proves the pipeline against real OOXML rather than a mock.
 */
function fixtureBuffer(name: string): Buffer {
  return readFileSync(fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url)));
}

const EM_DASH = String.fromCodePoint(0x2014);

describe("importableExtensionOf", () => {
  it("recognizes the three supported extensions, case-insensitively", () => {
    expect(importableExtensionOf("roman.txt")).toBe("txt");
    expect(importableExtensionOf("roman.MD")).toBe("md");
    expect(importableExtensionOf("roman.Docx")).toBe("docx");
  });

  it("refuses an unsupported or missing extension", () => {
    expect(importableExtensionOf("roman.pdf")).toBeNull();
    expect(importableExtensionOf("roman")).toBeNull();
  });
});

describe("extractSourceTextFromFile", () => {
  it("extracts and cleans a .txt file — BOM, spacing artifacts, dialogue dashes", async () => {
    const result = await extractSourceTextFromFile({
      filename: "sample.txt",
      buffer: fixtureBuffer("sample.txt"),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.content).toBe(
      [
        "Alpha beta gamma.",
        "",
        `${EM_DASH} Bonjour, dit-il.`,
        `${EM_DASH} Bonsoir, repondit-elle.`,
        "",
        "Fin.",
      ].join("\n"),
    );
  });

  it("extracts and cleans a .md file — headings, emphasis, a link, a rule, dialogue", async () => {
    const result = await extractSourceTextFromFile({
      filename: "sample.md",
      buffer: fixtureBuffer("sample.md"),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.content).toBe(
      [
        "Chapitre premier",
        "",
        "Alpha rencontre beta un jour de pluie.",
        "",
        `${EM_DASH} Bonjour, dit-il.`,
        "",
        "Une liste qui n'a rien a faire ici.",
        "",
        "Fin.",
      ].join("\n"),
    );
  });

  it("extracts and cleans a .docx file — no XML residue, no doubled spaces", async () => {
    const result = await extractSourceTextFromFile({
      filename: "sample.docx",
      buffer: fixtureBuffer("sample.docx"),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.content).toBe(
      ["Alpha beta gamma.", "", `${EM_DASH} Bonjour, dit-il.`, "", "Fin."].join("\n"),
    );
    expect(result.value.content).not.toMatch(/<w:/u);
    expect(result.value.content).not.toMatch(/ {2,}/u);
  });

  it("refuses a file whose extension is not .txt, .md or .docx", async () => {
    const result = await extractSourceTextFromFile({
      filename: "roman.pdf",
      buffer: Buffer.from("whatever", "utf-8"),
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("SOURCE_TEXT_IMPORT_UNSUPPORTED_FORMAT");
    expect(result.error.userMessage).toContain(".docx");
  });

  it("refuses a file over the size guard before attempting to parse it", async () => {
    const result = await extractSourceTextFromFile({
      filename: "roman.txt",
      buffer: Buffer.alloc(MAX_SOURCE_TEXT_IMPORT_BYTES + 1),
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("SOURCE_TEXT_IMPORT_UNREADABLE");
  });

  it("accepts a file exactly at the size guard", async () => {
    const result = await extractSourceTextFromFile({
      filename: "roman.txt",
      buffer: Buffer.alloc(MAX_SOURCE_TEXT_IMPORT_BYTES, "a"),
    });

    expect(result.ok).toBe(true);
  });

  it("refuses a .docx that mammoth cannot parse", async () => {
    const result = await extractSourceTextFromFile({
      filename: "roman.docx",
      buffer: Buffer.from("this is not a zip archive", "utf-8"),
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("SOURCE_TEXT_IMPORT_UNREADABLE");
  });
});

describe("IMPORTABLE_SOURCE_TEXT_EXTENSIONS", () => {
  it("is exactly the three formats this task adds", () => {
    expect(IMPORTABLE_SOURCE_TEXT_EXTENSIONS).toEqual(["txt", "md", "docx"]);
  });
});
