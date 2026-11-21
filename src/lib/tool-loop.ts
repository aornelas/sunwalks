// A manual tool-use loop, written out on purpose rather than hidden behind
// the SDK's tool runner: it's the clearest way to see what an agent is.
//
//   1. Send the conversation, with the tools Claude may call.
//   2. If Claude answers with tool_use blocks, run each one here, in our
//      own code, and send all the results back in a single user message.
//   3. Repeat until Claude stops asking for tools; its last message is the
//      answer.
//
// Everything Claude learns about the world arrives through step 2, so the
// tools decide what it can see (and, with the memory tool, what it can
// change).

import Anthropic from "@anthropic-ai/sdk";
import { traceRequests, type RequestTrace } from "./claude-client";
import { MemoryError, runMemoryCommand, type MemoryCommand } from "./memory-store";

type BetaMessage = Anthropic.Beta.BetaMessage;
type BetaMessageParam = Anthropic.Beta.BetaMessageParam;

export const MEMORY_TOOL: Anthropic.Beta.BetaMemoryTool20250818 = { type: "memory_20250818", name: "memory" };

/** A custom tool: its definition, plus the function that runs it. */
export interface LoopTool {
  definition: Anthropic.Beta.BetaTool;
  run(input: unknown): Promise<unknown>;
}

export interface LoopEvent {
  turn: number;
  tool: string;
  input: unknown;
  error?: string;
}

/** What one loop run sent: per turn, every HTTP request (a replayed thread shows as two). */
export interface LoopTrace {
  threaded: boolean;
  turns: { turn: number; requests: RequestTrace[] }[];
}

export interface LoopOptions {
  model: string;
  system: string;
  prompt: string;
  tools: LoopTool[];
  /** Adds Claude's memory tool, backed by memory_files. "read-only" lets Claude view it but not change it. */
  memory?: boolean | "read-only";
  outputFormat?: Anthropic.Beta.BetaJSONOutputFormat;
  effort?: Anthropic.Beta.BetaOutputConfig["effort"];
  maxTurns?: number;
  /**
   * Keep the conversation in a message thread (beta), so each turn after
   * the first sends only its new messages. Defaults to the
   * CLAUDE_MESSAGE_THREADS environment variable ("1" turns it on).
   */
  thread?: boolean;
  onToolCall?(event: LoopEvent): void;
  /** Receives the run's request trace; by default it's logged as one line. */
  onTrace?(trace: LoopTrace): void;
}

export interface LoopResult {
  message: BetaMessage;
  turns: number;
  usage: { inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheCreationTokens: number };
  trace: LoopTrace;
}

function logTrace(trace: LoopTrace): void {
  console.info(`[tool-loop] ${JSON.stringify(trace)}`);
}

export async function runToolLoop(client: Anthropic, options: LoopOptions): Promise<LoopResult> {
  const { model, system, prompt, tools, memory, outputFormat, effort = "medium", maxTurns = 12, onToolCall } = options;
  const threaded = options.thread ?? process.env.CLAUDE_MESSAGE_THREADS === "1";
  const byName = new Map(tools.map((t) => [t.definition.name, t]));
  const toolDefs: Anthropic.Beta.BetaToolUnion[] = [...tools.map((t) => t.definition), ...(memory ? [MEMORY_TOOL] : [])];
  const usage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0 };
  const trace: LoopTrace = { threaded, turns: [] };

  // The tools, system prompt and settings never change between turns, and
  // the conversation only grows at the end. That lets the automatic cache
  // breakpoint serve earlier turns from the cache, and it's also all a
  // message thread asks: with one, the server keeps the conversation and
  // each turn sends just its new messages (the SDK helper replays the
  // whole conversation if the server has lost it).
  const request = {
    model,
    max_tokens: 16000,
    system,
    tools: toolDefs,
    cache_control: { type: "ephemeral" as const },
    output_config: { effort, ...(outputFormat ? { format: outputFormat } : {}) },
  };
  const thread = threaded
    ? client.beta.messages.thread({ ...request, unsupportedRequestBehavior: "continue_unthreaded" })
    : null;
  // Our own copy of the conversation, kept either way.
  const history: BetaMessageParam[] = [];
  const ask = (next: BetaMessageParam[]): Promise<BetaMessage> =>
    thread ? thread.send(next) : client.beta.messages.create({ ...request, messages: [...history, ...next] });

  let next: BetaMessageParam[] = [{ role: "user", content: prompt }];
  try {
    for (let turn = 1; turn <= maxTurns; turn++) {
      // 1. Ask.
      const { result: response, requests } = await traceRequests(() => ask(next));
      trace.turns.push({ turn, requests });
      usage.inputTokens += response.usage.input_tokens;
      usage.outputTokens += response.usage.output_tokens;
      usage.cacheReadTokens += response.usage.cache_read_input_tokens ?? 0;
      usage.cacheCreationTokens += response.usage.cache_creation_input_tokens ?? 0;

      if (response.stop_reason === "refusal") throw new Error(`Refused (${response.stop_details?.category ?? "no category"})`);
      if (response.stop_reason === "max_tokens") throw new Error("Hit max_tokens before finishing");

      // 3. No tool calls left: this is the answer. The whole content goes
      // back into the history either way, thinking blocks included, as the
      // API requires (a thread holds it already).
      history.push(...next, { role: "assistant", content: response.content });
      const calls = response.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
      if (response.stop_reason !== "tool_use" || calls.length === 0) {
        return { message: response, turns: turn, usage, trace };
      }

      // 2. Run every requested tool and return all results together.
      next = [{ role: "user", content: await runCalls(calls, byName, turn, onToolCall, memory === "read-only") }];
    }
    throw new Error(`No answer after ${maxTurns} turns`);
  } finally {
    (options.onTrace ?? logTrace)(trace);
  }
}

/**
 * Runs each requested tool. A tool that fails reports the failure to
 * Claude (is_error) instead of aborting the loop, so Claude can try
 * something else.
 */
async function runCalls(
  calls: Anthropic.Beta.BetaToolUseBlock[],
  byName: Map<string, LoopTool>,
  turn: number,
  onToolCall: LoopOptions["onToolCall"],
  readOnlyMemory: boolean,
): Promise<Anthropic.Beta.BetaToolResultBlockParam[]> {
  const results: Anthropic.Beta.BetaToolResultBlockParam[] = [];
  for (const call of calls) {
    let content: string;
    let isError = false;
    try {
      if (call.name === MEMORY_TOOL.name) {
        const command = call.input as MemoryCommand;
        if (readOnlyMemory && command.command !== "view") throw new MemoryError("Memory is read-only here; use view.");
        content = await runMemoryCommand(command);
      } else {
        const tool = byName.get(call.name);
        if (!tool) throw new Error(`Unknown tool ${call.name}`);
        content = JSON.stringify(await tool.run(call.input));
      }
    } catch (err) {
      if (!(err instanceof Error)) throw err;
      if (!(err instanceof MemoryError) && call.name === MEMORY_TOOL.name) throw err;
      content = err.message;
      isError = true;
    }
    onToolCall?.({ turn, tool: call.name, input: call.input, error: isError ? content : undefined });
    results.push({ type: "tool_result", tool_use_id: call.id, content, is_error: isError });
  }
  return results;
}

/** The text of a loop's final message. */
export function finalText(message: BetaMessage): string {
  return message.content
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
}
