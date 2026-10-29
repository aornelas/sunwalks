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
import { MemoryError, runMemoryCommand, type MemoryCommand } from "./memory-store";

export const MEMORY_TOOL: Anthropic.MemoryTool20250818 = { type: "memory_20250818", name: "memory" };

/** A custom tool: its definition, plus the function that runs it. */
export interface LoopTool {
  definition: Anthropic.Tool;
  run(input: unknown): Promise<unknown>;
}

export interface LoopEvent {
  turn: number;
  tool: string;
  input: unknown;
  error?: string;
}

export interface LoopOptions {
  model: string;
  system: string;
  prompt: string;
  tools: LoopTool[];
  /** Adds Claude's memory tool, backed by memory_files. */
  memory?: boolean;
  outputFormat?: Anthropic.JSONOutputFormat;
  effort?: Anthropic.OutputConfig["effort"];
  maxTurns?: number;
  onToolCall?(event: LoopEvent): void;
}

export interface LoopResult {
  message: Anthropic.Message;
  turns: number;
  usage: { inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheCreationTokens: number };
}

export async function runToolLoop(client: Anthropic, options: LoopOptions): Promise<LoopResult> {
  const { model, system, prompt, tools, memory, outputFormat, effort = "medium", maxTurns = 12, onToolCall } = options;
  const byName = new Map(tools.map((t) => [t.definition.name, t]));
  const toolDefs: Anthropic.ToolUnion[] = [...tools.map((t) => t.definition), ...(memory ? [MEMORY_TOOL] : [])];
  const messages: Anthropic.MessageParam[] = [{ role: "user", content: prompt }];
  const usage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0 };

  for (let turn = 1; turn <= maxTurns; turn++) {
    // 1. Ask. The tools and system prompt never change between turns, and
    // the conversation only grows at the end, so the automatic cache
    // breakpoint lets every turn after the first read the earlier ones
    // from the cache.
    const response = await client.messages.create({
      model,
      max_tokens: 16000,
      system,
      tools: toolDefs,
      messages,
      cache_control: { type: "ephemeral" },
      output_config: { effort, ...(outputFormat ? { format: outputFormat } : {}) },
    });
    usage.inputTokens += response.usage.input_tokens;
    usage.outputTokens += response.usage.output_tokens;
    usage.cacheReadTokens += response.usage.cache_read_input_tokens ?? 0;
    usage.cacheCreationTokens += response.usage.cache_creation_input_tokens ?? 0;

    if (response.stop_reason === "refusal") throw new Error(`Refused (${response.stop_details?.category ?? "no category"})`);
    if (response.stop_reason === "max_tokens") throw new Error("Hit max_tokens before finishing");

    // 3. No tool calls left: this is the answer. The whole content goes
    // back into the history either way, thinking blocks included, as the
    // API requires.
    messages.push({ role: "assistant", content: response.content });
    const calls = response.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
    if (response.stop_reason !== "tool_use" || calls.length === 0) {
      return { message: response, turns: turn, usage };
    }

    // 2. Run every requested tool and return all results together. A tool
    // that fails reports the failure to Claude (is_error) instead of
    // aborting the loop, so Claude can try something else.
    const results: Anthropic.ToolResultBlockParam[] = [];
    for (const call of calls) {
      let content: string;
      let isError = false;
      try {
        if (call.name === MEMORY_TOOL.name) {
          content = await runMemoryCommand(call.input as MemoryCommand);
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
    messages.push({ role: "user", content: results });
  }
  throw new Error(`No answer after ${maxTurns} turns`);
}

/** The text of a loop's final message. */
export function finalText(message: Anthropic.Message): string {
  return message.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
}
