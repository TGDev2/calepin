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
import { InternalError } from "@calepin/shared/errors";

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

/** The three configuration values a process shell can supply, each or none. */
export interface BedrockCredentialValues {
  readonly region: string | undefined;
  readonly accessKeyId: string | undefined;
  readonly secretAccessKey: string | undefined;
}

/**
 * Turns a shell's three optional settings into adapter options, or into
 * nothing (CAL-208).
 *
 * **One answer to *all three or none*, and it lives here rather than in either
 * shell.** Two processes compose this endpoint, and a rule duplicated between
 * them is a rule that drifts — with the failure being silent on the side that
 * lost it, which is the worst shape a resilience setting can have.
 *
 * Three outcomes, and the middle one is the point:
 *
 * - **None set** — `undefined`. Wiring one endpoint is a supported
 *   configuration, not a mis-wiring: `createModelProviderPort` drops a model
 *   whose provider has no adapter rather than throwing, so what an absent
 *   fallback costs is resilience and never a generation.
 * - **All three set** — the SigV4 options `createBedrockAdapter` takes.
 * - **Some set** — a throw. §7's division: this is a deployment that meant to
 *   have a fallback and does not, which is a mis-wiring and not a runtime
 *   condition a caller could recover from. Returning `undefined` here is the
 *   one behaviour that must not exist — it would start the process, run every
 *   generation on a single endpoint, and answer the question *why did failover
 *   never happen* nowhere at all.
 *
 * The `fieldPath` names which settings are missing, never what the others hold:
 * `AppError.message` is the first line of a stack, and a secret access key is
 * exactly the value that must never reach one (§7, §9).
 */
export function bedrockAdapterOptions(
  values: BedrockCredentialValues,
): CreateBedrockAdapterOptions | undefined {
  const region = supplied(values.region);
  const accessKeyId = supplied(values.accessKeyId);
  const secretAccessKey = supplied(values.secretAccessKey);

  if (region !== undefined && accessKeyId !== undefined && secretAccessKey !== undefined) {
    return { region, credentials: { accessKeyId, secretAccessKey } };
  }

  if (region === undefined && accessKeyId === undefined && secretAccessKey === undefined) {
    return undefined;
  }

  throw new InternalError({
    code: "MODEL_NOT_CONFIGURED",
    message: "the fallback provider is configured in part, which configures nothing",
    fieldPath: [
      region === undefined ? "BEDROCK_REGION" : undefined,
      accessKeyId === undefined ? "BEDROCK_ACCESS_KEY_ID" : undefined,
      secretAccessKey === undefined ? "BEDROCK_SECRET_ACCESS_KEY" : undefined,
    ]
      .filter((name) => name !== undefined)
      .join(","),
  });
}

/** An empty string is an unset variable that happened to be written down. */
function supplied(value: string | undefined): string | undefined {
  return value === undefined || value.trim() === "" ? undefined : value;
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
