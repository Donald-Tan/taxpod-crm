/**
 * `npm run ingest`: download -> parse -> chunk -> embed -> store.
 *
 *   npm run ingest                  ingest every document not yet in the database
 *   npm run ingest -- --force       re-ingest everything
 *   npm run ingest -- --only <slug> ingest (or re-ingest) one document
 *
 * Re-ingesting a document deletes its old chunks first, so the script is safe
 * to run repeatedly.
 */
import "./env";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { extractText, getDocumentProxy } from "unpdf";
import { chunkPages, type Chunk } from "../src/lib/chunking";
import { embedTexts } from "../src/lib/gemini";
import { db } from "../src/lib/supabase";
import { DOCUMENTS, type SourceDocument } from "./documents";

const DOCS_DIR = path.join(process.cwd(), "data", "docs");
const EMBED_BATCH = 20; // texts per embedding request
const BATCH_PAUSE_MS = 4000; // stay under free-tier tokens-per-minute limits
const INSERT_BATCH = 100;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function loadPdf(doc: SourceDocument): Promise<Uint8Array> {
  const file = path.join(DOCS_DIR, `${doc.slug}.pdf`);
  if (!existsSync(file)) {
    if (!doc.url) {
      throw new Error(`No URL for "${doc.slug}". Save the PDF as data/docs/${doc.slug}.pdf and re-run.`);
    }
    console.log(`  downloading ${doc.url}`);
    const res = await fetch(doc.url, {
      // Some government sites reject requests without a browser-like user agent.
      headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/126 Safari/537.36" },
      redirect: "follow",
    });
    if (!res.ok) {
      throw new Error(
        `Download failed (${res.status}). Open ${doc.url} in a browser, save it as data/docs/${doc.slug}.pdf and re-run.`,
      );
    }
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (new TextDecoder().decode(bytes.slice(0, 5)) !== "%PDF-") {
      throw new Error(
        `The server did not return a PDF. Open ${doc.url} in a browser, save it as data/docs/${doc.slug}.pdf and re-run.`,
      );
    }
    await mkdir(DOCS_DIR, { recursive: true });
    await writeFile(file, bytes);
  }
  return new Uint8Array(await readFile(file));
}

async function parsePdf(bytes: Uint8Array): Promise<string[]> {
  const pdf = await getDocumentProxy(bytes);
  const { text } = await extractText(pdf, { mergePages: false });
  return text;
}

async function embedChunks(chunks: Chunk[], doc: SourceDocument): Promise<number[][]> {
  const vectors: number[][] = [];
  for (let i = 0; i < chunks.length; i += EMBED_BATCH) {
    const batch = chunks.slice(i, i + EMBED_BATCH);
    // Prefix the document title so each chunk carries its own context
    // ("which ruling is this from?") into the embedding.
    const inputs = batch.map((c) => `${doc.title}${c.section ? ` | ${c.section}` : ""}\n\n${c.content}`);
    vectors.push(...(await embedTexts(inputs, "RETRIEVAL_DOCUMENT")));
    process.stdout.write(`\r  embedded ${Math.min(i + EMBED_BATCH, chunks.length)}/${chunks.length} chunks`);
    if (i + EMBED_BATCH < chunks.length) await sleep(BATCH_PAUSE_MS);
  }
  process.stdout.write("\n");
  return vectors;
}

async function ingest(doc: SourceDocument, force: boolean): Promise<"ingested" | "skipped"> {
  const supabase = db();
  const { data: existing, error: lookupError } = await supabase
    .from("documents")
    .select("id")
    .eq("slug", doc.slug)
    .maybeSingle();
  if (lookupError) throw new Error(lookupError.message);
  if (existing && !force) return "skipped";

  const pages = await parsePdf(await loadPdf(doc));
  const chunks = chunkPages(pages);
  console.log(`  ${pages.length} pages -> ${chunks.length} chunks`);
  if (chunks.length === 0) {
    throw new Error("No text extracted. The PDF may be scanned images, which this pipeline does not OCR.");
  }

  // Embed before touching the database, so a failed embedding run leaves the
  // previously ingested version intact.
  const vectors = await embedChunks(chunks, doc);

  if (existing) {
    const { error } = await supabase.from("documents").delete().eq("id", existing.id); // cascades to chunks
    if (error) throw new Error(error.message);
  }
  const { data: inserted, error: insertError } = await supabase
    .from("documents")
    .insert({
      slug: doc.slug,
      title: doc.title,
      category: doc.category,
      source_url: doc.url ?? null,
      page_count: pages.length,
    })
    .select("id")
    .single();
  if (insertError) throw new Error(insertError.message);

  const rows = chunks.map((c, i) => ({
    document_id: inserted.id,
    chunk_index: i,
    page_number: c.page_number,
    section: c.section,
    content: c.content,
    embedding: JSON.stringify(vectors[i]),
  }));
  for (let i = 0; i < rows.length; i += INSERT_BATCH) {
    const { error } = await supabase.from("document_chunks").insert(rows.slice(i, i + INSERT_BATCH));
    if (error) {
      // Do not leave a half-ingested document behind.
      await supabase.from("documents").delete().eq("id", inserted.id);
      throw new Error(error.message);
    }
  }
  return "ingested";
}

async function main() {
  const args = process.argv.slice(2);
  const force = args.includes("--force");
  const onlyIndex = args.indexOf("--only");
  const only = onlyIndex >= 0 ? args[onlyIndex + 1] : null;

  const docs = only ? DOCUMENTS.filter((d) => d.slug === only) : DOCUMENTS;
  if (docs.length === 0) {
    console.error(`Unknown slug "${only}". Known: ${DOCUMENTS.map((d) => d.slug).join(", ")}`);
    process.exit(1);
  }

  let failed = 0;
  for (const doc of docs) {
    console.log(`\n${doc.title} [${doc.slug}]`);
    try {
      const result = await ingest(doc, force || Boolean(only));
      console.log(result === "skipped" ? "  already ingested (use --force to redo)" : "  done");
    } catch (err) {
      failed++;
      console.error(`  FAILED: ${(err as Error).message}`);
    }
  }

  const { count } = await db().from("document_chunks").select("*", { count: "exact", head: true });
  const { count: docCount } = await db().from("documents").select("*", { count: "exact", head: true });
  console.log(`\nKnowledge base: ${docCount ?? 0} documents, ${count ?? 0} chunks.`);
  if (failed > 0) {
    console.error(`${failed} document(s) failed. See messages above.`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
