// Copies the extracted document texts into public/data/text/<id>.txt so the app can show the whole
// document, and flags the documents that have text in docs.json. Texts are capped at CAP characters
// (15 of 3 621 documents are longer). Idempotent: unchanged files are left alone.
import { mkdir, readFile, readdir, rename, stat, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const OUT = new URL('../public/data/', import.meta.url);
const TEXT_DIR = process.env.TEXT_DIR ?? '/media/pc/ext4TB/AiMar/docs/text';
const DEST = fileURLToPath(new URL('text/', OUT));
const CAP = 200_000;

await mkdir(DEST, { recursive: true });
const index = JSON.parse(await readFile(join(TEXT_DIR, 'index.json'), 'utf8'));
const docsPath = fileURLToPath(new URL('docs.json', OUT));
const docs = JSON.parse(await readFile(docsPath, 'utf8'));

const existing = new Set(await readdir(DEST).catch(() => []));
let copied = 0;
let skipped = 0;
let flagged = 0;
const withText = new Set();
for (const [id, rec] of Object.entries(index)) {
  if (rec.method === 'failed' || !rec.chars) continue;
  const src = join(TEXT_DIR, `${id}.txt`);
  const text = await readFile(src, 'utf8').catch(() => null);
  if (!text?.trim()) continue;
  withText.add(id);
  // A .txt is served without a charset, so browsers fall back to windows-1252; the BOM keeps it UTF-8.
  const body = `\uFEFF${text.length > CAP ? `${text.slice(0, CAP)}\n\n… [${text.length - CAP} tegn til i originalen / more characters in the original]` : text}`;
  const target = join(DEST, `${id}.txt`);
  const same = existing.has(`${id}.txt`) && (await stat(target)).size === Buffer.byteLength(body);
  if (same) {
    skipped++;
    continue;
  }
  await writeFile(`${target}.tmp`, body);
  await rename(`${target}.tmp`, target);
  copied++;
}
for (const list of Object.values(docs.docs)) {
  for (const d of list) {
    const has = withText.has(d.id);
    if (!!d.text !== has) flagged++;
    d.text = has || undefined;
  }
}
await writeFile(`${docsPath}.tmp`, JSON.stringify(docs));
await rename(`${docsPath}.tmp`, docsPath);
console.log(`text/: ${copied} written, ${skipped} unchanged, ${withText.size} documents with text; docs.json flags updated on ${flagged}`);
