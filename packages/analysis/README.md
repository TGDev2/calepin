# @calepin/analysis

The narrative diagnostic of the source text (2000 words maximum): factual
summary, premise, conflict, promise, themes, characters, relationships, point of
view, tense, tone, singular elements, ambiguities, open questions, elements to
preserve, weaknesses, cliché risks and potential.

Every item carries a **factual vs interpretation** marker, is annotatable by the
author and is versioned.

Backlog: E07 — CAL-070 to CAL-078. Schema: CAL-014.

CAL-070 opened the surface: `sourceTextAnalysisSchema` is the seventeen-section
output contract of `analyze-source-text`, in the persistence's own shape, and
`ANALYSIS_WORD_TARGETS` are the lengths the prompt renders as variables.

CAL-071 made the marker hold. `verifyAnalysisEvidence` reads every quotation
back against the source text it was produced from: an element marked `FACTUAL`
that cites nothing, or whose quotation is nowhere in the text, comes back
`INTERPRETATION`, and an invented quotation is dropped whatever the marker. It
checks provenance and never sufficiency — whether the passage exists, not
whether it supports the statement — and it rewrites only the marker the model
chose, since `ANALYSIS_FIXED_KINDS` names the five sections whose marker their
own definition decides. What it returns is branded: a `VerifiedSourceTextAnalysis`
is mintable here and nowhere else, so persistence (CAL-073+) takes an analysis
that has been checked rather than one somebody remembered to check.

The prompt is V3 in `@calepin/ai/prompts`, beside the V1 and V2 that shipped
before it.

CAL-075 added the dedicated pass over the déjà-lu. `clicheRiskDetectionSchema`
is the output contract of `detect-cliche-risks`: at most twelve findings across
four fronts (situation, character, formula, reversal), each carrying a
**required** verbatim passage, why it is conventional and what it prevents —
and no numeric field anywhere, because the specification forbids a banality or
originality score. `verifyClicheRiskEvidence` reads every quotation back
against the source text and drops whole any finding whose passage is not
there; its result is branded (`VerifiedClicheRiskDetection`), like the
diagnostic's.

CAL-076 added the potential assessment. `novelPotentialAssessmentSchema` is
the output contract of `assess-novel-potential`: an overall appraisal of what
the text can sustain at the target length, at least three elements able to
carry expansion, the elements that would run dry, the gaps the length will
expose (absences, so they cite nothing) and at least two fragilities to treat
— the backlog's minimums as the arrays' own, and no numeric field anywhere.
`verifyNovelPotentialEvidence` reads every quotation back and **clears** an
unfound one to null rather than dropping the appraisal — its standing is its
argument, and a drop could break the minimums. Result branded
(`VerifiedNovelPotentialAssessment`), report in counts and positions only.

CAL-208 added the first `GenerationExecutor` in the repository, behind a second
entry point: `@calepin/analysis/generation`. `createAnalyzeSourceTextExecutor`
takes the provider port a process shell hands it (§5.3), parses the ask, reads
the source-text version the ask names, composes the mission's context, calls the
port, reports what the call spent — on the failure path too, since a rejected
answer was still bought — and reads every quotation back through
`verifyAnalysisEvidence`. The ask is one field, `sourceTextVersionId`: it is
what `Generation.input` stores and what the idempotency key digests, so asking
again for an untouched text is the same ask and asking after an edit is a
different one. A version superseded while the job waited refuses
(`SOURCE_TEXT_VERSION_SUPERSEDED`) before a provider is paid.

**The second entry point is not tidiness.** This module reaches
`@calepin/shared/repository` and `@calepin/shared/queue`, whose graphs end in
`node:async_hooks`, and a `"use client"` component already imports the root
barrel of this package for a type. Putting the executor there would break
`pnpm build` inside Turbopack the first time anything imported it as a value,
naming a page rather than this file — the trap `@calepin/bible` and
`@calepin/outline` each hit before it was written down.

**It writes through the transaction that completes the attempt** (CAL-209).
`GenerationProduct.append` is a closure, so what leaves the executor is the
*write* rather than the value: `resolveSourceTextAnalysis` turns the verified
answer into seventeen `{ section, elements }` groups and
`writeGeneratedAnalysisWithin` appends them beside the generation's own
completion. They commit together or not at all, so a refusal leaves no
half-written diagnostic behind — and because the resolver takes the brand
`verifyAnalysisEvidence` mints, an answer whose quotations were never read back
against the source text has no way of reaching a row.
