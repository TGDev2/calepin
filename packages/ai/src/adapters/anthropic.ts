/**
 * The primary provider adapter (CAL-049).
 *
 * All the translation lives in `messages.ts`, shared with the Bedrock adapter
 * (CAL-050) because both clients expose the same `messages` resource. What is
 * left here is construction: the first-party client, its key, and the SDK's own
 * retries turned off.
 */

import Anthropic from "@anthropic-ai/sdk";

import type { ProviderAdapter } from "../adapter";
import { createMessagesAdapter, type MessagesClient } from "./messages";

export type CreateAnthropicAdapterOptions =
  | {
      /**
       * Passed explicitly: no package outside the validated config module
       * reads the environment (CLAUDE.md §4.2). The process shell supplies it.
       */
      readonly apiKey: string;
      readonly baseUrl?: string;
    }
  | { readonly client: MessagesClient };

export function createAnthropicAdapter(options: CreateAnthropicAdapterOptions): ProviderAdapter {
  const client: MessagesClient =
    "client" in options
      ? options.client
      : new Anthropic({
          apiKey: options.apiKey,
          ...(options.baseUrl === undefined ? {} : { baseURL: options.baseUrl }),
          // See `messages.ts`: the retry policy is `retry.ts`'s, not the SDK's,
          // and two of them stacked would hide the inner one.
          maxRetries: 0,
        });

  return createMessagesAdapter("anthropic", client);
}
