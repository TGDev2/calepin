/**
 * Event names.
 *
 * The field allowlist (`./fields`) protects the second argument of a log call.
 * Nothing would protect the first one, and `logger.info(chapter.title)` is as
 * much of a leak as `logger.info("x", { chapter })`. So the message is not free
 * text either: it is an event name, and an event name has a shape.
 *
 * Lowercase segments separated by dots or hyphens — `app.started`,
 * `generation.failed`, `log.invalid-event`. A sentence, a title or an excerpt
 * cannot match: they carry spaces, capitals or punctuation.
 */

const EVENT_NAME_PATTERN = /^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/;
const EVENT_NAME_MAX_LENGTH = 64;

/**
 * Emitted in place of any message that is not a valid event name. Replacing
 * rather than throwing is deliberate: a bad event name must never be able to
 * take a production process down, and it must never be echoed either — so the
 * offending string is dropped, not reported.
 */
export const INVALID_EVENT_NAME = "log.invalid-event";

export function isValidEventName(event: string): boolean {
  return (
    typeof event === "string" &&
    event.length > 0 &&
    event.length <= EVENT_NAME_MAX_LENGTH &&
    EVENT_NAME_PATTERN.test(event)
  );
}

export function toEventName(event: string): string {
  return isValidEventName(event) ? event : INVALID_EVENT_NAME;
}
