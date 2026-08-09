/**
 * Extracting the source text out of an uploaded `.txt`, `.md` or `.docx` file
 * (CAL-047).
 *
 * This is the only module in the package that touches an untrusted byte
 * buffer, so it is also the only one with something to refuse: an unsupported
 * extension, an oversized upload, or a `.docx` that mammoth cannot parse. Each
 * refusal is a `Result` rather than a throw — an upload can always be wrong in
 * a way the interface layer must show the author, never a bug in the code
 * (CLAUDE.md §7).
 *
 * `.docx` is the only format needing a library: mammoth's `extractRawText`
 * already discards the OOXML markup and returns paragraph-broken plain text.
 * `.txt` and `.md` need only be decoded as UTF-8. Every format is then handed
 * to `cleanExtractedText` (`./clean.ts`) before being returned — extraction
 * never returns raw, unclean text.
 */

import mammoth from "mammoth";

import { ValidationError } from "../errors/app-error";
import { fail, type Result, succeed } from "../errors/result";
import { cleanExtractedText } from "./clean";

export const IMPORTABLE_SOURCE_TEXT_EXTENSIONS = ["txt", "md", "docx"] as const;

export type ImportableSourceTextExtension = (typeof IMPORTABLE_SOURCE_TEXT_EXTENSIONS)[number];

/**
 * Well past what a 2 000-word manuscript can weigh in any of the three
 * formats — this guards against an oversized upload before it is parsed, not
 * against a legitimate source text.
 */
export const MAX_SOURCE_TEXT_IMPORT_BYTES = 5 * 1024 * 1024;

export interface SourceTextFileInput {
  readonly filename: string;
  readonly buffer: Buffer;
}

export interface ExtractedSourceText {
  /** Extracted and cleaned — ready for `normalizeText`/`measureSourceText`. */
  readonly content: string;
}

/** The lowercased extension, or `null` when it is missing or unsupported. */
export function importableExtensionOf(filename: string): ImportableSourceTextExtension | null {
  const match = /\.([a-z0-9]+)$/iu.exec(filename);
  const extension = match?.[1]?.toLowerCase();

  return extension !== undefined && isImportableExtension(extension) ? extension : null;
}

function isImportableExtension(value: string): value is ImportableSourceTextExtension {
  return (IMPORTABLE_SOURCE_TEXT_EXTENSIONS as readonly string[]).includes(value);
}

/**
 * Extracts and cleans the text of an uploaded file. Never returns a text over
 * the word limit silently accepted: the limit itself is enforced downstream,
 * by the same `measureSourceText`/`sourceTextLimitMessage` pair every other
 * entry point uses (`@calepin/shared/text`), so it is not duplicated here.
 */
export async function extractSourceTextFromFile(
  input: SourceTextFileInput,
): Promise<Result<ExtractedSourceText>> {
  const extension = importableExtensionOf(input.filename);

  if (extension === null) {
    return fail(
      new ValidationError({
        code: "SOURCE_TEXT_IMPORT_UNSUPPORTED_FORMAT",
        message: "uploaded file has no supported extension",
        userMessage: "Formats acceptés : .txt, .md ou .docx.",
        fieldPath: "file",
      }),
    );
  }

  if (input.buffer.byteLength > MAX_SOURCE_TEXT_IMPORT_BYTES) {
    return fail(
      new ValidationError({
        code: "SOURCE_TEXT_IMPORT_UNREADABLE",
        message: "uploaded file exceeds the import size limit",
        userMessage: "Le fichier est trop volumineux (5 Mo maximum).",
        fieldPath: "file",
      }),
    );
  }

  const raw = await extractRawText(extension, input.buffer);
  if (!raw.ok) return raw;

  return succeed({ content: cleanExtractedText(raw.value, { markdown: extension === "md" }) });
}

async function extractRawText(
  extension: ImportableSourceTextExtension,
  buffer: Buffer,
): Promise<Result<string>> {
  if (extension !== "docx") {
    return succeed(buffer.toString("utf-8"));
  }

  try {
    const { value } = await mammoth.extractRawText({ buffer });
    return succeed(value);
  } catch (cause) {
    return fail(
      new ValidationError({
        code: "SOURCE_TEXT_IMPORT_UNREADABLE",
        message: "docx extraction failed",
        userMessage: "Ce fichier .docx est illisible ou corrompu.",
        fieldPath: "file",
        cause,
      }),
    );
  }
}
