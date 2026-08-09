/**
 * The wizard's local draft (CAL-040) — the mechanism behind the task's own
 * acceptance criterion: a reload mid-entry loses nothing.
 *
 * The only file in this feature that touches `localStorage`. Everything else
 * — validation, option lists, the component itself — is either isomorphic or
 * server-only; keeping the storage read/write in one small module is what
 * makes the `typeof window === "undefined"` guard live in exactly one place
 * rather than scattered through the wizard component.
 *
 * `getDraftStorageSnapshot`/`getServerDraftStorageSnapshot`/
 * `subscribeToDraftStorage` are shaped for `useSyncExternalStore`
 * specifically: reading `localStorage` inside a plain mount `useEffect` and
 * calling `setState` from it is what this codebase's lint config (the React
 * Compiler `react-hooks` rules) flags as `set-state-in-effect`, and rightly
 * so here — `useSyncExternalStore` is the mechanism React ships for exactly
 * "read an external store, safely across the server/client hydration split."
 * There is no cross-tab synchronisation need for a single visitor filling in
 * one form, so `subscribeToDraftStorage` never actually calls back; the hook
 * is used purely for the safe one-time read after hydration.
 *
 * **`getDraftStorageSnapshot` caches its first real read and never re-reads
 * afterward.** The wizard itself writes to this same key on every keystroke
 * (`saveProjectCreationDraft`), and a snapshot getter that re-read the live
 * value on every call would see its own writes as "the external store
 * changed" — which makes `useSyncExternalStore` re-fire the restore-from-draft
 * branch mid-session and snap the step back to whatever was last flushed to
 * storage. Caching after the first read is what keeps the hook doing exactly
 * one thing: hand back the pre-hydration value once, then get out of the way.
 */

import {
  EMPTY_PROJECT_CREATION_DRAFT,
  PROJECT_CREATION_STEPS,
  type ProjectCreationDraft,
  type ProjectCreationStep,
} from "./project-creation";

const DRAFT_STORAGE_KEY = "calepin:project-creation-draft";

/**
 * Never a real stored value (JSON never produces this exact string), so it's
 * distinguishable from "hydrated, but nothing was saved yet" (`""`).
 */
const SERVER_SNAPSHOT = "__calepin_project_creation_draft_server__";

export interface StoredProjectCreationDraft {
  readonly draft: ProjectCreationDraft;
  readonly step: ProjectCreationStep;
  /**
   * Whether the visitor has picked the language by hand (CAL-042) — persisted
   * so a reload cannot make the detected proposal override a manual choice.
   * Optional for backward compatibility with a draft saved before this field
   * existed.
   */
  readonly languageTouched?: boolean;
}

export function subscribeToDraftStorage(): () => void {
  return () => {};
}

export function getServerDraftStorageSnapshot(): string {
  return SERVER_SNAPSHOT;
}

let cachedClientSnapshot: string | undefined;

export function getDraftStorageSnapshot(): string {
  if (typeof window === "undefined") return SERVER_SNAPSHOT;

  if (cachedClientSnapshot === undefined) {
    cachedClientSnapshot = window.localStorage.getItem(DRAFT_STORAGE_KEY) ?? "";
  }

  return cachedClientSnapshot;
}

/** The draft and the step it was left on, or `null` for "nothing to resume" — including the server snapshot. */
export function parseStoredDraft(raw: string): StoredProjectCreationDraft | null {
  if (raw === "" || raw === SERVER_SNAPSHOT) return null;

  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return null;

    const { draft, step, languageTouched } = parsed as Partial<StoredProjectCreationDraft>;
    if (typeof draft !== "object" || draft === null) return null;
    if (typeof step !== "string" || !PROJECT_CREATION_STEPS.includes(step as ProjectCreationStep)) {
      return null;
    }

    // Spread onto the current default shape rather than trusting the stored
    // object as-is: a draft saved before a field was added or renamed would
    // otherwise reach the wizard with a hole a required field can't have.
    return {
      draft: { ...EMPTY_PROJECT_CREATION_DRAFT, ...draft },
      step: step as ProjectCreationStep,
      languageTouched: languageTouched === true,
    };
  } catch {
    // A corrupted or hand-edited entry is the same as no draft at all — never
    // a reason to fail the page it would otherwise quietly restore.
    return null;
  }
}

export function saveProjectCreationDraft(
  draft: ProjectCreationDraft,
  step: ProjectCreationStep,
  languageTouched: boolean,
): void {
  if (typeof window === "undefined") return;

  window.localStorage.setItem(
    DRAFT_STORAGE_KEY,
    JSON.stringify({ draft, step, languageTouched } satisfies StoredProjectCreationDraft),
  );
}

export function clearProjectCreationDraft(): void {
  if (typeof window === "undefined") return;

  window.localStorage.removeItem(DRAFT_STORAGE_KEY);
}
