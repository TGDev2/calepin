/**
 * A simulated messages client, shared by every test that needs a provider
 * without a network call or a credential (CLAUDE.md §8: never a real provider
 * in a test).
 *
 * It lives beside the adapters rather than inside one test file because three
 * suites need it — the two adapters and the failover test — and because it is
 * typed as `MessagesClient`, the same type both real clients are assigned to.
 * A slice that drifted away from the SDK would stop compiling here and in the
 * adapters at once, which is what keeps the fake honest.
 *
 * It is deliberately absent from `index.ts`: test support, not public surface.
 * Every body it carries is structural — a shape, a count, a token number —
 * so no fixture in this package can hold anything a reader could read as part
 * of a novel (§9).
 */

import Anthropic from "@anthropic-ai/sdk";

import type { MessagesClient } from "./messages";

/** One recorded request: what the adapter sent, and what it sent it with. */
export interface RecordedCall {
  readonly params: Anthropic.MessageStreamParams;
  readonly signal: AbortSignal | null | undefined;
}

/** A `Message` to answer with, an `Error` to throw the way the SDK would. */
export type SimulatedOutcome = Anthropic.Message | Error;

export interface SimulatedClient {
  readonly client: MessagesClient;
  readonly calls: RecordedCall[];
}

/**
 * Answers the outcomes in order. A function is asked for the outcome at call
 * time instead, which is what lets a test decide by model id — the shape a
 * failover test needs, where "the primary is down" is a property of the
 * endpoint rather than of the call's position in a sequence.
 */
export function simulatedClient(
  outcomes: readonly SimulatedOutcome[] | ((call: RecordedCall, index: number) => SimulatedOutcome),
): SimulatedClient {
  const calls: RecordedCall[] = [];
  const client: MessagesClient = {
    messages: {
      stream(body, options) {
        const index = calls.length;
        const call: RecordedCall = { params: body, signal: options?.signal };

        calls.push(call);

        return {
          finalMessage: async (): Promise<Anthropic.Message> => {
            const outcome =
              typeof outcomes === "function" ? outcomes(call, index) : outcomes[index];

            if (outcome === undefined) {
              throw new Error("the simulated client was asked for more answers than it holds");
            }

            if (outcome instanceof Error) {
              throw outcome;
            }

            return outcome;
          },
        };
      },
    },
  };

  return { client, calls };
}

export function answer(options: {
  content?: Anthropic.ContentBlock[];
  usage?: Partial<Anthropic.Usage>;
  stopReason?: Anthropic.StopReason;
  model?: string;
}): Anthropic.Message {
  return {
    id: "msg_test",
    container: null,
    content: options.content ?? [text("...")],
    model: options.model ?? "claude-opus-5",
    role: "assistant",
    stop_details: null,
    stop_reason: options.stopReason ?? "end_turn",
    stop_sequence: null,
    type: "message",
    usage: {
      cache_creation: null,
      cache_creation_input_tokens: null,
      cache_read_input_tokens: null,
      inference_geo: null,
      input_tokens: 0,
      output_tokens: 0,
      output_tokens_details: null,
      server_tool_use: null,
      service_tier: "standard",
      ...options.usage,
    },
  };
}

export function text(value: string): Anthropic.TextBlock {
  return { type: "text", text: value, citations: null };
}

/**
 * The provider dying while it answers.
 *
 * The stream is opened — the request went out and was accepted — and the
 * socket then drops before the final message. That is what an outage looks
 * like from *inside* a generation, as opposed to a request refused before it
 * started, and it is the failure CAL-050's acceptance criterion simulates.
 *
 * It is built here rather than in the test that uses it because raising an
 * SDK exception means importing an SDK, and only `adapters/` may (§5). The
 * lint rule caught exactly that, which is the rule working.
 */
export function droppedMidAnswer(): Error {
  return new Anthropic.APIConnectionError({ message: "simulated" });
}
