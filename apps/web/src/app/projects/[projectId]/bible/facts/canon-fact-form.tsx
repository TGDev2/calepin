"use client";

/**
 * The one form a canonical fact is written with, in four guided blocks
 * (CAL-098).
 *
 * **The data model is not on screen.** A fact carries three independent
 * dimensions and a shape that decides which of six bound columns may be set;
 * what the author reads is *ce qui est vrai dans le roman*, *quand*, *qui le
 * sait* and *ce que ce fait concerne*. No column, no enum member, no
 * *booléen* — the acceptance criterion is that the specification's own example
 * takes under a minute, and every word of jargon on screen is a question the
 * author has to stop and answer.
 *
 * **Progressive disclosure is real disclosure.** The bounds and the ending
 * event are mounted only under the shape that uses them, so an unread block is
 * not submitted either — which is exactly what `readCanonFactSubmission`
 * assumes. Three radios, one visible sub-block, nothing carried from a closed
 * one.
 *
 * **Every field is uncontrolled** (`defaultValue`, `defaultChecked`). The value
 * is the author's, not the component's, and a controlled field inside a
 * server-rendered page discards everything typed before React hydrates. The
 * only state here is display state: which temporal shape is open, and whether
 * the statement is true — the second because the third block shows what each
 * stance *amounts to*, and that reading flips with it.
 *
 * **The action arrives as a prop**, never imported. Importing a `"use server"`
 * module from a client component pulls its whole transitive graph into the
 * client bundle, which in this repository reaches `@/lib/auth` and validates
 * the environment at import time (CAL-039's lesson).
 */

import type { CanonFactBeliefState, CanonFactValidity } from "@calepin/bible";
import { useActionState, useId, useState } from "react";

import { SubmitButton } from "@/components/submit-button";
import {
  BELIEF_FIELD_PREFIX,
  type CanonFactFormState,
  describeStance,
  INITIAL_CANON_FACT_FORM_STATE,
  STANCE_UNSET_LABEL,
} from "@/lib/canon-fact-edit";

import styles from "./canon-fact-form.module.css";

export type CanonFactAction = (
  previous: CanonFactFormState,
  formData: FormData,
) => Promise<CanonFactFormState>;

export interface NamedRow {
  readonly id: string;
  readonly name: string;
}

export interface PrecisionOption {
  readonly value: string;
  readonly label: string;
}

export interface StanceOption {
  readonly value: CanonFactBeliefState;
  readonly label: string;
}

export interface CanonFactBoundDefaults {
  readonly day: number | null;
  readonly precision: string | null;
  readonly label: string | null;
}

export interface CanonFactDefaults {
  readonly statement: string;
  readonly isTrue: boolean;
  readonly validity: CanonFactValidity;
  readonly validFrom: CanonFactBoundDefaults | null;
  readonly validUntil: CanonFactBoundDefaults | null;
  readonly invalidatedByEventId: string | null;
  /** One entry per character who already holds a stance. */
  readonly stances: Readonly<Record<string, CanonFactBeliefState>>;
  readonly subjectCharacterIds: readonly string[];
  readonly subjectPlaceIds: readonly string[];
}

export const EMPTY_CANON_FACT: CanonFactDefaults = {
  statement: "",
  isTrue: true,
  validity: "PERMANENT",
  validFrom: null,
  validUntil: null,
  invalidatedByEventId: null,
  stances: {},
  subjectCharacterIds: [],
  subjectPlaceIds: [],
};

/** What the author reads beside each of the three temporal shapes. */
const SHAPES: readonly { readonly value: CanonFactValidity; readonly label: string }[] = [
  { value: "PERMANENT", label: "toujours vrai, du début à la fin" },
  { value: "DURING_PERIOD", label: "vrai seulement pendant un certain temps" },
  { value: "UNTIL_EVENT", label: "vrai, puis faux après un événement" },
];

export interface CanonFactFormProps {
  readonly projectId: string;
  /** Absent when the form adds a fact rather than rewriting one. */
  readonly factId?: string;
  readonly cast: readonly NamedRow[];
  readonly places: readonly NamedRow[];
  readonly events: readonly NamedRow[];
  readonly precisions: readonly PrecisionOption[];
  readonly stances: readonly StanceOption[];
  readonly statementCeiling: number;
  readonly boundLabelCeiling: number;
  readonly defaults: CanonFactDefaults;
  readonly submitLabel: string;
  readonly action: CanonFactAction;
}

export function CanonFactForm({
  projectId,
  factId,
  cast,
  places,
  events,
  precisions,
  stances,
  statementCeiling,
  boundLabelCeiling,
  defaults,
  submitLabel,
  action,
}: CanonFactFormProps) {
  const [state, submit] = useActionState(action, INITIAL_CANON_FACT_FORM_STATE);
  const prefix = useId();

  const [shape, setShape] = useState<CanonFactValidity>(defaults.validity);
  const [isTrue, setIsTrue] = useState(defaults.isTrue);

  return (
    <form className={styles.form} action={submit}>
      <input type="hidden" name="projectId" value={projectId} />
      {factId === undefined ? null : <input type="hidden" name="factId" value={factId} />}

      <fieldset className={styles.block}>
        <legend className={styles.legend}>Ce qui est vrai dans le roman</legend>

        <p className={styles.field}>
          <label htmlFor={`${prefix}-statement`}>Le fait, en une phrase</label>
          <textarea
            id={`${prefix}-statement`}
            name="statement"
            rows={2}
            required
            maxLength={statementCeiling}
            defaultValue={defaults.statement}
            placeholder="Le père de Nora est vivant."
          />
          <span className={styles.hint}>
            Une seule idée, à l&rsquo;affirmative. Ce qu&rsquo;un personnage en croit se dit plus
            bas — écrivez <em>le père de Nora est vivant</em>, pas <em>Nora ignore que…</em>
          </span>
        </p>

        <fieldset className={styles.choices}>
          <legend className={styles.choicesLegend}>Dans le roman, cet énoncé est&nbsp;:</legend>

          <label className={styles.choice}>
            <input
              type="radio"
              name="isTrue"
              value="true"
              defaultChecked={defaults.isTrue}
              onChange={() => {
                setIsTrue(true);
              }}
            />{" "}
            vrai
          </label>

          <label className={styles.choice}>
            <input
              type="radio"
              name="isTrue"
              value="false"
              defaultChecked={!defaults.isTrue}
              onChange={() => {
                setIsTrue(false);
              }}
            />{" "}
            faux
          </label>

          <span className={styles.hint}>
            Un énoncé faux reste utile&nbsp;: c&rsquo;est ainsi qu&rsquo;une rumeur entre dans la
            bible sans y entrer comme vérité.
          </span>
        </fieldset>
      </fieldset>

      <fieldset className={styles.block}>
        <legend className={styles.legend}>Quand</legend>

        <div className={styles.choices}>
          {SHAPES.map((option) => (
            <label key={option.value} className={styles.choice}>
              <input
                type="radio"
                name="validity"
                value={option.value}
                defaultChecked={defaults.validity === option.value}
                onChange={() => {
                  setShape(option.value);
                }}
              />{" "}
              {option.label}
            </label>
          ))}
        </div>

        {shape === "DURING_PERIOD" ? (
          <div className={styles.subBlock}>
            <BoundFields
              idPrefix={`${prefix}-from`}
              name="validFrom"
              legend="Depuis"
              placeholder="l'accident de novembre 1998"
              precisions={precisions}
              boundLabelCeiling={boundLabelCeiling}
              defaults={defaults.validFrom}
            />
            <BoundFields
              idPrefix={`${prefix}-until`}
              name="validUntil"
              legend="Jusqu'à"
              placeholder="le retour de Claire"
              precisions={precisions}
              boundLabelCeiling={boundLabelCeiling}
              defaults={defaults.validUntil}
            />
            <p className={styles.hint}>
              Un seul des deux repères suffit. Vos propres mots suffisent aussi&nbsp;: le nombre de
              jours n&rsquo;est utile que si vous voulez que le contrôle de cohérence puisse situer
              ce fait tout seul.
            </p>
          </div>
        ) : null}

        {shape === "UNTIL_EVENT" ? (
          <div className={styles.subBlock}>
            {events.length === 0 ? (
              <p className={styles.hint}>
                Votre chronologie ne contient encore aucun événement&nbsp;: ajoutez-en un avant de
                dire qu&rsquo;un fait cesse d&rsquo;être vrai.
              </p>
            ) : (
              <p className={styles.field}>
                <label htmlFor={`${prefix}-event`}>À partir de</label>
                <select
                  id={`${prefix}-event`}
                  name="invalidatedByEventId"
                  defaultValue={defaults.invalidatedByEventId ?? events[0]?.id}
                >
                  {events.map((event) => (
                    <option key={event.id} value={event.id}>
                      {event.name}
                    </option>
                  ))}
                </select>
              </p>
            )}
          </div>
        ) : null}
      </fieldset>

      <fieldset className={styles.block}>
        <legend className={styles.legend}>Qui le sait</legend>

        {cast.length === 0 ? (
          <p className={styles.hint}>
            Cette bible ne compte encore aucun personnage&nbsp;: personne ne peut donc savoir quoi
            que ce soit.
          </p>
        ) : (
          <>
            <p className={styles.hint}>
              Laissez <em>{STANCE_UNSET_LABEL}</em> tant que vous n&rsquo;avez pas tranché. Dire
              qu&rsquo;un personnage ignore la question est une décision&nbsp;; ne rien dire n&rsquo;en
              est pas une.
            </p>

            <ul className={styles.stances}>
              {cast.map((member) => (
                <li key={member.id} className={styles.stance}>
                  <fieldset className={styles.stanceFields}>
                    <legend className={styles.stanceName}>{member.name}</legend>

                    <label className={styles.choice}>
                      <input
                        type="radio"
                        name={`${BELIEF_FIELD_PREFIX}${member.id}`}
                        value=""
                        defaultChecked={defaults.stances[member.id] === undefined}
                      />{" "}
                      {STANCE_UNSET_LABEL}
                    </label>

                    {stances.map((option) => (
                      <label key={option.value} className={styles.choice}>
                        <input
                          type="radio"
                          name={`${BELIEF_FIELD_PREFIX}${member.id}`}
                          value={option.value}
                          defaultChecked={defaults.stances[member.id] === option.value}
                        />{" "}
                        {option.label}{" "}
                        <span className={styles.consequence}>
                          — {describeStance(isTrue, option.value)}
                        </span>
                      </label>
                    ))}
                  </fieldset>
                </li>
              ))}
            </ul>
          </>
        )}
      </fieldset>

      {cast.length === 0 && places.length === 0 ? null : (
        <fieldset className={styles.block}>
          <legend className={styles.legend}>Ce que ce fait concerne</legend>

          <div className={styles.subjects}>
            {cast.map((member) => (
              <label key={member.id} className={styles.choice}>
                <input
                  type="checkbox"
                  name="subjectCharacter"
                  value={member.id}
                  defaultChecked={defaults.subjectCharacterIds.includes(member.id)}
                />{" "}
                {member.name}
              </label>
            ))}

            {places.map((place) => (
              <label key={place.id} className={styles.choice}>
                <input
                  type="checkbox"
                  name="subjectPlace"
                  value={place.id}
                  defaultChecked={defaults.subjectPlaceIds.includes(place.id)}
                />{" "}
                {place.name}
              </label>
            ))}
          </div>

          <p className={styles.hint}>
            Cochez ce dont le fait <em>parle</em>. C&rsquo;est ce qui le fera remonter quand vous
            écrirez une scène avec ce personnage ou dans ce lieu.
          </p>
        </fieldset>
      )}

      {state.status === "error" ? (
        <p className={styles.error} role="alert">
          {state.message}
        </p>
      ) : null}

      <SubmitButton pendingLabel="Enregistrement…">{submitLabel}</SubmitButton>
    </form>
  );
}

interface BoundFieldsProps {
  readonly idPrefix: string;
  readonly name: "validFrom" | "validUntil";
  readonly legend: string;
  readonly placeholder: string;
  readonly precisions: readonly PrecisionOption[];
  readonly boundLabelCeiling: number;
  readonly defaults: CanonFactBoundDefaults | null;
}

/**
 * One end of a period: the author's own wording first, the day second.
 *
 * That order is the decision. The column accepts a bound stated in words alone,
 * and an author writing *depuis l'accident de novembre 1998* does not hold a day
 * offset — asking for the number first would make the specification's own third
 * example feel like a form to fight.
 */
function BoundFields({
  idPrefix,
  name,
  legend,
  placeholder,
  precisions,
  boundLabelCeiling,
  defaults,
}: BoundFieldsProps) {
  return (
    <fieldset className={styles.bound}>
      <legend className={styles.boundLegend}>{legend}</legend>

      <p className={styles.field}>
        <label htmlFor={`${idPrefix}-label`}>En vos mots</label>
        <input
          id={`${idPrefix}-label`}
          name={`${name}Label`}
          type="text"
          maxLength={boundLabelCeiling}
          defaultValue={defaults?.label ?? ""}
          placeholder={placeholder}
        />
      </p>

      <p className={styles.field}>
        <label htmlFor={`${idPrefix}-day`}>Jour, compté depuis l&rsquo;ouverture</label>
        <input
          id={`${idPrefix}-day`}
          name={`${name}Day`}
          type="number"
          step={1}
          defaultValue={defaults?.day ?? ""}
        />
      </p>

      <p className={styles.field}>
        <label htmlFor={`${idPrefix}-precision`}>Connu</label>
        <select
          id={`${idPrefix}-precision`}
          name={`${name}Precision`}
          defaultValue={defaults?.precision ?? ""}
        >
          <option value="">—</option>
          {precisions.map((precision) => (
            <option key={precision.value} value={precision.value}>
              {precision.label}
            </option>
          ))}
        </select>
      </p>
    </fieldset>
  );
}
