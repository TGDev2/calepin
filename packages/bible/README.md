# @calepin/bible

The narrative reference the whole book is checked against: identity and style,
characters, relationships (typed, oriented, asymmetric), places, world rules and
their limits, the timeline, and canon facts.

Canon facts carry three orthogonal dimensions — truth in the world, temporal
validity, and which character knows them. Individual elements can be locked so
later generations cannot contradict them, and the bible is checked for internal
consistency before validation.

The identity section is the first one built (CAL-088). Its contract —
`tracedNovelIdentitySchema` — carries the nine fields `BibleIdentity` stores
and a **required** basis on each: a passage of the canonical direction or of
the validated analysis, quoted word for word, with the argument for it.
`checkNovelIdentityBasis` reads every quotation back against the passage it
names; a field that does not trace refuses the answer whole. The other two of
the specification's eleven fields — the readership and the target length — are
the author's own choice on the project, and `resolveNovelIdentity` composes the
eleven from the nine that were generated and the two that were not.

The style section is the second (CAL-089). Its contract —
`operationalStyleSchema` — carries the nine fields `BibleStyle` stores, and
every element is a `StyleConstraint`: the rule itself, stated of the novel's
prose, paired with the observable feature of a single passage that breaches
it. The pair is the acceptance criterion as a shape — a decorative adjective
cannot fill the `violation` half — and it deliberately carries no basis:
CAL-088's citation obligation answered *traceability*, while a style rule
under an `extend` or `reinterpret` treatment has no verbatim antecedent to
quote. `resolveBibleStyle` flattens each pair into the one text its column
stores, rule and breach joined by `STYLE_VIOLATION_CONNECTOR`, so the
downstream consumers — the writing context (CAL-107), the style checks
(CAL-139) — quote the same clauses the author reads.

Backlog: E09 — CAL-088 to CAL-100. Schemas: CAL-016, CAL-017, CAL-018.
