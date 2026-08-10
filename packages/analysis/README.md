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
`ANALYSIS_WORD_TARGETS` are the lengths the prompt renders as variables. The
prompt itself is V2 in `@calepin/ai/prompts`.
