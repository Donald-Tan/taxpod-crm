/**
 * Page-aware chunking. Each PDF page is chunked on its own so every chunk has
 * exactly one page number, which is what makes page-level citations exact.
 */

export interface Chunk {
  page_number: number;
  section: string | null;
  content: string;
}

export const CHUNK_SIZE = 2000; // characters, roughly 500 tokens
export const CHUNK_OVERLAP = 200; // characters carried into the next chunk
const MIN_CHUNK = 80; // drop fragments such as bare page numbers

/** Collapse PDF extraction noise without destroying paragraph breaks. */
export function cleanPageText(text: string): string {
  return text
    .replace(/ /g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/ ?\n ?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// Numbered headings such as "2.3.1 Pre-Submission" or "11. PROFIT DISTRIBUTION".
const HEADING = /^(\d{1,2}(?:\.\d{1,2}){0,3})\.?\s+([A-Z][^\n]{3,90})$/;

function findHeading(text: string): string | null {
  let last: string | null = null;
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    // Skip table-of-contents lines ("2.3 Title ........ 19").
    if (/\.{4,}/.test(line)) continue;
    const match = HEADING.exec(line);
    if (match && !/[.;,]$/.test(line)) last = `${match[1]} ${match[2].trim()}`;
  }
  return last;
}

/** Split text into pieces of at most CHUNK_SIZE, preferring paragraph then sentence breaks. */
function splitText(text: string): string[] {
  if (text.length <= CHUNK_SIZE) return [text];
  const pieces: string[] = [];
  let start = 0;
  while (start < text.length) {
    let end = Math.min(start + CHUNK_SIZE, text.length);
    if (end < text.length) {
      const window = text.slice(start, end);
      const half = CHUNK_SIZE * 0.5;
      const paragraph = window.lastIndexOf("\n\n");
      const sentence = Math.max(window.lastIndexOf(". "), window.lastIndexOf(".\n"));
      const line = window.lastIndexOf("\n");
      if (paragraph > half) end = start + paragraph;
      else if (sentence > half) end = start + sentence + 1;
      else if (line > half) end = start + line;
    }
    pieces.push(text.slice(start, end).trim());
    if (end >= text.length) break;
    start = Math.max(end - CHUNK_OVERLAP, start + 1);
    // Do not start the overlap in the middle of a word.
    const nextSpace = text.slice(start, end).search(/\s/);
    if (nextSpace > 0) start += nextSpace + 1;
  }
  return pieces.filter(Boolean);
}

export function chunkPages(pages: string[]): Chunk[] {
  const chunks: Chunk[] = [];
  let currentSection: string | null = null;

  pages.forEach((rawPage, index) => {
    const page = cleanPageText(rawPage);
    if (page.length < MIN_CHUNK) return;
    for (const piece of splitText(page)) {
      if (piece.length < MIN_CHUNK) continue;
      // A heading inside this piece wins; otherwise inherit the last one seen.
      const heading = findHeading(piece);
      chunks.push({ page_number: index + 1, section: heading ?? currentSection, content: piece });
      if (heading) currentSection = heading;
    }
  });

  return chunks;
}
