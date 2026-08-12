"use client";

/**
 * The sixteen own-row fields of a sheet, autosaved as the author types
 * (CAL-097).
 *
 * **Every field is uncontrolled** (`defaultValue`), `source-text-editor.tsx`'s
 * own reasoning: a controlled value is reset to its prop when React
 * hydrates, which would discard anything typed in the window before the
 * JavaScript arrives. A `ref` per field is read only when a save actually
 * fires — never on every keystroke — so nothing here re-renders while the
 * author types.
 *
 * **Every field's JSX is built inside `CharacterEditor` itself**, closing
 * over its `useRef`s rather than receiving them as a parameter: passing a
 * ref value across a function boundary is exactly what a ref can be read
 * from anywhere, which is the pattern the React compiler's own lint rule
 * refuses (`react-hooks/refs`, "passing a ref to a function may read its
 * value during render"). A closure sidesteps the question entirely — the
 * ref is never anything but a local variable of the component that owns it.
 *
 * **Autosave debounces on change, and there is a manual fallback.** A field
 * left alone for `SAVE_DEBOUNCE_MS` triggers a save built from every field's
 * current DOM value; the "Enregistrer maintenant" button runs the same
 * function immediately, for a person who does not want to wait or whose
 * change is small enough not to trigger an `onChange` at all (a `<select>`
 * does, so this is a courtesy rather than a gap). No generic reusable
 * autosave hook: this is scoped to one component, and CAL-117 is the future
 * task that generalises autosave *and* overwrite protection for the
 * manuscript editor — nothing here should pre-empt it.
 *
 * **The actions arrive as props**, never imported — the `"use server"` import
 * trap `tasks/lessons.md` records under CAL-039.
 *
 * **A locked field is `disabled`, and reading its ref still works.** A
 * disabled input is excluded from a `FormData`, but this component never
 * builds one — it reads `.value` straight off the DOM, which stays accurate
 * whether or not the field accepts input.
 */

import {
  CHARACTER_CHAR_CEILINGS,
  CHARACTER_EDIT_CHAR_CEILINGS,
  CHARACTER_IMPORTANCE_LABELS,
  CHARACTER_IMPORTANCES,
  CHARACTER_LABEL_CHAR_CEILING,
  type CharacterImportanceInput,
} from "@calepin/bible";
import { CHARACTER_LOCK_FIELD_LABELS, type CharacterLockField } from "@calepin/shared/bible-lock";
import type { CharacterEditSnapshot } from "@calepin/shared/repository";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import { LockBadge } from "@/components/lock-badge";
import {
  CHARACTER_FIELD_GROUPS,
  type CharacterFormSubmission,
  type CharacterLockActionState,
  type CharacterSaveState,
} from "@/lib/character-edit";

import styles from "./character-detail.module.css";

const SAVE_DEBOUNCE_MS = 1_500;

export type SaveCharacterAction = (
  projectId: string,
  characterId: string,
  submission: CharacterFormSubmission,
) => Promise<CharacterSaveState>;

export type CharacterLockAction = (
  projectId: string,
  characterId: string,
  field: CharacterLockField | null,
) => Promise<CharacterLockActionState>;

export interface CharacterEditorProps {
  readonly projectId: string;
  readonly characterId: string;
  readonly character: CharacterEditSnapshot;
  readonly saveAction: SaveCharacterAction;
  readonly lockAction: CharacterLockAction;
  readonly unlockAction: CharacterLockAction;
}

type SavePhase = "idle" | "pending" | "saving" | "saved" | "error";

function feedbackFor(phase: SavePhase, message: string | null): string | null {
  switch (phase) {
    case "idle":
      return null;
    case "pending":
      return "Modifications en attente…";
    case "saving":
      return "Enregistrement…";
    case "saved":
      return "Enregistré.";
    case "error":
      return message ?? "L'enregistrement a échoué.";
  }
}

export function CharacterEditor({
  projectId,
  characterId,
  character,
  saveAction,
  lockAction,
  unlockAction,
}: CharacterEditorProps) {
  const router = useRouter();

  const nameRef = useRef<HTMLInputElement>(null);
  const ageRef = useRef<HTMLInputElement>(null);
  const roleRef = useRef<HTMLInputElement>(null);
  const importanceRef = useRef<HTMLSelectElement>(null);
  const appearanceRef = useRef<HTMLTextAreaElement>(null);
  const initialSituationRef = useRef<HTMLTextAreaElement>(null);
  const apparentDesireRef = useRef<HTMLTextAreaElement>(null);
  const deepNeedRef = useRef<HTMLTextAreaElement>(null);
  const fearRef = useRef<HTMLTextAreaElement>(null);
  const contradictionRef = useRef<HTMLTextAreaElement>(null);
  const secretRef = useRef<HTMLTextAreaElement>(null);
  const pastRef = useRef<HTMLTextAreaElement>(null);
  const plannedArcRef = useRef<HTMLTextAreaElement>(null);
  const speechStyleRef = useRef<HTMLTextAreaElement>(null);
  const heldKnowledgeRef = useRef<HTMLTextAreaElement>(null);
  const elementsToPreserveRef = useRef<HTMLTextAreaElement>(null);

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [phase, setPhase] = useState<SavePhase>("idle");
  const [message, setMessage] = useState<string | null>(null);

  const rowLocked = character.lockedAt !== null;
  const lockedFields = new Set<CharacterLockField>(character.lockedFields);

  function isFieldLocked(field: CharacterLockField): boolean {
    return rowLocked || lockedFields.has(field);
  }

  function readList(value: string): string[] {
    return value.split("\n");
  }

  function buildSubmission(): CharacterFormSubmission {
    const ageText = ageRef.current?.value.trim() ?? "";

    return {
      name: nameRef.current?.value ?? "",
      age: ageText === "" ? null : Number(ageText),
      role: roleRef.current?.value ?? "",
      importance: importanceRef.current?.value ?? character.importance,
      appearance: appearanceRef.current?.value ?? "",
      initialSituation: initialSituationRef.current?.value ?? "",
      apparentDesire: apparentDesireRef.current?.value ?? "",
      deepNeed: deepNeedRef.current?.value ?? "",
      fear: fearRef.current?.value ?? "",
      contradiction: contradictionRef.current?.value ?? "",
      secret: secretRef.current?.value ?? "",
      past: pastRef.current?.value ?? "",
      plannedArc: plannedArcRef.current?.value ?? "",
      speechStyle: speechStyleRef.current?.value ?? "",
      heldKnowledge: readList(heldKnowledgeRef.current?.value ?? ""),
      elementsToPreserve: readList(elementsToPreserveRef.current?.value ?? ""),
    };
  }

  async function flush() {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    setPhase("saving");
    const result = await saveAction(projectId, characterId, buildSubmission());

    if (result.status === "error") {
      setPhase("error");
      setMessage(result.message);
      return;
    }

    setPhase("saved");
    setMessage(null);
    if (result.updated) router.refresh();
  }

  function scheduleSave() {
    setPhase("pending");
    if (timerRef.current !== null) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      void flush();
    }, SAVE_DEBOUNCE_MS);
  }

  /** One field's input, closing over its own ref rather than taking one as an argument — see the header. */
  function fieldInput(field: CharacterLockField): React.ReactNode {
    const id = `character-field-${field}`;
    const locked = isFieldLocked(field);

    switch (field) {
      case "NAME":
        return (
          <input
            id={id}
            ref={nameRef}
            type="text"
            required
            maxLength={CHARACTER_LABEL_CHAR_CEILING}
            defaultValue={character.name}
            disabled={locked}
            onChange={scheduleSave}
          />
        );
      case "AGE":
        return (
          <input
            id={id}
            ref={ageRef}
            type="number"
            min={0}
            step={1}
            defaultValue={character.age ?? ""}
            disabled={locked}
            onChange={scheduleSave}
          />
        );
      case "ROLE":
        return (
          <input
            id={id}
            ref={roleRef}
            type="text"
            maxLength={CHARACTER_LABEL_CHAR_CEILING}
            defaultValue={character.role ?? ""}
            disabled={locked}
            onChange={scheduleSave}
          />
        );
      case "IMPORTANCE":
        return (
          <select
            id={id}
            ref={importanceRef}
            defaultValue={character.importance}
            disabled={locked}
            onChange={scheduleSave}
          >
            {CHARACTER_IMPORTANCES.map((value: CharacterImportanceInput) => (
              <option key={value} value={value}>
                {CHARACTER_IMPORTANCE_LABELS[value]}
              </option>
            ))}
          </select>
        );
      case "APPEARANCE":
        return (
          <textarea
            id={id}
            ref={appearanceRef}
            rows={3}
            maxLength={CHARACTER_CHAR_CEILINGS.appearance}
            defaultValue={character.appearance ?? ""}
            disabled={locked}
            onChange={scheduleSave}
          />
        );
      case "INITIAL_SITUATION":
        return (
          <textarea
            id={id}
            ref={initialSituationRef}
            rows={3}
            maxLength={CHARACTER_CHAR_CEILINGS.initialSituation}
            defaultValue={character.initialSituation ?? ""}
            disabled={locked}
            onChange={scheduleSave}
          />
        );
      case "APPARENT_DESIRE":
        return (
          <textarea
            id={id}
            ref={apparentDesireRef}
            rows={3}
            maxLength={CHARACTER_CHAR_CEILINGS.apparentDesire}
            defaultValue={character.apparentDesire ?? ""}
            disabled={locked}
            onChange={scheduleSave}
          />
        );
      case "DEEP_NEED":
        return (
          <textarea
            id={id}
            ref={deepNeedRef}
            rows={3}
            maxLength={CHARACTER_EDIT_CHAR_CEILINGS.deepNeed}
            defaultValue={character.deepNeed ?? ""}
            disabled={locked}
            onChange={scheduleSave}
          />
        );
      case "FEAR":
        return (
          <textarea
            id={id}
            ref={fearRef}
            rows={3}
            maxLength={CHARACTER_CHAR_CEILINGS.fear}
            defaultValue={character.fear ?? ""}
            disabled={locked}
            onChange={scheduleSave}
          />
        );
      case "CONTRADICTION":
        return (
          <textarea
            id={id}
            ref={contradictionRef}
            rows={3}
            maxLength={CHARACTER_EDIT_CHAR_CEILINGS.contradiction}
            defaultValue={character.contradiction ?? ""}
            disabled={locked}
            onChange={scheduleSave}
          />
        );
      case "SECRET":
        return (
          <textarea
            id={id}
            ref={secretRef}
            rows={3}
            maxLength={CHARACTER_CHAR_CEILINGS.secret}
            defaultValue={character.secret ?? ""}
            disabled={locked}
            onChange={scheduleSave}
          />
        );
      case "PAST":
        return (
          <textarea
            id={id}
            ref={pastRef}
            rows={3}
            maxLength={CHARACTER_CHAR_CEILINGS.past}
            defaultValue={character.past ?? ""}
            disabled={locked}
            onChange={scheduleSave}
          />
        );
      case "PLANNED_ARC":
        return (
          <textarea
            id={id}
            ref={plannedArcRef}
            rows={3}
            maxLength={CHARACTER_CHAR_CEILINGS.plannedArc}
            defaultValue={character.plannedArc ?? ""}
            disabled={locked}
            onChange={scheduleSave}
          />
        );
      case "SPEECH_STYLE":
        return (
          <textarea
            id={id}
            ref={speechStyleRef}
            rows={3}
            maxLength={CHARACTER_EDIT_CHAR_CEILINGS.speechStyle}
            defaultValue={character.speechStyle ?? ""}
            disabled={locked}
            onChange={scheduleSave}
          />
        );
      case "HELD_KNOWLEDGE":
        return (
          <textarea
            id={id}
            ref={heldKnowledgeRef}
            rows={4}
            defaultValue={character.heldKnowledge.join("\n")}
            disabled={locked}
            onChange={scheduleSave}
          />
        );
      case "ELEMENTS_TO_PRESERVE":
        return (
          <textarea
            id={id}
            ref={elementsToPreserveRef}
            rows={4}
            defaultValue={character.elementsToPreserve.join("\n")}
            disabled={locked}
            onChange={scheduleSave}
          />
        );
    }
  }

  const feedback = feedbackFor(phase, message);

  return (
    <section className={styles.editor} aria-labelledby="sheet-heading">
      <div className={styles.sectionHead}>
        <h2 className={styles.sectionTitle} id="sheet-heading">
          Fiche
        </h2>
        <RowLockControl
          projectId={projectId}
          characterId={characterId}
          locked={rowLocked}
          lockAction={lockAction}
          unlockAction={unlockAction}
          onDone={() => router.refresh()}
        />
      </div>

      <div className={styles.saveBar} role="status">
        {feedback === null ? null : (
          <span className={phase === "error" ? styles.saveError : styles.saveStatus}>
            {feedback}
          </span>
        )}
        <button type="button" className={styles.saveNow} onClick={() => void flush()}>
          Enregistrer maintenant
        </button>
      </div>

      {CHARACTER_FIELD_GROUPS.map((group) => (
        <fieldset key={group.title} className={styles.group}>
          <legend className={styles.groupTitle}>{group.title}</legend>

          {group.fields.map((field) => (
            <SheetField
              key={field}
              field={field}
              projectId={projectId}
              characterId={characterId}
              locked={isFieldLocked(field)}
              rowLocked={rowLocked}
              lockAction={lockAction}
              unlockAction={unlockAction}
              onLockChanged={() => router.refresh()}
            >
              {fieldInput(field)}
            </SheetField>
          ))}
        </fieldset>
      ))}
    </section>
  );
}

interface SheetFieldProps {
  readonly field: CharacterLockField;
  readonly projectId: string;
  readonly characterId: string;
  readonly locked: boolean;
  readonly rowLocked: boolean;
  readonly lockAction: CharacterLockAction;
  readonly unlockAction: CharacterLockAction;
  readonly onLockChanged: () => void;
  readonly children: React.ReactNode;
}

function SheetField({
  field,
  projectId,
  characterId,
  locked,
  rowLocked,
  lockAction,
  unlockAction,
  onLockChanged,
  children,
}: SheetFieldProps) {
  const id = `character-field-${field}`;

  return (
    <p className={styles.field}>
      <span className={styles.fieldHead}>
        <label htmlFor={id}>{CHARACTER_LOCK_FIELD_LABELS[field]}</label>
        {rowLocked ? null : (
          <FieldLockControl
            projectId={projectId}
            characterId={characterId}
            field={field}
            locked={locked}
            lockAction={lockAction}
            unlockAction={unlockAction}
            onDone={onLockChanged}
          />
        )}
      </span>
      {children}
    </p>
  );
}

interface FieldLockControlProps {
  readonly projectId: string;
  readonly characterId: string;
  readonly field: CharacterLockField;
  readonly locked: boolean;
  readonly lockAction: CharacterLockAction;
  readonly unlockAction: CharacterLockAction;
  readonly onDone: () => void;
}

function FieldLockControl({
  projectId,
  characterId,
  field,
  locked,
  lockAction,
  unlockAction,
  onDone,
}: FieldLockControlProps) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    setPending(true);
    setError(null);

    const action = locked ? unlockAction : lockAction;
    const result = await action(projectId, characterId, field);

    setPending(false);

    if (result.status === "error") {
      setError(result.message);
      return;
    }

    onDone();
  }

  return (
    <span className={styles.lockControl}>
      {locked ? <LockBadge variant="locked" /> : null}
      <button type="button" onClick={() => void toggle()} disabled={pending} aria-busy={pending}>
        {locked ? "Déverrouiller" : "Verrouiller"}
      </button>
      {error === null ? null : (
        <span className={styles.lockError} role="alert">
          {error}
        </span>
      )}
    </span>
  );
}

interface RowLockControlProps {
  readonly projectId: string;
  readonly characterId: string;
  readonly locked: boolean;
  readonly lockAction: CharacterLockAction;
  readonly unlockAction: CharacterLockAction;
  readonly onDone: () => void;
}

function RowLockControl({
  projectId,
  characterId,
  locked,
  lockAction,
  unlockAction,
  onDone,
}: RowLockControlProps) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    setPending(true);
    setError(null);

    const action = locked ? unlockAction : lockAction;
    const result = await action(projectId, characterId, null);

    setPending(false);

    if (result.status === "error") {
      setError(result.message);
      return;
    }

    onDone();
  }

  return (
    <span className={styles.lockControl}>
      {locked ? <LockBadge variant="locked" /> : null}
      <button type="button" onClick={() => void toggle()} disabled={pending} aria-busy={pending}>
        {locked ? "Déverrouiller toute la fiche" : "Verrouiller toute la fiche"}
      </button>
      {error === null ? null : (
        <span className={styles.lockError} role="alert">
          {error}
        </span>
      )}
    </span>
  );
}
