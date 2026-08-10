/**
 * The client half of CAL-062's progress stream: subscribes to the SSE route
 * and forwards each full snapshot it receives.
 *
 * **`createEventSource` arrives as an injected argument**, the same idiom
 * `generation-indicator.tsx` already documents for its poll action — it is
 * what lets this module be unit-tested without a DOM (`vitest.config.ts` runs
 * the unit project under `environment: "node"`, with no `EventSource`
 * global). The default argument is only ever evaluated when a caller omits
 * it, which a test never does.
 *
 * **Reconnection is the browser's, not this module's.** Server-sent events
 * *is* `EventSource`'s job: on a dropped connection the browser retries on
 * its own, so there is no backoff loop to write or to test here — only that
 * a message is parsed and forwarded, and that unsubscribing closes the
 * connection.
 */

import type { GenerationMission } from "@calepin/shared/repository";

/** One running generation, as the SSE route's `data:` frame carries it. */
export interface RunningGenerationView {
  readonly id: string;
  readonly mission: GenerationMission;
  readonly progressStep: string | null;
  readonly progressPercent: number | null;
}

/** The two members of `EventSource` this module actually uses. */
export type GenerationEventSource = Pick<EventSource, "onmessage" | "close">;

/**
 * Opens the connection and forwards every full snapshot to `onUpdate`.
 * Returns the unsubscribe function — call it on unmount.
 */
export function subscribeToGenerationEvents(
  url: string,
  onUpdate: (rows: RunningGenerationView[]) => void,
  createEventSource: (url: string) => GenerationEventSource = (target) => new EventSource(target),
): () => void {
  const source = createEventSource(url);

  source.onmessage = (event) => {
    try {
      onUpdate(JSON.parse(event.data) as RunningGenerationView[]);
    } catch {
      // A malformed or partial frame is dropped; the next tick supersedes it.
    }
  };

  return () => source.close();
}
