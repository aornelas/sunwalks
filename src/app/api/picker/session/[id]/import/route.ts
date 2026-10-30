import { after, NextResponse } from "next/server";
import { todayDayKey } from "@/lib/dates";
import { env } from "@/lib/env";
import { requireOwner } from "@/lib/require-owner";
import { importFromPickerSession } from "@/lib/ingest";
import { configuredBotApi, followUpWebImport } from "@/lib/walk-buddy";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const unauthorized = await requireOwner();
  if (unauthorized) return unauthorized;

  const { id } = await params;
  try {
    const { photosAdded, touchedDays } = await importFromPickerSession(id);
    // A sunrise photo picked here still needs a place and rating; the walk
    // buddy asks for them, after the response, when it's switched on.
    const api = configuredBotApi();
    const chatId = env.telegramChatId;
    if (api && chatId && photosAdded > 0) {
      after(() =>
        followUpWebImport({ api, chatId }, touchedDays, todayDayKey(env.timezone)).catch((err) =>
          console.error("Couldn't follow up the web import:", err),
        ),
      );
    }
    return NextResponse.json({ ok: true, photosAdded, touchedDays });
  } catch (err) {
    console.error("Failed to import picker session", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Import failed" },
      { status: 500 },
    );
  }
}
