// Harvests public-record journal entries about aquaculture cases from eInnsyn
// (api.einnsyn.no) for the last YEARS_BACK years, matches them to localities by
// name / locality number in the entry title, and writes public/data/cases.json.
// Documents themselves are not in eInnsyn for most authorities; each entry links
// to einnsyn.no where an access request can be filed. Run: npm run fetch-cases
import { readFile, writeFile } from 'node:fs/promises';

const OUT = new URL('../public/data/', import.meta.url);
const API = 'https://api.einnsyn.no';
const YEARS_BACK = 3;
const QUERIES = ['akvakultur lokalitet', 'akvakultur søknad', 'akvakultur vedtak'];
const MIN_NAME_LEN = 5;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function getJson(url, attempt = 0) {
  let res;
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(60000) });
  } catch (e) {
    if (attempt >= 6) throw e;
    await sleep(5000 * 2 ** attempt); // network error or timeout: back off and retry
    return getJson(url, attempt + 1);
  }
  if (res.status === 429 || res.status >= 500) {
    if (attempt >= 6) throw new Error(`${url}: HTTP ${res.status}`);
    await sleep(5000 * 2 ** attempt);
    return getJson(url, attempt + 1);
  }
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.json();
}

// ---- localities: name index
const localities = JSON.parse(await readFile(new URL('localities.geojson', OUT), 'utf8'));
const norm = (s) => s.toUpperCase().replace(/\s+/g, ' ').trim();
const byName = new Map(); // NAME -> [{loknr, kommune}]
const known = new Set();
for (const f of localities.features) {
  const p = f.properties;
  known.add(String(p.loknr));
  const n = norm(p.navn);
  if (n.length < MIN_NAME_LEN) continue;
  const list = byName.get(n) ?? [];
  list.push({ loknr: p.loknr, kommune: norm(p.kommune ?? '') });
  byName.set(n, list);
}
const names = [...byName.keys()].sort((a, b) => b.length - a.length);
// Sites named like their municipality (FRØYA, HERØY, …) appear in every title from that municipality;
// they only count when written explicitly as "lokalitet [12345] NAME".
const municipalities = new Set(localities.features.flatMap((f) => {
  const k = norm(f.properties.kommune ?? '');
  return k ? [k, k.replace(/ I .*$/, '')] : []; // "HERØY I NORDLAND" → also "HERØY"
}));
const esc = (name) => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const explicitSite = (title, name) => new RegExp(`LOKALITET(EN)? (\\d{5} (- )?)?${esc(name)}(?=$|\\s*[-,(]|\\s+\\d|\\s+I\\s)`).test(title);
// A name directly followed by "kommune"/"fylke" is the municipality, not the site (FRØYA, HERØY, HASVIK …).
const wordBounded = (title, name) =>
  new RegExp(`(^|[^A-ZÆØÅ0-9])${esc(name)}(?=$|[^A-ZÆØÅ0-9])(?! ?(KOMMUNE|FYLKE))`).test(title);

/** eInnsyn mixes "inngaaende_dokument" and legacy "inngående"; keep one of in/out/internal. */
const normType = (t) => (!t ? null : /^(in|inn)/.test(t) ? 'in' : /^ut/.test(t) ? 'out' : 'internal');

function matchLoknrs(title) {
  const t = norm(title);
  const hits = new Set();
  for (const m of t.matchAll(/\b(\d{5})\b/g)) if (known.has(m[1])) hits.add(Number(m[1]));
  // Titles are written "… - lokalitet NAME - …"; when the word is present, only the part after it may name the site,
  // so a site named like a municipality (e.g. HERØY) does not match every case in that municipality.
  const idx = t.indexOf('LOKALITET');
  const scope = idx >= 0 ? t.slice(idx) : t;
  for (const name of names) {
    if (municipalities.has(name) ? !explicitSite(t, name) : !wordBounded(scope, name)) continue;
    const cands = byName.get(name);
    if (cands.length === 1) hits.add(cands[0].loknr);
    else for (const c of cands) if (c.kommune && t.includes(c.kommune)) hits.add(c.loknr);
  }
  return [...hits];
}

// ---- harvest by month windows (or --rematch: re-run the matcher on the entries already in cases.json)
const rematch = process.argv.includes('--rematch');
const now = new Date();
let from = new Date(Date.UTC(now.getUTCFullYear() - YEARS_BACK, now.getUTCMonth(), 1));
const entries = new Map();
const entityNames = new Map();
let fetched = 0;
let retrieved = new Date().toISOString();
if (rematch) {
  const prev = JSON.parse(await readFile(new URL('cases.json', OUT), 'utf8'));
  from = new Date(prev.from);
  retrieved = prev.retrieved;
  for (const e of prev.entries) {
    const loknrs = matchLoknrs(e.title);
    if (loknrs.length) entries.set(e.id, { ...e, type: normType(e.type), loknrs });
  }
  console.log(`rematch: ${prev.entries.length} previous entries, ${entries.size} still matched`);
}
for (let d = new Date(from); !rematch && d < now; d.setUTCMonth(d.getUTCMonth() + 1)) {
  const start = d.toISOString().slice(0, 10);
  const end = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).toISOString().slice(0, 10);
  for (const q of QUERIES) {
    let next = `${API}/search?query=${encodeURIComponent(q)}&limit=100&journaldatoFrom=${start}&journaldatoTo=${end}`;
    for (let page = 0; page < 50 && next; page++) {
      const data = await getJson(next);
      fetched += data.items.length;
      for (const it of data.items) {
        if (it.entity !== 'Journalpost' || entries.has(it.id)) continue;
        const loknrs = matchLoknrs(it.offentligTittel ?? '');
        if (!loknrs.length) continue;
        entries.set(it.id, {
          id: it.id,
          date: it.journaldato ?? it.publisertDato?.slice(0, 10) ?? null,
          entity: typeof it.journalenhet === 'string' ? it.journalenhet : it.journalenhet?.id,
          type: normType(it.journalposttype),
          title: it.offentligTittel ?? '',
          loknrs,
        });
      }
      next = data.next ? API + data.next : null;
      await sleep(150);
    }
  }
  console.log(`${start}: ${fetched} fetched, ${entries.size} matched so far`);
}

// ---- resolve authority names
for (const e of entries.values()) {
  if (!e.entity || entityNames.has(e.entity)) continue;
  try {
    const je = await getJson(`${API}/enhet/${e.entity}`);
    entityNames.set(e.entity, je.navn ?? e.entity);
  } catch {
    entityNames.set(e.entity, e.entity);
  }
  await sleep(100);
}

const list = [...entries.values()]
  .map((e) => ({ ...e, entity: entityNames.get(e.entity) ?? e.entity }))
  .sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''));
const perLocality = {};
list.forEach((e, i) => {
  for (const nr of e.loknrs) (perLocality[nr] ??= []).push(i);
});
const out = { retrieved, from: from.toISOString().slice(0, 10), entries: list.map(({ loknrs: _l, ...e }) => e), localities: perLocality };
await writeFile(new URL('cases.json', OUT), JSON.stringify(out));

const manifestUrl = new URL('manifest.json', OUT);
const manifest = JSON.parse(await readFile(manifestUrl, 'utf8'));
manifest.sources = manifest.sources.filter((s) => s.file !== 'cases.json');
manifest.sources.push({
  file: 'cases.json',
  organisation: 'eInnsyn (Digitaliseringsdirektoratet)',
  dataset: `Public-record journal entries on aquaculture cases matched to localities (${out.from} onwards)`,
  url: `${API}/search?query=akvakultur`,
  license: 'NLOD 2.0',
  featureCount: list.length,
  retrieved: out.retrieved,
});
await writeFile(manifestUrl, JSON.stringify(manifest, null, 2));
console.log(`cases.json: ${list.length} entries for ${Object.keys(perLocality).length} localities (${fetched} fetched)`);
