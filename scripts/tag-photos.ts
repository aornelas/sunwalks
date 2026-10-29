// Tags every photo that has no tags yet, or tags from an older prompt
// version (see src/lib/tagging.ts). By default it sends one Message Batch
// (half price, usually done within the hour) and waits for it; `--sync`
// tags photo by photo with the regular Messages API instead, which is
// quicker for a handful. `--limit N` caps how many photos a run takes on.
//
// Safe to re-run: tagged photos are skipped, and an unfinished batch from an
// earlier run is resumed rather than resubmitted. A run with nothing left
// to tag makes no API calls.
import "dotenv/config";
import Anthropic from "@anthropic-ai/sdk";
import { eq } from "drizzle-orm";
import { db } from "../src/db";
import { taggingBatches } from "../src/db/schema";
import { getPlaces } from "../src/lib/data";
import { getPhotoSource } from "../src/lib/photo-source";
import {
  TAG_PROMPT_VERSION,
  UsageTally,
  buildTagRequest,
  ensureUploaded,
  parseTagResponse,
  pendingPhotos,
  saveTag,
  tagPhoto,
  taggingModel,
} from "../src/lib/tagging";

const POLL_MS = 30_000;

function parseArgs() {
  const args = process.argv.slice(2);
  const limitIdx = args.indexOf("--limit");
  const limit = limitIdx >= 0 ? Number(args[limitIdx + 1]) : Infinity;
  if (Number.isNaN(limit) || limit < 1) throw new Error("--limit takes a positive number");
  return { sync: args.includes("--sync"), limit };
}

async function waitForBatch(client: Anthropic, batchId: string) {
  for (;;) {
    const batch = await client.messages.batches.retrieve(batchId);
    if (batch.processing_status === "ended") return batch;
    const c = batch.request_counts;
    console.log(`  batch ${batchId}: ${c.processing} processing, ${c.succeeded} succeeded, ${c.errored} errored`);
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  }
}

/** Saves a finished batch's results. Idempotent, so an interrupted ingest can simply run again. */
async function ingestBatch(client: Anthropic, row: typeof taggingBatches.$inferSelect, tally: UsageTally) {
  await waitForBatch(client, row.id);
  let failed = 0;
  for await (const result of await client.messages.batches.results(row.id)) {
    const photoId = row.photoIds[Number(result.custom_id.slice(1))];
    if (result.result.type !== "succeeded") {
      failed++;
      console.warn(`  ${photoId}: ${result.result.type}`);
      continue;
    }
    try {
      const { tag, usage } = parseTagResponse(result.result.message);
      await saveTag(photoId, tag, usage, {
        model: result.result.message.model,
        batchId: row.id,
        // A batch resumed after a prompt bump still holds the old version's answers.
        promptVersion: row.promptVersion,
      });
      tally.add(usage);
    } catch (err) {
      failed++;
      console.warn(`  ${photoId}: ${err instanceof Error ? err.message : err}`);
    }
  }
  await db.update(taggingBatches).set({ status: "ended", endedAt: new Date() }).where(eq(taggingBatches.id, row.id));
  console.log(`Batch ${row.id} ingested: ${row.photoIds.length - failed} tagged, ${failed} failed (they stay pending for the next run).`);
}

async function main() {
  const { sync, limit } = parseArgs();
  const client = new Anthropic();
  const source = getPhotoSource();
  const tally = new UsageTally();

  const unfinished = await db.select().from(taggingBatches).where(eq(taggingBatches.status, "in_progress"));
  for (const row of unfinished) {
    console.log(`Resuming batch ${row.id} from ${row.createdAt.toISOString()} (${row.photoIds.length} photos)…`);
    await ingestBatch(client, row, tally);
  }

  const pending = (await pendingPhotos()).slice(0, limit);
  if (pending.length === 0) {
    console.log(unfinished.length > 0 ? `Done. ${tally.summary()}` : `Nothing to tag: every photo has ${TAG_PROMPT_VERSION} tags.`);
    process.exit(0);
  }

  // Passed so suggestions reuse the owner's names instead of inventing near-duplicates.
  const places = await getPlaces();
  console.log(`Tagging ${pending.length} photos with ${taggingModel()} (${TAG_PROMPT_VERSION}, ${sync ? "one by one" : "one batch"})…`);

  if (sync) {
    let failed = 0;
    for (const photo of pending) {
      try {
        const { tag, usage } = await tagPhoto(client, source, photo, places);
        tally.add(usage);
        console.log(
          `  ${photo.id}: ${tag.observed_category} (${tag.category_confidence}), drama ${tag.drama}, ` +
            `cache read ${usage.cacheReadTokens}, write ${usage.cacheCreationTokens}`,
        );
      } catch (err) {
        failed++;
        console.warn(`  ${photo.id}: ${err instanceof Error ? err.message : err}`);
      }
    }
    console.log(`Tagged ${pending.length - failed}, failed ${failed}.`);
  } else {
    const requests: Anthropic.Messages.BatchCreateParams.Request[] = [];
    for (const [i, photo] of pending.entries()) {
      // custom_id allows only [a-zA-Z0-9_-]{1,64}, which a source's photo
      // ids needn't satisfy, so it indexes into the stored photoIds instead.
      requests.push({ custom_id: `p${i}`, params: buildTagRequest(await ensureUploaded(client, source, photo), places) });
    }
    const batch = await client.messages.batches.create({ requests });
    const [row] = await db
      .insert(taggingBatches)
      .values({ id: batch.id, promptVersion: TAG_PROMPT_VERSION, model: taggingModel(), photoIds: pending.map((p) => p.id) })
      .returning();
    console.log(`Submitted batch ${batch.id}. Waiting for it to finish (safe to interrupt and re-run)…`);
    await ingestBatch(client, row, tally);
  }

  console.log(`Usage: ${tally.summary()}`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
