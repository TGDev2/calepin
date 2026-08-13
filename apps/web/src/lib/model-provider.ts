/**
 * The composition root for the model provider (CAL-208).
 *
 * The twin of `./database`, and deliberately the same shape: the shell decides
 * what a process talks to, and it builds it from the **validated** config
 * rather than from the environment — both adapters take their credentials as
 * constructor arguments precisely so no package under a `src/` has to read one
 * (§4.2).
 *
 * ADR-001 allows a short mission to run inside a server action, against the
 * same injected port the worker hands its executors. **Nothing calls this yet**
 * — no screen creates a generation until CAL-213 — and it is still imported at
 * boot from `instrumentation.ts`, for the reason that file already gives about
 * the queue connection: a mis-wired deployment should say so at startup rather
 * than during the first generation an author paid for.
 *
 * **On `globalThis`, and here that is not a hot-reload convenience.**
 * `apps/web` compiles `packages/*` from source into more than one chunk graph,
 * so a module-level constant exists once *per chunk*. Almost everything
 * `@calepin/ai` does is per-call and stateless; provider health is not — a
 * durable outage is invisible from inside one request, so the port remembers
 * which endpoints have stopped answering and starts the next call at one that
 * has not. Two copies would be two memories, each rediscovering the same outage
 * and each paying for it. `Symbol.for` gives every copy of this module the same
 * slot, which is the reasoning `@calepin/shared/database`'s registry and
 * `AppError`'s brand already record, applied to the one piece of state the AI
 * layer keeps.
 *
 * There is no `configureModelProviderPort` seam in `@calepin/shared` to put it
 * behind, and there cannot be: `shared` must depend on nothing (§3.2), so it
 * could not name a `ModelProviderPort`. The slot inside this file is the shape
 * that leaves.
 */

import {
  bedrockAdapterOptions,
  createAnthropicAdapter,
  createBedrockAdapter,
  createModelProviderPort,
  type ModelProviderPort,
  type ProviderAdapter,
} from "@calepin/ai";
import { env } from "@calepin/shared/config";

const PORT_KEY = Symbol.for("calepin.modelProviderPort");

interface PortHolder {
  [PORT_KEY]?: ModelProviderPort;
}

const holder = globalThis as unknown as PortHolder;

function compose(): ModelProviderPort {
  const adapters: ProviderAdapter[] = [createAnthropicAdapter({ apiKey: env.ANTHROPIC_API_KEY })];

  // Absent is a configuration and partial is a mis-wiring; the difference is
  // decided once, beside the adapter, rather than in each shell.
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

export const modelProvider: ModelProviderPort = (holder[PORT_KEY] ??= compose());
