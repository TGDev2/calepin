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
