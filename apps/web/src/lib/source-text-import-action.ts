"use server";

/**
 * Extracting a source text from an uploaded `.txt`, `.md` or `.docx` file
 * (CAL-047).
 *
 * It composes and nothing more, the same discipline `source-text/actions.ts`
 * follows: the session says who is asking, and `extractSourceTextFromFile`
 * (`@calepin/shared/source-text-import`) does the extraction and the cleanup.
 * This action never writes anything — the extracted text is handed back for
 * the caller to drop into the field it already had, review and, eventually,
 * submit through the existing wizard or editor action. The 2 000-word limit
 * is therefore never re-checked here: `measureSourceText`/`updateSourceText`/
 * `createProjectWithSourceText` already refuse an over-limit text before any
 * write, for every caller including this one.
 *
 * A plain function, not bound to a `<form>` — the wizard's own form already
 * carries the draft, and a nested `<form>` is invalid HTML — so
 * `<SourceTextFileImport>` calls it directly from a file input's `onChange`.
 */

import { errorLogFields } from "@calepin/shared/errors";
import { logger } from "@calepin/shared/logging";
import { extractSourceTextFromFile } from "@calepin/shared/source-text-import";

import { getCurrentUser } from "@/lib/current-user";
import { withRequestLogContext } from "@/lib/request-context";
import {
  readImportedFile,
  SOURCE_TEXT_IMPORT_NO_FILE_MESSAGE,
  SOURCE_TEXT_IMPORT_UNAVAILABLE_MESSAGE,
  type SourceTextImportResult,
} from "@/lib/source-text-import";

export async function importSourceTextFileAction(
  formData: FormData,
): Promise<SourceTextImportResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, message: SOURCE_TEXT_IMPORT_UNAVAILABLE_MESSAGE };

  const file = readImportedFile(formData);
  if (file === null) return { ok: false, message: SOURCE_TEXT_IMPORT_NO_FILE_MESSAGE };

  return withRequestLogContext(async () => {
    try {
      const buffer = Buffer.from(await file.arrayBuffer());
      const extracted = await extractSourceTextFromFile({ filename: file.name, buffer });

      if (!extracted.ok) {
        logger.warn("source-text.import-refused", {
          userId: user.id,
          byteCount: buffer.byteLength,
          ...errorLogFields(extracted.error),
        });

        return { ok: false, message: extracted.error.userMessage };
      }

      logger.info("source-text.imported", { userId: user.id, byteCount: buffer.byteLength });

      return { ok: true, content: extracted.value.content };
    } catch (error: unknown) {
      logger.error("source-text.import-failed", { userId: user.id, ...errorLogFields(error) });

      return { ok: false, message: SOURCE_TEXT_IMPORT_UNAVAILABLE_MESSAGE };
    }
  });
}
