// Documents published on eInnsyn for the entries in cases.json: downloads each file
// (PDFs, mostly county governors), keeps the originals under DOCS_DIR (default: a
// scratch directory; locally the external drive), extracts the first EXCERPT_CHARS
// characters of text with pdftotext, and writes public/data/docs.json
//   { retrieved, bytes, docs: { <entry id>: [{ id, title, format, bytes, excerpt }] } }
// Runs are incremental: entries already in docs.json are not looked up again.
//   DOCS_DIR=/media/pc/ext4TB/AiMar/docs/einnsyn node scripts/fetch-docs.mjs
//   --refresh-meta re-reads the entries that already have documents to pick up title, document
//   number and main-document/attachment role, without downloading anything again.
import { execFile } from 'node:child_process';
import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { setDefaultAutoSelectFamilyAttemptTimeout } from 'node:net';
// Node gives each address family 250 ms by default; slow hosts (api.einnsyn.no) then fail with ETIMEDOUT while curl succeeds.
setDefaultAutoSelectFamilyAttemptTimeout(10000);

const OUT = new URL('../public/data/', import.meta.url);
/** Harvester bookkeeping (entries looked up, files still pending) lives outside public/ so it is not served or precached. */
const STATE = new URL('../data-state/docs-state.json', import.meta.url);
const API = 'https://api.einnsyn.no';
const EXCERPT_CHARS = 500;
const DOCS_DIR = process.env.DOCS_DIR ?? join(tmpdir(), 'aimar-docs');
const run = promisify(execFile);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** `maxAttempts` is low for downloads: some archives (e.g. Miljødirektoratet) answer 502 through the
 *  eInnsyn proxy every time, and a failed file simply stays pending for a later run. */
async function fetchRetry(url, attempt = 0, maxAttempts = 8) {
  let res;
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(120000) });
  } catch (e) {
    if (attempt >= maxAttempts) throw e;
    await sleep(Math.min(5000 * 2 ** attempt, 120000));
    return fetchRetry(url, attempt + 1, maxAttempts);
  }
  if (res.status === 429 || res.status >= 500) {
    if (attempt >= maxAttempts) throw new Error(`${url}: HTTP ${res.status}`);
    await sleep(Math.min(5000 * 2 ** attempt, 120000));
    return fetchRetry(url, attempt + 1, maxAttempts);
  }
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res;
}

await mkdir(DOCS_DIR, { recursive: true });
const cases = JSON.parse(await readFile(new URL('cases.json', OUT), 'utf8'));
const prev = await readFile(new URL('docs.json', OUT), 'utf8').then(JSON.parse, () => ({ docs: {} }));
const state = await readFile(STATE, 'utf8').then(JSON.parse, () => ({ seen: prev.seen ?? [], pending: prev.pending ?? [] }));
const docs = prev.docs ?? {};
const seen = new Set(state.seen ?? []); // entry ids already looked up (with or without documents)
let pending = state.pending ?? []; // documents found but not yet fetched (checkpoint)
const refreshMeta = process.argv.includes('--refresh-meta');
const todo = refreshMeta ? Object.keys(docs) : cases.entries.map((e) => e.id).filter((id) => !seen.has(id));
async function save() {
  for (const k of Object.keys(docs)) docs[k] = [...new Map(docs[k].map((x) => [x.id, x])).values()];
  let total = 0;
  for (const list of Object.values(docs)) for (const x of list) total += x.bytes;
  const target = fileURLToPath(new URL('docs.json', OUT));
  await writeFile(target + '.tmp', JSON.stringify({ retrieved: new Date().toISOString(), bytes: total, docs }));
  await rename(target + '.tmp', target); // atomic replace
  await mkdir(new URL('.', STATE), { recursive: true });
  await writeFile(STATE, JSON.stringify({ seen: [...seen], pending }));
  return total;
}
console.log(`${todo.length} entries to look up (${seen.size} already known, ${Object.keys(docs).length} with documents)`);

// ---- find document objects, 100 entries per call
const found = [...pending]; // { entry, id, title, format }
for (let i = 0; i < todo.length; i += 100) {
  const batch = todo.slice(i, i + 100);
  const url = `${API}/search?${batch.map((id) => `ids=${id}`).join('&')}&limit=100&expand=dokumentbeskrivelse&expand=dokumentbeskrivelse.dokumentobjekt`;
  const data = await (await fetchRetry(url)).json();
  for (const it of data.items) {
    for (const db of it.dokumentbeskrivelse ?? []) {
      if (typeof db === 'string') continue;
      for (const o of db.dokumentobjekt ?? []) {
        if (typeof o === 'string') continue;
        // Structure inside a journal entry: document number, and main document versus attachment.
        const role = /hoveddokument/i.test(db.tilknyttetRegistreringSom ?? '') ? 'main' : 'attachment';
        found.push({ entry: it.id, id: o.id, title: db.tittel ?? '', format: (o.format ?? '').toUpperCase(), no: db.dokumentnummer ?? null, role });
      }
    }
  }
  for (const id of batch) seen.add(id);
  if ((i / 100) % 50 === 49) {
    pending = found;
    await save();
  }
  if ((i / 100) % 50 === 0) console.log(`  ${Math.min(i + 100, todo.length)}/${todo.length} entries scanned, ${found.length} documents found`);
  await sleep(150);
}
if (refreshMeta) {
  // Update what is already stored (title, number, role), then keep only genuinely missing files pending.
  const byId = new Map(found.map((d) => [d.id, d]));
  let updated = 0;
  for (const list of Object.values(docs)) {
    for (const d of list) {
      const f = byId.get(d.id);
      if (!f) continue;
      if (d.no !== f.no || d.role !== f.role || d.title !== f.title) updated++;
      d.title = f.title;
      d.no = f.no;
      d.role = f.role;
    }
  }
  for (const list of Object.values(docs)) list.sort((a, b) => (a.no ?? 99) - (b.no ?? 99) || a.title.localeCompare(b.title, 'nb'));
  const have = new Set(Object.values(docs).flatMap((l) => l.map((d) => d.id)));
  found.length = 0;
  for (const [id, d] of byId) if (!have.has(id)) found.push(d);
  console.log(`refresh-meta: ${updated} documents updated, ${found.length} still missing`);
}
pending = found;
await save();
console.log(`${found.length} documents to fetch`);

// ---- download, keep, extract
const norm = (s) => s.replace(/\s+/g, ' ').trim();
let bytes = 0;
let done = 0;
for (const d of found) {
  const ext = d.format === 'PDF' ? 'pdf' : d.format.toLowerCase() || 'bin';
  const file = join(DOCS_DIR, `${d.id}.${ext}`);
  try {
    let size = await stat(file).then((s) => s.size, () => 0);
    if (!size) {
      const res = await fetchRetry(`${API}/dokumentobjekt/${d.id}/download`, 0, 1);
      const buf = Buffer.from(await res.arrayBuffer());
      await writeFile(file, buf);
      size = buf.length;
      await sleep(150);
    }
    let excerpt = '';
    if (ext === 'pdf') {
      const { stdout } = await run('pdftotext', ['-l', '3', '-enc', 'UTF-8', file, '-'], { maxBuffer: 16 * 1024 * 1024 }).catch(() => ({ stdout: '' }));
      excerpt = norm(stdout).slice(0, EXCERPT_CHARS);
    }
    (docs[d.entry] ??= []).push({ id: d.id, title: d.title, format: d.format, bytes: size, excerpt, no: d.no ?? null, role: d.role ?? null });
    bytes += size;
    pending = pending.filter((x) => x.id !== d.id);
  } catch (err) {
    console.warn(`${d.id}: ${err.message}`);
  }
  if (++done % 100 === 0) {
    await save();
    console.log(`  ${done}/${found.length} documents, ${(bytes / 1e6).toFixed(0)} MB`);
  }
}
const total = await save();
console.log(`docs.json: ${Object.values(docs).reduce((n, l) => n + l.length, 0)} documents for ${Object.keys(docs).length} entries, ${(total / 1e6).toFixed(0)} MB kept under ${DOCS_DIR}`);
