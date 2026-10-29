// Files what the owner says about their walks ("Telegraph Hill is perfect
// for Stunning days") as preferences in Claude's memory, where the
// recommender reads them. Claude does the filing with the memory tool, so
// a new remark can sharpen or replace an old one instead of piling up.

import { readFileSync } from "node:fs";
import path from "node:path";
import type Anthropic from "@anthropic-ai/sdk";
import { recommendModel } from "./recommend";
import { finalText, runToolLoop, type LoopEvent } from "./tool-loop";

export const FEEDBACK_PROMPT_VERSION = "file-feedback/v1";

let systemPrompt: string | null = null;

export async function fileFeedback(
  client: Anthropic,
  feedback: string,
  onToolCall?: (event: LoopEvent) => void,
): Promise<{ summary: string; usage: { inputTokens: number; outputTokens: number; cacheReadTokens: number } }> {
  systemPrompt ??= readFileSync(path.join(process.cwd(), "prompts", `${FEEDBACK_PROMPT_VERSION}.md`), "utf8");
  const { message, usage } = await runToolLoop(client, {
    model: recommendModel(),
    system: systemPrompt,
    prompt: `The owner said: "${feedback}"`,
    tools: [],
    memory: true,
    effort: "low",
    onToolCall,
  });
  return { summary: finalText(message).trim(), usage };
}
