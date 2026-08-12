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
CAL-088's citation obligation answered _traceability_, while a style rule
under an `extend` or `reinterpret` treatment has no verbatim antecedent to
quote. `resolveBibleStyle` flattens each pair into the one text its column
stores, rule and breach joined by `STYLE_VIOLATION_CONNECTOR`, so the
downstream consumers — the writing context (CAL-107), the style checks
(CAL-139) — quote the same clauses the author reads.

The character sheet is the third (CAL-090). Its contract —
`conflictedCharacterSheetSchema` — carries the fifteen sheet columns
`Character` stores plus `relationships`, the specification's seventeenth
field, held by the `Relationship` table. The four quality requirements are
shapes: `deepNeed` pairs the need with what pursuing the desire costs it,
`contradiction` pairs the tension with the dilemma it forces, `speechStyle`
pairs the voice with what the character would never say, and each
`heldKnowledge` entry types its statement with a stance —
`knows` / `believes-wrongly` / `unaware` / `denies` — that
`knowledgeStanceToBelief` maps onto the canon model's two axes, so CAL-094's
derivation is a copy. Edges name only characters the ask offered;
`verifyCharacterSheet` holds the answer to that (the name refuses whole, a
bad edge drops with a report) and brands what survives.
`resolveCharacterSheet` flattens the pairs and prefixes each knowledge entry
with its stance, connectors visible, so persistence stays a copy.

The relationship graph is the fourth (CAL-091), and it is a separate mission
rather than more of the sheet for one structural reason: a sheet is asked of
one character, so no prompt could make it declare that **A holds something
about B that B does not**. The asymmetry is a property of the pair.
`characterRelationsSchema` carries directed edges over a closed cast, each one
able to declare `asymmetries` — an affirmative, atomic statement plus the two
characters' stances on it, drawn from the sheet's own stance vocabulary. Two
checks make a fake one unfillable: the stances must decide the same world, and
their beliefs must differ. `resolveRelationshipAsymmetries` projects each
through `knowledgeStanceToBelief` into the `CanonFact` + `CanonFactBelief`
shape CAL-094 writes and CAL-099 reads, which is what makes *exploitable par le
contrôle de cohérence* a committed mapping rather than a promise.

The mirror edge is never implied — CAL-016's decision on CAL-099's behalf, so
a missing symmetric relation stays detectable. `resolveRelationshipGraph`
therefore *classifies* what was declared (`mutual` / `one-sided` / `divergent`)
without ever adding to it, over a shape database rows and model answers both
satisfy, and `describeRelationshipGraph` phrases it in the French the writing
context and the coherence prompt quote.

The world is the fifth (CAL-092), and the section whose acceptance criterion
is a shape rather than a check. The specification lists ten items; the contract
has nine, because the tenth — *les limites de ces éléments* — is the shape of
the ninth and not a list beside it, which could be empty while capabilities
existed. There is no `isSupernatural` boolean for a model to lower: the answer
carries two arrays with different shapes, an ordinary rule with no `limits`
field to leave empty and an out-of-norm capability with three required,
non-empty bound lists. `resolveWorldRules` writes the column from which array
an entry came out of, never from the answer — so *refuse the generation if a
supernatural element is declared without limits* is not a rule anyone can
forget to apply, it is a state the type does not have.

`forbids` closes the one gap that split leaves: a power written up as an
ordinary rule must still say what it cannot do. `verifyWorldBible` deduplicates
names across **both** arrays, since both become `WorldRule` rows under one
unique index, and drops a capability whole rather than keep it half-bounded
when de-duplication empties one of its three lists. `describeWorldBounds`
phrases what the world permits and what bounds it, ordinary rules before the
exceptions to them, in the French the writing context and the coherence prompt
quote — which is where the bounds stop being a declaration and start being what
makes a resolution by convenience detectable (CAL-114, CAL-159).

`build-timeline` (CAL-093) is the sixth, and the only one whose answer is
checked by calculation rather than judged by shape. The other five refuse a bad
answer by leaving it no room to arrive in — a rule that forbids nothing, a
constraint with no consequence, a basis quoting nothing; a chronology instead
produces numbers that either can or cannot all be true at once, and
`checkTimelineArithmetic` decides that without asking a model anything. It reads
positions rather than names, so a database row satisfies it as readily as an
answer and CAL-133 can re-run it over the events a chapter actually told.

Two arrays rather than a category field, so `TimelineEvent.category` is written
from provenance and an initial chronology has no way to narrate anything —
`resolveWorldRules`' arrangement one section over. Two demands the column
deliberately does not make: an age on every presence and a day for every event,
because without either a model can satisfy the contract and leave the
calculation nothing to read. The age rule is one birth-day window per character,
intersected across every statement about them; the intersection running empty is
the inconsistency, and what is reported is what disagrees with the reading most
of the statements support rather than a disjoint pair. `unverifiableAges` counts
what the calculation could **not** establish, because a chronology dated to the
decade passes trivially and silence must not read as approval.

`extract-initial-facts` (CAL-094) is the seventh and last, and the one CAL-018
named three times while deferring to it: `CanonFactSource.BIBLE` is annotated
with this task, `Character.heldKnowledge` says its checkable form is derived
here, and `CanonFact` carries no unique index on its statement because
*deduplication belongs to the extraction mission*. It reads every other section
plus the source text, and its identifier is its own — `extract-facts` is taken by
the chapter pass of E13, which is given one chapter rather than a whole bible.

Three arrays again, and this time the device lands on a constraint already
written in SQL: `canon_facts_validity_check`'s three branches become three
shapes, so a permanent fact has no bound field to leave empty and a period fact
placed by nothing cannot be expressed. Every fact owes a **verbatim quotation**
of one closed corpus entry, which is what decides `CanonFact.source` without
believing a declaration and what makes an invented canon impossible rather than
merely unlikely; an unfound quotation drops the fact. `knownBy` declares a
`CanonFactBeliefState` directly rather than a sheet stance, because the fact
already declares `isTrue` and a stance would re-decide it — the sheet's
vocabulary reaches this mission as the prefixes `resolveCharacterSheet` writes.

Atomicity is `checkCanonFactStatement`, five closed defects over four marker
tables, deliberately silent on relative pronouns and appositions. Decompositions
are **declared** and their composite must itself fail that checker, the
`StyleConstraint.violation` device applied to a claim about work done.
`deduplicateCanonFacts` merges an equal key and absorbs its beliefs, keeps both
when one character is given two stances (that is a contradiction, and CAL-099
arbitrates), reports a near-duplicate without ever merging it, and drops what
`knownFacts` already holds — which is why `CanonFactStatus` keeps rejected rows.

## Coherence (CAL-099)

The bible read against itself, before it can be validated. Four calculable
checks live in `src/coherence/checks/`, and each one is mostly the redemption
of a decision an earlier task made on its behalf: the arithmetic is
`checkTimelineArithmetic` re-run over rows instead of a model answer, the
missing reciprocity is the `one-sided` pair `resolveRelationshipGraph`
deliberately never completes, and two facts recorded with opposite truth values
is what `CanonFact`’s affirmative-statement-plus-`isTrue` shape exists to make
visible. The fourth reads prose — a conservative proper-noun scan for names the
bible never declares — and is `MAJOR` and never blocking, because its residue
is real and a dismissal sticks forever after.

The engine itself is `@calepin/shared/coherence`; what is here is everything
that needs to know what a chronology, a tie and a canonical fact mean. Findings
are anchored on **row ids**, never on the indexes the arithmetic works in: an
index moves when an unrelated event is inserted, and the author’s arbitration
would move with it.

`detect-bible-contradictions` is the half no key reaches — two statements that
oppose each other only in their wording, two rules that cannot both govern. It
names an index and never an id, carries no severity for a model to lower, and
both of its lists may be empty: a bible that holds together is the common case,
and a floor would teach the model to invent one.

`validateBible` lives in `@calepin/bible/repository`, the package’s second
entry point. Everything that opens a transaction is there and nothing in the
root barrel is, because a client component importing this package for a ceiling
would otherwise pull `node:async_hooks` into its bundle.

Backlog: E09 — CAL-088 to CAL-100. Schemas: CAL-016, CAL-017, CAL-018.
