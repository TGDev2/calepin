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

Backlog: E09 — CAL-088 to CAL-100. Schemas: CAL-016, CAL-017, CAL-018.
