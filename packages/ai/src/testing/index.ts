/**
 * `@calepin/ai/testing` — the doubles a suite outside this package needs to
 * drive the real pipeline.
 *
 * CLAUDE.md §8 forbids calling a real provider in a test, and §3.4 forbids
 * reaching into another package's `src/`. Between the two, a suite living
 * anywhere else — `test/integration`, and CAL-060's worker suites after it —
 * has no way to exercise the real port at all unless the doubles have a
 * declared entry point. This is that entry point, the shape
 * `@calepin/shared/testing` already established.
 *
 * Nothing here is a stand-in for the *pipeline*: the adapters, the registry,
 * the retry policy and the failover are the real ones. What is simulated is the
 * network, and only the network.
 */

export {
  answer,
  droppedMidAnswer,
  type RecordedCall,
  type SimulatedClient,
  simulatedClient,
  type SimulatedOutcome,
  text,
} from "../adapters/simulated";
export { fixedPrompt } from "../prompts/testing";
