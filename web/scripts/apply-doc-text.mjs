// Refreshes the excerpts in public/data/docs.json from the full-text archive produced by
// pipeline/docs/extract_text.py (TEXT_DIR/index.json + <id>.txt), and records the extraction
// method per document so the app can mark OCR'd text. Idempotent; run after extract_text.py.
import { readFile, rename, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const OUT = new URL('../public/data/docs.json', import.meta.url);
const TEXT_DIR = process.env.TEXT_DIR ?? '/media/pc/ext4TB/AiMar/docs/text';
const EXCERPT_CHARS = 500;
const norm = (s) => s.replace(/\s+/g, ' ').trim();

const docs = JSON.parse(await readFile(OUT, 'utf8'));
const index = JSON.parse(await readFile(join(TEXT_DIR, 'index.json'), 'utf8'));
let updated = 0;
for (const list of Object.values(docs.docs)) {
  for (const d of list) {
    const rec = index[d.id];
    if (!rec || rec.method === 'failed') continue;
    const text = norm(await readFile(join(TEXT_DIR, `${d.id}.txt`), 'utf8').catch(() => ''));
    const excerpt = text.slice(0, EXCERPT_CHARS);
    if (excerpt !== d.excerpt || d.method !== rec.method) {
      d.excerpt = excerpt;
      d.method = rec.method;
      d.chars = rec.chars;
      updated++;
    }
  }
}
docs.textRetrieved = new Date().toISOString();
const tmp = fileURLToPath(OUT) + '.tmp';
await writeFile(tmp, JSON.stringify(docs));
await rename(tmp, fileURLToPath(OUT)); // atomic replace: a reader or a second writer never sees a partial file
console.log(`docs.json: ${updated} documents updated from ${TEXT_DIR}`);
