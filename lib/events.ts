import "server-only";
import { EventEmitter } from "node:events";

const g = globalThis as typeof globalThis & { __tpbus?: EventEmitter };
export const bus: EventEmitter = g.__tpbus ?? (g.__tpbus = new EventEmitter().setMaxListeners(0));

export const channel = (restaurantId: string) => `r:${restaurantId}`;

export function emitChange(restaurantId: string) {
  bus.emit(channel(restaurantId));
}

/** Server-Sent Events response that re-sends a fresh snapshot on every change. */
export function sseResponse(req: Request, restaurantId: string, snapshot: () => unknown | null): Response {
  const enc = new TextEncoder();
  let cleanup = () => {};
  const stream = new ReadableStream({
    start(controller) {
      const send = () => {
        const data = snapshot();
        controller.enqueue(enc.encode(data === null ? "event: gone\ndata: {}\n\n" : `data: ${JSON.stringify(data)}\n\n`));
      };
      const onChange = () => {
        try {
          send();
        } catch {
          cleanup();
        }
      };
      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(enc.encode(": ping\n\n"));
        } catch {
          cleanup();
        }
      }, 20_000);
      cleanup = () => {
        bus.off(channel(restaurantId), onChange);
        clearInterval(heartbeat);
        try {
          controller.close();
        } catch {}
      };
      bus.on(channel(restaurantId), onChange);
      req.signal.addEventListener("abort", cleanup);
      send();
    },
    cancel() {
      cleanup();
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
