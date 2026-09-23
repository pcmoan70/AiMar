// Aquaculture applications at public inspection, from Norsk lysingsblad.
//
// The coordination regulation (FOR-2010-05-18-708 § 3) makes the applicant announce every
// application the municipality lays out for public inspection in Norsk lysingsblad, so the
// announcements there are the one national list of hearings: who applied for what, at which
// locality, and the deadline for remarks. The documents themselves stay with the municipality.
//
//   node scripts/fetch-hearings.mjs          new announcements since the last run
//   node scripts/fetch-hearings.mjs --full   re-read every announcement found
//
// Writes public/data/hearings.geojson: one feature per notice, placed at the coordinates in the
// notice or else at the register position of the locality it names. Announcements are found
// through the listing's keyword search (several words, union); each page is read once and kept.
import { access, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { setDefaultAutoSelectFamilyAttemptTimeout } from 'node:net';

setDefaultAutoSelectFamilyAttemptTimeout(10000);

const SITE = 'https://norsk.lysingsblad.no';
const LIST = `${SITE}/nb/kunngjeringar/andre-kunngjeringar`;
// Words that appear in the titles of aquaculture hearings; the type field is not searchable.
const WORDS = ['akvakultur', 'lokalitet', 'oppdrett', 'biomasse', 'MTB', 'fortøyning', 'forankring', 'anleggsramme', 'flåte', 'matfisk', 'settefisk', 'skjell', 'tare'];
const OUT = new URL('../public/data/', import.meta.url);
const UA = { 'user-agent': 'AiMar/1.0 (+https://pcmoan70.github.io/AiMar/)' };
const full = process.argv.includes('--full');
// Originals (notice HTML and any attached document) are kept on the archive disk with provenance,
// like the eInnsyn files; the notice text is bundled for the app under data/text/lys_<id>.txt.
const LYS_DIR = process.env.LYS_DIR ?? '/media/pc/ext4TB/AiMar/docs/lysingsblad';
const TEXT_OUT = new URL('../public/data/text/', import.meta.url);
// Attachments sit in their own folder so the text extractor reads only them, not the notice pages.
const archive = await mkdir(`${LYS_DIR}/vedlegg`, { recursive: true }).then(() => true, () => false);
if (!archive) console.warn(`archive dir ${LYS_DIR} not available: notices are not kept, only bundled as text`);
const provenance = archive ? await readFile(`${LYS_DIR}/index.json`, 'utf8').then(JSON.parse, () => ({})) : {};
const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getText(url) {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, { headers: UA });
    if (res.ok) return res.text();
    if (attempt >= 3 || (res.status < 500 && res.status !== 429)) throw new Error(`${url}: HTTP ${res.status}`);
    await sleep(3000 * (attempt + 1));
  }
}

const strip = (s) =>
  s
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#039;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();

/** Rows of one listing page: { id, title, published, place }. */
function parseListing(html) {
  const rows = [];
  for (const tr of html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)) {
    const r = tr[1];
    if (!r.includes('<td')) continue;
    const title = r.match(/views-field-title[^>]*>([\s\S]*?)<\/td>/);
    // The link to the announcement sits in whichever cell carries it, not necessarily the title.
    const id = r.match(/href="[^"]*\/andre-kunngjeringar\/(\d+)"/)?.[1];
    if (!id || !title) continue;
    const date = r.match(/views-field-field-publish-date[^>]*>([\s\S]*?)<\/td>/);
    const place = r.match(/views-field-field-postal-place[^>]*>([\s\S]*?)<\/td>/);
    rows.push({ id, title: strip(title[1]), published: isoDate(strip(date?.[1] ?? '')), place: strip(place?.[1] ?? '') });
  }
  return rows;
}

const MONTHS = { januar: 1, februar: 2, mars: 3, april: 4, mai: 5, juni: 6, juli: 7, august: 8, september: 9, oktober: 10, november: 11, desember: 12 };
/** "22.09.2026" or "20. oktober 2026" -> "2026-10-20"; null when unreadable. */
function isoDate(s) {
  let m = s.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  m = s.match(/(\d{1,2})\.?\s+([a-zæøå]+)\s+(\d{4})/i);
  const mon = m && MONTHS[m[2].toLowerCase()];
  return mon ? `${m[3]}-${String(mon).padStart(2, '0')}-${m[1].padStart(2, '0')}` : null;
}

/** Days after the notice when it says "innen 4 uker / 1 måned fra denne kunngjøringen"; else the stated date. */
function readDeadline(body, published) {
  const rel = body.match(/innen\s+(\d{1,2})\s*(uker|veker|måned(?:er)?|månader)\s+(?:fra|frå|etter)/i);
  if (rel && published) {
    const days = /uke|veke/i.test(rel[2]) ? Number(rel[1]) * 7 : Number(rel[1]) * 30;
    return new Date(new Date(published).getTime() + days * 86400e3).toISOString().slice(0, 10);
  }
  const m = body.match(/(?:innen|frist(?:en)?(?: for [\wæøå ]+?)? er|seinast|senest)\s*:?\s*(\d{1,2}\.?\s*[a-zæøå]+(?:\s+\d{4})?|\d{1,2}\.\d{1,2}\.\d{4})/i);
  if (!m) return null;
  const s = /\d{4}/.test(m[1]) ? m[1] : `${m[1]} ${(published ?? new Date().toISOString()).slice(0, 4)}`;
  return isoDate(s.replace(/(\d)\.?\s*([a-zæøå])/i, '$1 $2'));
}

/** Degrees-decimal-minutes as printed in the announcements: N 66º33.417’ Ø 12º46.672’, or bare 62° 39.853’ 6° 41.865’ */
function coords(text) {
  const m = text.match(/(?:N\s*)?(\d{1,2})\s*[º°]\s*(\d{1,2}[.,]\d+)\s*['’′`]?\s*(?:[ØEO]\s*)?(\d{1,3})\s*[º°]\s*(\d{1,2}[.,]\d+)/i);
  if (!m) return null;
  const dm = (d, min) => Number(d) + Number(min.replace(',', '.')) / 60;
  return [Math.round(dm(m[3], m[4]) * 1e5) / 1e5, Math.round(dm(m[1], m[2]) * 1e5) / 1e5];
}

/** One announcement page -> record, or null when it is not an aquaculture notice. */
function parseItem(id, html) {
  const main = html.match(/<main[\s\S]*?<\/main>/)?.[0] ?? html;
  const field = (name) => {
    const m = main.match(new RegExp(`field--name-${name}[\\s\\S]*?field__item[^>]*>([\\s\\S]*?)</div>`));
    return m ? strip(m[1]) : '';
  };
  const type = field('field-andre-type');
  const text = strip(main.replace(/<(script|style|nav|header|footer)[^>]*>[\s\S]*?<\/\1>/g, ''));
  const body = text.slice(text.indexOf('Kunngjøring') + 'Kunngjøring'.length).trim();
  if (!/akvakultur/i.test(type) && !/akvakultur/i.test(body)) return null;
  const pick = (re) => body.match(re)?.[1]?.trim() ?? null;
  const published = isoDate(field('field-publish-date'));
  const deadline = readDeadline(body, published);
  const lok =
    body.match(/lok(?:alitet(?:snr|snummer|en)?|\.)?\.?\s*(?:nr\.?\s*)?:?\s*\(?(\d{2}\s?\d{3}|\d{4,5})\)?\s*[-–:]?\s*([A-ZÆØÅ][\wÆØÅæøå.\- ]{1,40}?)?(?=\s*(?:,|\.|\))|\s+(?:i|Koordinat|Søkt|Søker|Type)|$)/i) ??
    body.match(/[Ll]okalitet(?:en)?:?\s+(?!nr)([A-ZÆØÅ][\wÆØÅæøå.\- ]{1,40}?)(?=\s+(?:i|,|\.|Koordinat|Søkt|Søker|Type)|$)/);
  const lokNr = lok && /^\d/.test(lok[1]) ? Number(lok[1].replace(/\s/g, '')) : null;
  // A name runs to the first full stop or comma; a stray "i Frøya kommune" is a place, not a name.
  const rawName = (lok ? (lokNr ? lok[2] : lok[1]) : null) ?? '';
  const lokName = rawName.split(/[.,]/)[0].replace(/\s+(Selskapet|Lokaliteten|Søknaden)$/, '').trim();
  return {
    id,
    url: `${LIST}/${id}`,
    type,
    publisher: field('field-proclaim') || null,
    published,
    deadline,
    kommune: pick(/(?:offentlig (?:innsyn|ettersyn|høring)\s+(?:ved|hos|i)\s+|(?:i|hos)\s+)([A-ZÆØÅ][\wÆØÅæøå\- ]{1,30}?)\s+kommune/) ?? pick(/([A-ZÆØÅ][\wÆØÅæøå\- ]{1,30}?)\s+kommune/),
    loknr: lokNr,
    navn: lokName && !/^(i|ved|hos)\s/i.test(lokName) ? lokName : null,
    applicant: pick(/Søker:\s*([^.]{2,80}?)(?=\s+Søknaden|\s+Søkt|\s+Lokalitet|$)/),
    subject: pick(/Søknaden gjelder:\s*([^.]{2,120}?)(?=\s+Søkt|\s+Lokalitet|\s+Koordinat|$)/),
    caseNo: pick(/saksn(?:umme)?r\.?\s*:?\s*(\d{2,4}\/\d{2,6})/i),
    email: body.match(/[\w.+-]+@[\w-]+\.[\w.]+/)?.[0] ?? null,
    // Some municipalities attach the application itself to the notice.
    doc: (() => {
      const m = main.match(/href="([^"]+\.(?:pdf|docx?|zip))"/i);
      return m ? new URL(m[1].replace(/&amp;/g, '&'), SITE).href : null;
    })(),
    coords: coords(body),
    text: body.slice(0, 2000),
    fullText: body,
  };
}

const target = fileURLToPath(new URL('hearings.geojson', OUT));
const prev = await readFile(target, 'utf8').then(JSON.parse, () => ({ features: [], skipped: [] }));
const items = new Map(prev.features.map((f) => [f.properties.id, { ...f.properties, coords: f.properties.placed === 'notice' ? f.geometry?.coordinates : null }]));
const skipped = new Set(prev.skipped ?? []); // announcements read before and found not to be aquaculture

// ---- listing: union of keyword searches, every page of each
const found = new Map();
for (const w of WORDS) {
  for (let page = 0; page < 20; page++) {
    const html = await getText(`${LIST}?combine=${encodeURIComponent(w)}&page=${page}`);
    const rows = parseListing(html);
    for (const r of rows) found.set(r.id, r);
    if (!rows.length || !html.includes(`?page=${page + 1}"`)) break;
    await sleep(300);
  }
  await sleep(300);
}
console.log(`${found.size} announcements match the keywords (${items.size} kept from before)`);

// ---- items: read the new ones
let read = 0;
let kept = 0;
for (const [id, row] of found) {
  if (!full && (items.has(id) || skipped.has(id))) continue;
  const html = await getText(`${LIST}/${id}`);
  read++;
  const h = parseItem(id, html);
  if (!h) {
    skipped.add(id);
    continue;
  }
  h.title = row.title;
  h.place = row.place;
  h.published ??= row.published;
  await keepNotice(id, html, h);
  items.set(id, h);
  kept++;
  await sleep(300);
}

/** Archive the notice and its attachment, and bundle the notice as a text file for the app. */
async function keepNotice(id, html, h) {
  const heading = [h.title, h.type ? `Type: ${h.type}` : null, h.publisher ? `Utlyser: ${h.publisher}` : null, h.published ? `Publisert: ${h.published}` : null, h.place ? `Poststed: ${h.place}` : null, `Kilde: ${h.url}`]
    .filter(Boolean)
    .join('\n');
  const text = `${heading}\n\n${h.fullText ?? h.text}\n`;
  await mkdir(TEXT_OUT, { recursive: true });
  await writeFile(new URL(`lys_${id}.txt`, TEXT_OUT), `\uFEFF${text}`);
  h.text = (h.fullText ?? h.text).slice(0, 2000);
  delete h.fullText;
  h.textFile = true;
  if (!archive) return;
  const rec = { url: h.url, title: h.title, fetchedAt: new Date().toISOString(), html: `${id}.html`, sha256: sha256(html), chars: text.length };
  await writeFile(`${LYS_DIR}/${id}.html`, html);
  if (h.doc) {
    const name = `${id}_${decodeURIComponent(h.doc.split('/').pop() ?? 'vedlegg').replace(/[^\w.\-æøåÆØÅ]/g, '_')}`;
    const path = `${LYS_DIR}/vedlegg/${name}`;
    const have = await access(path).then(() => true, () => false);
    if (!have) {
      try {
        const res = await fetch(h.doc, { headers: UA });
        if (res.ok) {
          const buf = Buffer.from(await res.arrayBuffer());
          await writeFile(path, buf);
          rec.doc = { file: name, url: h.doc, bytes: buf.length, sha256: sha256(buf) };
        } else console.warn(`${h.doc}: HTTP ${res.status}`);
      } catch (err) {
        console.warn(`${h.doc}: ${err.message}`);
      }
    } else rec.doc = { ...(provenance[id]?.doc ?? {}), file: name, url: h.doc };
    h.docFile = rec.doc?.file ?? null;
  }
  provenance[id] = rec;
  await writeFile(`${LYS_DIR}/index.json`, JSON.stringify(provenance, null, 1));
}

const list = [...items.values()].sort((a, b) => (b.published ?? '').localeCompare(a.published ?? '') || b.id.localeCompare(a.id));

// ---- place each notice: its own coordinates, else the register position of the locality it names
const norm = (s) => (s ?? '').toLowerCase().replace(/[^a-zæøå0-9]/g, '');
const localities = JSON.parse(await readFile(new URL('localities.geojson', OUT), 'utf8')).features;
const byNr = new Map(localities.map((f) => [f.properties.loknr, f]));
const byName = new Map(localities.map((f) => [`${norm(f.properties.navn)}|${norm(f.properties.kommune)}`, f]));
const features = list.map(({ coords, ...h }) => {
  const site = (h.loknr && byNr.get(h.loknr)) || (h.navn && h.kommune && byName.get(`${norm(h.navn)}|${norm(h.kommune)}`)) || null;
  const position = coords ?? site?.geometry.coordinates ?? null;
  if (site && !h.loknr) h.loknr = site.properties.loknr;
  return { type: 'Feature', geometry: position ? { type: 'Point', coordinates: position } : null, properties: { ...h, placed: coords ? 'notice' : site ? 'register' : null } };
});
const out = { type: 'FeatureCollection', retrieved: new Date().toISOString(), source: LIST, features, skipped: [...skipped] };
await writeFile(target + '.tmp', JSON.stringify(out));
await rename(target + '.tmp', target);

const manifestUrl = new URL('manifest.json', OUT);
const manifest = JSON.parse(await readFile(manifestUrl, 'utf8'));
manifest.sources = manifest.sources.filter((s) => s.file !== 'hearings.json' && s.file !== 'hearings.geojson');
manifest.sources.push({
  file: 'hearings.geojson',
  organisation: 'Norsk lysingsblad (Digitaliseringsdirektoratet)',
  dataset: 'Aquaculture applications announced for public inspection, with deadline for remarks',
  url: LIST,
  license: 'Public announcements, Lov om Norsk lysingsblad',
  featureCount: list.length,
  retrieved: out.retrieved,
});
await writeFile(manifestUrl, JSON.stringify(manifest, null, 2));
const open = list.filter((h) => (h.deadline ?? '') >= new Date().toISOString().slice(0, 10)).length;
console.log(`hearings.geojson: ${list.length} announcements (${read} read, ${kept} new), ${open} with a deadline still open, ${features.filter((f) => f.geometry).length} placed`);
