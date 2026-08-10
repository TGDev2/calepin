/**
 * The reference corpus (CAL-059) — the fixed ground a prompt is judged on.
 *
 * The bench defines the *shape* of a corpus and takes one as a value; it never
 * reads the filesystem, so its unit tests stay pure and a runner is free to
 * load cases from wherever CAL-078 puts them. The real corpus — five
 * public-domain short stories with annotated expectations — is CAL-078's to
 * build; what is pinned here is what a case must carry for the bench to do its
 * work honestly.
 *
 * `provenance` is mandatory on purpose. §8 allows only synthetic or
 * public-domain fixtures, committed knowingly, and a text whose origin nobody
 * wrote down is a text nobody committed knowingly. The bench refuses the case
 * rather than trusting the corpus author's memory.
 */

import { InternalError } from "@calepin/shared/errors";

import type { PromptValue, PromptVariableType } from "../prompts";

export interface BenchCase {
  /** Kebab-case, unique within the corpus — how reports and the judge cite the case. */
  readonly id: string;
  /** Short display title for the report. */
  readonly title: string;
  /** Where the reference text comes from and under what licence — public domain or synthetic, stated. */
  readonly provenance: string;
  /** The text the mission is applied to and the judge anchors critiques in. */
  readonly referenceText: string;
  /**
   * Values for the mission prompt's declared variables — the union across the
   * versions a comparison renders, since a candidate version may declare a
   * variable the baseline does not. A value a version does not declare is
   * ignored by `renderPrompt`; a declared variable this record does not cover
   * fails the render loudly, with the variable's name.
   */
  readonly variables: Readonly<Record<string, PromptValue<PromptVariableType>>>;
  /** Human-annotated expectations, French, in order (CAL-078); may be empty. */
  readonly expectations: readonly string[];
}

export interface ReferenceCorpus {
  /** Kebab-case — named in the report so a reading of it can be reproduced. */
  readonly id: string;
  /** French: what this corpus covers and why these texts. */
  readonly description: string;
  readonly cases: readonly BenchCase[];
}

const KEBAB_CASE_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Refuses a corpus the bench cannot run honestly. A throw, never a `Result`:
 * a corpus is authored code, so a hole in it is a call-site bug that fails on
 * every run (§7). The field path names ids and indexes — never a text, a title
 * or an expectation, which are content (§9).
 */
export function assertReferenceCorpus(corpus: ReferenceCorpus): void {
  if (!KEBAB_CASE_PATTERN.test(corpus.id)) {
    throw new InternalError({ message: "a corpus id must be kebab-case", fieldPath: corpus.id });
  }

  if (corpus.cases.length === 0) {
    throw new InternalError({
      message: "a reference corpus holds at least one case",
      fieldPath: corpus.id,
    });
  }

  const seen = new Set<string>();

  for (const [index, benchCase] of corpus.cases.entries()) {
    if (!KEBAB_CASE_PATTERN.test(benchCase.id)) {
      throw new InternalError({
        message: "a bench case id must be kebab-case",
        fieldPath: `cases[${index}]`,
      });
    }

    if (seen.has(benchCase.id)) {
      throw new InternalError({
        message: "two bench cases share one id",
        fieldPath: benchCase.id,
      });
    }

    seen.add(benchCase.id);

    if (
      benchCase.title.trim() === "" ||
      benchCase.provenance.trim() === "" ||
      benchCase.referenceText.trim() === ""
    ) {
      throw new InternalError({
        message: "a bench case needs a title, a provenance and a reference text",
        fieldPath: benchCase.id,
      });
    }

    if (benchCase.expectations.some((expectation) => expectation.trim() === "")) {
      throw new InternalError({
        message: "a bench case expectation cannot be blank",
        fieldPath: benchCase.id,
      });
    }
  }
}
