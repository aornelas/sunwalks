// The Claude API client every Sunwalks entry point builds, with one
// addition: a fetch that can note each request's size and how long the
// response took to start arriving. The tool loop turns that on per turn
// (traceRequests), which is how a message thread's effect is measured: on
// the turns after the first, a thread should send far fewer bytes, and a
// large request there means the SDK had to replay the whole conversation.

import { AsyncLocalStorage } from "node:async_hooks";
import Anthropic, { type ClientOptions } from "@anthropic-ai/sdk";

export interface RequestTrace {
  /** Request body size in bytes. */
  bytes: number;
  /** Milliseconds until the response headers arrived. */
  ms: number;
  status: number;
  /** "create" or "continue" for a thread request, "none" without one. */
  thread: "create" | "continue" | "none";
}

const traces = new AsyncLocalStorage<RequestTrace[]>();
const encoder = new TextEncoder();

export function createClaudeClient(options: ClientOptions = {}): Anthropic {
  const base = options.fetch ?? fetch;
  return new Anthropic({
    ...options,
    fetch: async (input, init) => {
      const sink = traces.getStore();
      if (!sink) return base(input, init);
      const body = typeof init?.body === "string" ? init.body : "";
      const kind = /"thread":\{"type":"(create|continue)"/.exec(body)?.[1] as "create" | "continue" | undefined;
      const started = performance.now();
      const response = await base(input, init);
      sink.push({
        bytes: encoder.encode(body).length,
        ms: Math.round(performance.now() - started),
        status: response.status,
        thread: kind ?? "none",
      });
      return response;
    },
  });
}

/** Runs `fn`, collecting a trace of every request a createClaudeClient client sends meanwhile. */
export async function traceRequests<T>(fn: () => Promise<T>): Promise<{ result: T; requests: RequestTrace[] }> {
  const requests: RequestTrace[] = [];
  const result = await traces.run(requests, fn);
  return { result, requests };
}
