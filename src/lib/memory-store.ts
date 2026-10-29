// The backend for Claude's memory tool (`memory_20250818`), kept in the
// memory_files table instead of on disk. Claude sees a small file tree
// under /memories and edits it with the tool's six commands; this module
// carries those commands out. The recommender reads it, and the feedback
// command lets Claude file what the owner says ("Telegraph Hill is perfect
// for Stunning days") as preferences.

import type Anthropic from "@anthropic-ai/sdk";
import { asc, eq, like } from "drizzle-orm";
import { db } from "@/db";
import { memoryFiles } from "@/db/schema";

export type MemoryCommand = Anthropic.Beta.BetaMemoryTool20250818Command;

const ROOT = "/memories";

/** Thrown for anything Claude asked that can't be done; its message goes back as an error tool result. */
export class MemoryError extends Error {}

/** Normalises a path and keeps it inside /memories. */
function resolvePath(path: string): string {
  const parts: string[] = [];
  for (const part of path.split("/")) {
    if (part === "" || part === ".") continue;
    if (part === "..") throw new MemoryError(`Path ${path} leaves ${ROOT}`);
    parts.push(part);
  }
  const resolved = `/${parts.join("/")}`;
  if (resolved !== ROOT && !resolved.startsWith(`${ROOT}/`)) {
    throw new MemoryError(`Paths must be inside ${ROOT}, got ${path}`);
  }
  return resolved;
}

async function readFile(path: string): Promise<string | null> {
  const [row] = await db.select().from(memoryFiles).where(eq(memoryFiles.path, path)).limit(1);
  return row?.content ?? null;
}

async function writeFile(path: string, content: string): Promise<void> {
  await db
    .insert(memoryFiles)
    .values({ path, content, updatedAt: new Date() })
    .onConflictDoUpdate({ target: memoryFiles.path, set: { content, updatedAt: new Date() } });
}

async function filesUnder(dir: string) {
  return db
    .select()
    .from(memoryFiles)
    .where(like(memoryFiles.path, `${dir}/%`))
    .orderBy(asc(memoryFiles.path));
}

function numbered(content: string, range?: number[]): string {
  const lines = content.split("\n");
  const [start, end] = range && range.length === 2 ? range : [1, lines.length];
  const last = end === -1 ? lines.length : end;
  return lines
    .slice(start - 1, last)
    .map((line, i) => `${String(start + i).padStart(6)}\t${line}`)
    .join("\n");
}

/** Runs one memory command and returns the text Claude sees. */
export async function runMemoryCommand(command: MemoryCommand): Promise<string> {
  switch (command.command) {
    case "view": {
      const path = resolvePath(command.path);
      const content = await readFile(path);
      if (content != null) return numbered(content, command.view_range);
      const files = await filesUnder(path);
      if (files.length === 0 && path !== ROOT) throw new MemoryError(`${path} does not exist`);
      if (files.length === 0) return `${ROOT} is empty.`;
      return [`Files in ${path}:`, ...files.map((f) => `- ${f.path} (${f.content.length} chars)`)].join("\n");
    }
    case "create": {
      const path = resolvePath(command.path);
      if (path === ROOT) throw new MemoryError(`${ROOT} is a directory`);
      await writeFile(path, command.file_text);
      return `Saved ${path}.`;
    }
    case "str_replace": {
      const path = resolvePath(command.path);
      const content = await readFile(path);
      if (content == null) throw new MemoryError(`${path} does not exist`);
      const count = content.split(command.old_str).length - 1;
      if (count !== 1) {
        throw new MemoryError(`old_str must appear exactly once in ${path}; it appears ${count} times`);
      }
      await writeFile(path, content.replace(command.old_str, command.new_str));
      return `Edited ${path}.`;
    }
    case "insert": {
      const path = resolvePath(command.path);
      const content = await readFile(path);
      if (content == null) throw new MemoryError(`${path} does not exist`);
      const lines = content.split("\n");
      if (command.insert_line < 0 || command.insert_line > lines.length) {
        throw new MemoryError(`insert_line must be between 0 and ${lines.length}`);
      }
      lines.splice(command.insert_line, 0, command.insert_text);
      await writeFile(path, lines.join("\n"));
      return `Inserted into ${path} at line ${command.insert_line}.`;
    }
    case "delete": {
      const path = resolvePath(command.path);
      if (path === ROOT) throw new MemoryError(`Won't delete ${ROOT} itself`);
      const removed = await db.delete(memoryFiles).where(eq(memoryFiles.path, path)).returning();
      const removedUnder = await db.delete(memoryFiles).where(like(memoryFiles.path, `${path}/%`)).returning();
      if (removed.length + removedUnder.length === 0) throw new MemoryError(`${path} does not exist`);
      return `Deleted ${path}.`;
    }
    case "rename": {
      const from = resolvePath(command.old_path);
      const to = resolvePath(command.new_path);
      const content = await readFile(from);
      if (content == null) throw new MemoryError(`${from} does not exist`);
      if ((await readFile(to)) != null) throw new MemoryError(`${to} already exists`);
      await writeFile(to, content);
      await db.delete(memoryFiles).where(eq(memoryFiles.path, from));
      return `Renamed ${from} to ${to}.`;
    }
  }
  throw new MemoryError(`Unknown memory command ${(command as { command?: string }).command}`);
}

/** Every memory file, for the calibration report and for debugging. */
export async function allMemories(): Promise<{ path: string; content: string }[]> {
  return db.select({ path: memoryFiles.path, content: memoryFiles.content }).from(memoryFiles).orderBy(asc(memoryFiles.path));
}
