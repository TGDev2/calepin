/**
 * The composition root for the model provider, worker side (CAL-208).
 *
 * The third of this shell's composition roots, and deliberately the same shape
 * as the other two: the shell decides what a process talks to, and what it
 * hands over is built from the **validated** configuration rather than from the
 * environment. No package under `src/` reads `process.env` (§4.2), which is
 * exactly why both adapters take their credentials as constructor arguments —
 * this file is the one that supplies them.
 *
 * **One port per process, and that matters more here than it looks.** Almost
 * everything `@calepin/ai` does is per-call and stateless; provider health is
 * not. A durable outage is invisible from inside a single request, so the port
 * remembers which endpoints have stopped answering and starts the next call at
 * one that has not. Two ports would be two memories, each learning the same
 * outage separately and each paying for it. A module-level constant is enough
 * to hold it: a worker is one process with one module graph, which is the
 * difference from the web shell, where the same value has to live on
 * `globalThis`.
 *
 * **A missing fallback is a configuration, not a fault.** With no Bedrock
 * credentials the port is composed over the primary alone, and
 * `createModelProviderPort` drops a model whose provider has no adapter instead
 * of throwing — so an operator who has wired one endpoint gets generations that
 * run and no failover, rather than a worker that refuses to start. A *partial*
 * fallback is the opposite and throws: see `bedrockAdapterOptions`.
 */

import {
  bedrockAdapterOptions,
  createAnthropicAdapter,
  createBedrockAdapter,
  createModelProviderPort,
  type ModelProviderPort,
  type ProviderAdapter,
} from "@calepin/ai";
import type { Env } from "@calepin/shared/config";

export function createWorkerModelProvider(env: Env): ModelProviderPort {
  const adapters: ProviderAdapter[] = [createAnthropicAdapter({ apiKey: env.ANTHROPIC_API_KEY })];

  const fallback = bedrockAdapterOptions({
    region: env.BEDROCK_REGION,
    accessKeyId: env.BEDROCK_ACCESS_KEY_ID,
    secretAccessKey: env.BEDROCK_SECRET_ACCESS_KEY,
  });

  if (fallback !== undefined) {
    adapters.push(createBedrockAdapter(fallback));
  }

  return createModelProviderPort({ adapters });
}
