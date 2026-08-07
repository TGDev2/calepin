/**
 * The log field allowlist.
 *
 * CLAUDE.md §9 forbids literary content in every technical artefact and names
 * the mechanism: an allowlist, not a redaction filter. The distinction is the
 * whole point of this file. A filter walks the caller's object and removes the
 * keys someone remembered to name; an allowlist walks a fixed list of keys and
 * ignores everything else, so a field nobody anticipated cannot survive.
 *
 * Every key below is an identifier, a count, a duration or a classification.
 * None of them can hold prose.
 */

export interface LogFields {
  /** Trace root: one per HTTP request, one per generation started off-request. */
  correlationId?: string;
  requestId?: string;
  userId?: string;

  projectId?: string;
  generationId?: string;
  revisionId?: string;
  chapterId?: string;
  jobId?: string;

  missionId?: string;
  promptVersion?: number;
  provider?: string;
  model?: string;
  inputTokens?: number;
  outputTokens?: number;

  durationMs?: number;
  attempt?: number;

  httpMethod?: string;
  httpPath?: string;
  httpStatus?: number;

  errorCode?: string;
  errorCategory?: string;
  errorName?: string;
  errorStack?: string;
  /**
   * The path of the field that failed validation — never its value
   * (CLAUDE.md §6). `errorMessage` is deliberately absent from this list: a
   * message routinely quotes the value that made it fail.
   */
  fieldPath?: string;

  wordCount?: number;
  byteCount?: number;
  itemCount?: number;
}

/**
 * `satisfies` does the bookkeeping in both directions: a key added to
 * `LogFields` and forgotten here is a missing-property error, and a key added
 * here that `LogFields` does not declare is an excess-property error. The
 * allowlist cannot silently drift from the type that documents it.
 */
const LOG_FIELD_ALLOWLIST = {
  correlationId: true,
  requestId: true,
  userId: true,
  projectId: true,
  generationId: true,
  revisionId: true,
  chapterId: true,
  jobId: true,
  missionId: true,
  promptVersion: true,
  provider: true,
  model: true,
  inputTokens: true,
  outputTokens: true,
  durationMs: true,
  attempt: true,
  httpMethod: true,
  httpPath: true,
  httpStatus: true,
  errorCode: true,
  errorCategory: true,
  errorName: true,
  errorStack: true,
  fieldPath: true,
  wordCount: true,
  byteCount: true,
  itemCount: true,
} satisfies Record<keyof LogFields, true>;

export const LOG_FIELD_KEYS = Object.keys(LOG_FIELD_ALLOWLIST) as ReadonlyArray<keyof LogFields>;

/**
 * Keeps only allowlisted keys holding a primitive value, and masks credentials
 * inside the strings that survive.
 *
 * The loop is over `LOG_FIELD_KEYS`, never over `Object.keys(fields)` — that
 * is what makes an unanticipated key impossible rather than merely unlikely.
 * Non-primitive values are dropped even under an allowlisted key: an object
 * would be serialised whole, which is exactly the `logger.info(entity)` shape
 * §9 rules out.
 */
export function pickLogFields(
  fields: LogFields | undefined,
  redactValue: (value: string) => string = (value) => value,
): LogFields {
  if (fields === undefined || fields === null) {
    return {};
  }

  const source = fields as Record<string, unknown>;
  const picked: Record<string, string | number | boolean> = {};

  for (const key of LOG_FIELD_KEYS) {
    const value = source[key];

    if (typeof value === "string") {
      picked[key] = redactValue(value);
    } else if (typeof value === "number") {
      if (Number.isFinite(value)) {
        picked[key] = value;
      }
    } else if (typeof value === "boolean") {
      picked[key] = value;
    }
  }

  return picked as LogFields;
}
