import dayjs from "dayjs";

export const runtime = "nodejs";

const HEARTBEAT_MS = 20_000;
const KEEP_ALIVE_MS = 10_000;
const MAX_CONNECTION_MS = 10 * 60 * 1000;

export async function GET(req: Request) {
  let cleanup: () => void = () => {};

  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      let closed = false;

      cleanup = () => {
        if (closed) {
          return;
        }
        closed = true;
        clearInterval(heartbeat);
        clearInterval(keepAlive);
        clearTimeout(maxConnection);
        req.signal.removeEventListener("abort", cleanup);
        try {
          controller.close();
        } catch {
          // Already closed by the runtime or a prior cleanup.
        }
      };

      const write = (payload: string) => {
        if (closed) {
          return;
        }
        try {
          controller.enqueue(encoder.encode(payload));
        } catch {
          cleanup();
        }
      };

      write(`event: ready\ndata: ${JSON.stringify({ ts: dayjs().toISOString() })}\n\n`);

      const heartbeat = setInterval(() => {
        write(`data: ${JSON.stringify({ ts: dayjs().toISOString() })}\n\n`);
      }, HEARTBEAT_MS);

      const keepAlive = setInterval(() => {
        write(`: keep-alive ${dayjs().valueOf()}\n\n`);
      }, KEEP_ALIVE_MS);

      const maxConnection = setTimeout(cleanup, MAX_CONNECTION_MS);

      req.signal.addEventListener("abort", cleanup);
    },
    cancel() {
      cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
