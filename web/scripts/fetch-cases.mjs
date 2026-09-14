// Harvests public-record journal entries about aquaculture cases from eInnsyn
// (api.einnsyn.no) for the last YEARS_BACK years, matches them to localities by
// name / locality number in the entry title, completes each matched case with
// the rest of its journal entries, and writes public/data/cases.json.
// Documents themselves are not in eInnsyn for most authorities; each entry links
// to einnsyn.no where an access request can be filed.
//   npm run fetch-cases            incremental: entries updated since the last snapshot (full when none exists)
//   node scripts/fetch-cases.mjs --full       re-harvest the whole period
//   node scripts/fetch-cases.mjs --rematch    re-run the matcher on the stored entries, no API calls
import { readFile, writeFile } from 'node:fs/promises';

const OUT = new URL('../public/data/', import.meta.url);
const API = 'https://api.einnsyn.no';
const YEARS_BACK = 3;
const QUERIES = ['akvakultur lokalitet', 'akvakultur søknad', 'akvakultur vedtak'];
const MIN_NAME_LEN = 5;
/** A site named by ≥2 entries and at least this share of a case's entries gets the whole case. */
const CASE_SHARE = 0.25;

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
  let scope = idx >= 0 ? t.slice(idx) : t;
  // Longest names first; a matched name is blanked so "BREIVIK" cannot also match inside "BREIVIK S".
  for (const name of names) {
    if (municipalities.has(name) ? !explicitSite(scope, name) : !wordBounded(scope, name)) continue;
    scope = scope.replace(new RegExp(`(^|[^A-ZÆØÅ0-9])${esc(name)}(?=$|[^A-ZÆØÅ0-9])`), '$1' + ' '.repeat(name.length));
    const cands = byName.get(name);
    if (cands.length === 1) hits.add(cands[0].loknr);
    else for (const c of cands) if (c.kommune && t.includes(c.kommune)) hits.add(c.loknr);
  }
  return [...hits];
}

// ---- modes
const args = new Set(process.argv.slice(2));
const rematch = args.has('--rematch');
const prev = await readFile(new URL('cases.json', OUT), 'utf8').then(JSON.parse, () => null);
const full = args.has('--full') || (!rematch && !prev?.retrieved);
const now = new Date();
const from = new Date(Date.UTC(now.getUTCFullYear() - YEARS_BACK, now.getUTCMonth(), 1));
const fromIso = from.toISOString().slice(0, 10);
const entries = new Map(); // id -> entry (+loknrs)
const cases = new Map(); // case externalId -> { id, nr, title }
const entityNames = new Map();
let fetched = 0;

const entryOf = (it) => ({
  id: it.id,
  // einnsyn.no opens an entry as /saksmappe?id=<case externalId>&jid=<entry externalId>
  ext: it.externalId ?? null,
  sak: it.saksmappe?.externalId ?? null,
  date: it.journaldato ?? it.publisertDato?.slice(0, 10) ?? null,
  entity: typeof it.journalenhet === 'string' ? it.journalenhet : it.journalenhet?.id,
  type: normType(it.journalposttype),
  title: it.offentligTittel ?? '',
  own: matchLoknrs(it.offentligTittel ?? ''), // sites named in this entry's own title
  loknrs: [],
});
const noteCase = (sm) => {
  if (sm?.externalId && !cases.has(sm.externalId)) cases.set(sm.externalId, { id: sm.id, nr: sm.saksnummer ?? '', title: sm.offentligTittel ?? '' });
};

// Base: the previous snapshot (dropped when doing a full harvest)
if (prev && !full) {
  for (const e of prev.entries) {
    if ((e.date ?? '') < fromIso) continue; // rolled out of the window
    entries.set(e.id, { ...e, type: normType(e.type), own: matchLoknrs(e.title), loknrs: [] });
  }
  for (const [k, v] of Object.entries(prev.cases ?? {})) cases.set(k, v);
  console.log(`${rematch ? 'rematch' : 'incremental'}: ${entries.size} entries and ${cases.size} cases from the ${prev.retrieved.slice(0, 10)} snapshot`);
}

// ---- search: month windows (full) or everything updated since the last snapshot (incremental)
async function searchWindow(params) {
  const touched = new Set(); // cases with activity in this window
  for (const q of QUERIES) {
    let next = `${API}/search?query=${encodeURIComponent(q)}&limit=100&expand=saksmappe&${params}`;
    for (let page = 0; page < 200 && next; page++) {
      const data = await getJson(next);
      fetched += data.items.length;
      for (const it of data.items) {
        if (it.entity !== 'Journalpost') continue;
        noteCase(it.saksmappe);
        if (it.saksmappe?.externalId) touched.add(it.saksmappe.externalId);
        const e = entryOf(it);
        if (e.own.length || entries.has(it.id)) entries.set(it.id, e);
      }
      next = data.next ? API + data.next : null;
      await sleep(150);
    }
  }
  return touched;
}
let touched = new Set();
if (full) {
  for (let d = new Date(from); d < now; d.setUTCMonth(d.getUTCMonth() + 1)) {
    const start = d.toISOString().slice(0, 10);
    const end = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).toISOString().slice(0, 10);
    await searchWindow(`journaldatoFrom=${start}&journaldatoTo=${end}`);
    console.log(`${start}: ${fetched} fetched, ${entries.size} matched so far`);
  }
} else if (!rematch) {
  const since = new Date(new Date(prev.retrieved).getTime() - 86400e3).toISOString().slice(0, 10);
  touched = await searchWindow(`oppdatertDatoFrom=${since}&journaldatoFrom=${fromIso}`);
  console.log(`updated since ${since}: ${fetched} fetched, ${entries.size} matched, ${touched.size} cases touched`);
}

// ---- case folders: fetch the rest of every case whose title names a site or where ≥2 entries name the same site.
const byCase = () => {
  const m = new Map();
  for (const e of entries.values()) if (e.sak) (m.get(e.sak) ?? m.set(e.sak, []).get(e.sak)).push(e);
  return m;
};
const caseVotes = (list) => {
  const votes = new Map();
  for (const e of list) for (const nr of e.own) votes.set(nr, (votes.get(nr) ?? 0) + 1);
  return votes;
};
if (!rematch) {
  const groups = byCase();
  const qualifies = (sak) => {
    const c = cases.get(sak);
    if (c && matchLoknrs(c.title).length) return true;
    return [...caseVotes(groups.get(sak) ?? []).values()].some((n) => n >= 2);
  };
  const todo = [...(full ? groups.keys() : touched)].filter((sak) => cases.get(sak)?.id && qualifies(sak));
  console.log(`completing ${todo.length} case folders`);
  let done = 0;
  let added = 0;
  for (const sak of todo) {
    let next = `${API}/saksmappe/${cases.get(sak).id}/journalpost?limit=100`;
    try {
      for (let page = 0; page < 20 && next; page++) {
        const data = await getJson(next);
        for (const it of data.items) {
          if (it.entity !== 'Journalpost' || entries.has(it.id)) continue;
          entries.set(it.id, entryOf({ ...it, saksmappe: { externalId: sak } }));
          added++;
        }
        next = data.next ? API + data.next : null;
        await sleep(150);
      }
    } catch (err) {
      console.warn(`case ${sak}: ${err.message}`);
    }
    if (++done % 500 === 0) console.log(`  ${done}/${todo.length} folders, ${added} entries added`);
  }
  console.log(`folders done: ${added} entries added`);
}

// ---- assign sites: an entry belongs to the sites its own title names, plus the sites its case is about —
// those named in the case title, or named by ≥2 entries making up at least CASE_SHARE of the case
// (so omnibus files such as quarterly access-request logs do not attach wholesale to one site).
for (const e of entries.values()) e.loknrs = [...e.own];
for (const [sak, list] of byCase()) {
  const c = cases.get(sak);
  const wide = new Set(c ? matchLoknrs(c.title) : []);
  for (const [nr, n] of caseVotes(list)) if (n >= 2 && n >= CASE_SHARE * list.length) wide.add(nr);
  if (wide.size) for (const e of list) e.loknrs = [...new Set([...e.own, ...wide])];
}

// ---- resolve authority names (entries from earlier snapshots already carry names)
for (const e of entries.values()) {
  if (!e.entity || !/^enh_/.test(e.entity) || entityNames.has(e.entity)) continue;
  try {
    const je = await getJson(`${API}/enhet/${e.entity}`);
    entityNames.set(e.entity, je.navn ?? e.entity);
  } catch {
    entityNames.set(e.entity, e.entity);
  }
  await sleep(100);
}

const list = [...entries.values()]
  .filter((e) => e.loknrs.length)
  .map((e) => ({ ...e, entity: entityNames.get(e.entity) ?? e.entity }))
  .sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''));
const perLocality = {};
list.forEach((e, i) => {
  for (const nr of e.loknrs) (perLocality[nr] ??= []).push(i);
});
const usedCases = {};
for (const e of list) if (e.sak && cases.has(e.sak)) usedCases[e.sak] = cases.get(e.sak);
const out = {
  retrieved: rematch ? prev.retrieved : new Date().toISOString(),
  from: fromIso,
  entries: list.map(({ loknrs: _l, own: _o, ...e }) => e),
  cases: usedCases,
  localities: perLocality,
};
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
console.log(`cases.json: ${list.length} entries in ${Object.keys(usedCases).length} cases for ${Object.keys(perLocality).length} localities (${fetched} fetched)`);
