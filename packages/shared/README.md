# @calepin/shared

Cross-cutting primitives every other package may depend on: identifiers, result
and error types, value objects, and helpers that must behave identically on the
server, in the browser and in the worker.

**Rule:** this package must never import a business domain. It sits below all of
them; an import in the other direction is a cycle.

Nothing in the backlog owns `shared` as an epic. It grows from tasks that
explicitly demand one implementation used in several runtimes — for example the
single word-count function shared by client and server (CAL-041, reused by
CAL-118), the generic versioning core (CAL-146) and the error hierarchy
(CAL-010).
