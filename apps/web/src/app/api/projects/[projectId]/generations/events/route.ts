/**
 * The progress stream (CAL-062) — server-sent events broadcasting a
 * project's generations in flight, each with the named step and indicative
 * percentage it last reported.
 *
 * **A full snapshot every tick, never a delta.** The same "the row is the
 * truth" idea CAL-060/061 already build the queue on: this handler polls
 * `listRunningGenerations` — the same scoped read `GenerationIndicator`'s
 * server-rendered `initial` already uses — on an interval, and emits the
 * whole array as one `data:` frame each time. A dropped frame is never a
 * correctness bug, only a display lag until the next tick; there is no
 * client-side state to reconcile against a missed delta.
 *
 * **No new transport infrastructure.** Nothing in `@calepin/shared/queue`
 * has a pub/sub today (no `QueueEvents`, no `EventEmitter`), and this feed
 * is scoped to one project at a time — polling the database from inside the
 * stream is the existing 5s-poll idea, pushed server-side and tightened.
 *
 * **Reconnection and restitution are the same mechanism.** A dropped
 * connection is retried by the browser's own `EventSource` (no code here for
 * that); a fresh connection's very first tick already reads current state —
 * there is no separate "restore on reload" path. Nothing about a client
 * disconnecting affects the generation itself, which only ever talks to
 * Postgres and Redis.
 */

import { errorLogFields } from "@calepin/shared/errors";
import { logger } from "@calepin/shared/logging";
import { listRunningGenerations, openProjectScope } from "@calepin/shared/repository";
import type { NextRequest } from "next/server";

import { getCurrentUser } from "@/lib/current-user";
import type { RunningGenerationView } from "@/lib/generation-events";

export const dynamic = "force-dynamic";

const POLL_INTERVAL_MS = 2000;

export async function GET(
  request: NextRequest,
  context: RouteContext<"/api/projects/[projectId]/generations/events">,
) {
  const { projectId } = await context.params;

  const user = await getCurrentUser();
  if (!user) return new Response(null, { status: 401 });

  const opened = await openProjectScope({ ownerId: user.id, projectId });
  if (!opened.ok) return new Response(null, { status: 404 });

  const scope = opened.value;
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;

      const send = async (): Promise<void> => {
        try {
          const running = await listRunningGenerations(scope);
          const rows: RunningGenerationView[] = running.map((row) => ({
            id: row.id,
            mission: row.mission,
            progressStep: row.progressStep,
            progressPercent: row.progressPercent,
            failureClass: row.failureClass,
            queuePosition: row.queuePosition,
          }));

          if (!closed) controller.enqueue(encoder.encode(`data: ${JSON.stringify(rows)}\n\n`));
        } catch (error: unknown) {
          // A tick that fails to read is not a reason to end the stream: the
          // next one, two seconds later, tries again. The connection itself
          // is untouched.
          logger.warn("generation.events-poll-failed", { projectId, ...errorLogFields(error) });
        }
      };

      void send();
      const timer = setInterval(() => void send(), POLL_INTERVAL_MS);

      const stop = (): void => {
        if (closed) return;
        closed = true;
        clearInterval(timer);
        try {
          controller.close();
        } catch {
          // Already closed by the runtime — nothing left to do.
        }
      };

      request.signal.addEventListener("abort", stop);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
