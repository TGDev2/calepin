/**
 * What a finding points at, written so two checks can never collide (CAL-099).
 *
 * An anchor part is a row id behind the name of the thing it identifies. The
 * prefix is not decoration: the parts are sorted before they are hashed, so a
 * finding naming a character and an event would otherwise be indistinguishable
 * from one naming two events whose ids happen to sort the same way.
 *
 * `name` is the one part that is not an id — the undeclared-name check reports
 * about a word nobody declared, so the word *is* the identity. It is folded
 * before it goes in, so a difference of typography is not a second finding, and
 * it never leaves this package unhashed (§9).
 */

export function characterAnchor(id: string): string {
  return `character:${id}`;
}

export function placeAnchor(id: string): string {
  return `place:${id}`;
}

export function relationshipAnchor(id: string): string {
  return `relationship:${id}`;
}

export function timelineEventAnchor(id: string): string {
  return `event:${id}`;
}

export function canonFactAnchor(id: string): string {
  return `fact:${id}`;
}

export function worldRuleAnchor(id: string): string {
  return `rule:${id}`;
}

export function nameAnchor(foldedName: string): string {
  return `name:${foldedName}`;
}

/** The character's own age statement, which belongs to no event. */
export const CAST_AGE_ANCHOR = "statement:cast";
