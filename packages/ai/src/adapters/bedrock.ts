/**
 * The fallback provider adapter (CAL-050).
 *
 * Bedrock serves the same Claude models under a different account, credential
 * and control plane, and its Mantle client exposes the same `messages` resource
 * as the first-party one — so this file is construction and nothing else, and
 * every translation decision stays in `messages.ts` where one fix serves both
 * endpoints.
 *
 * **Credentials are a constructor argument, never an ambient lookup.** The SDK
 * would happily fall back to the machine's default AWS credential chain, and a
 * provider that silently authenticates from whatever the host happens to carry
 * is a provider nobody can reason about — least of all in a worker. The process
 * shell resolves them through the validated config module (CAL-060) and passes
 * them in; only `region` is required, because it is part of the endpoint rather
 * than of the identity.
 */

import { AnthropicBedrockMantle } from "@anthropic-ai/bedrock-sdk";

import type { ProviderAdapter } from "../adapter";
import { createMessagesAdapter, type MessagesClient } from "./messages";

export interface BedrockCredentials {
  readonly accessKeyId: string;
  readonly secretAccessKey: string;
  /** Set for temporary credentials — an assumed role, an instance profile. */
  readonly sessionToken?: string;
}

export type CreateBedrockAdapterOptions =
  | {
      /** The AWS region the Bedrock endpoint is reached in. */
      readonly region: string;
      /**
       * SigV4 credentials, or a bearer token. One of the two is required: an
       * adapter that resolved neither would fall through to the host's default
       * credential chain, which is exactly the ambient authentication this
       * argument exists to refuse.
       */
      readonly credentials: BedrockCredentials;
      readonly apiKey?: never;
    }
  | {
      readonly region: string;
      readonly apiKey: string;
      readonly credentials?: never;
    }
  | { readonly client: MessagesClient };

export function createBedrockAdapter(options: CreateBedrockAdapterOptions): ProviderAdapter {
  return createMessagesAdapter("bedrock", toClient(options));
}

function toClient(options: CreateBedrockAdapterOptions): MessagesClient {
  if ("client" in options) {
    return options.client;
  }

  return new AnthropicBedrockMantle({
    awsRegion: options.region,
    ...(options.apiKey === undefined
      ? {
          awsAccessKey: options.credentials.accessKeyId,
          awsSecretAccessKey: options.credentials.secretAccessKey,
          awsSessionToken: options.credentials.sessionToken ?? null,
        }
      : { apiKey: options.apiKey }),
    // The one backoff is `retry.ts`'s, on this endpoint as on the other.
    maxRetries: 0,
  });
}
