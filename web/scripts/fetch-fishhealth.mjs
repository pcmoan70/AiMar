// Snapshots BarentsWatch fish-health data (weekly adult female lice, treatments,
// fallow state, PD/ILA flags) for every locality in localities.geojson into
// public/data/fishhealth.json. Needs BW_CLIENT_ID / BW_CLIENT_SECRET in the
// environment or in web/.env.local. Run: npm run fetch-fishhealth
import { readFile, writeFile } from 'node:fs/promises';

const OUT = new URL('../public/data/', import.meta.url);
const START_YEAR = 2012; // first year with weekly lice reporting in the API
const BASE = 'https://www.barentswatch.no/bwapi/v1/geodata/fishhealth';

// Flag bits stored per locality-week (mirrored in src/lib/fishhealth.ts).
const F = { reported: 1, fallow: 2, mechanical: 4, substance: 8, cleanerfish: 16, pd: 32, ila: 64 };

async function loadEnv() {
  if (process.env.BW_CLIENT_ID && process.env.BW_CLIENT_SECRET) return;
  try {
    const text = await readFile(new URL('../.env.local', import.meta.url), 'utf8');
    for (const line of text.split('\n')) {
      const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
    }
  } catch {
    /* no .env.local */
  }
  if (!process.env.BW_CLIENT_ID || !process.env.BW_CLIENT_SECRET)
    throw new Error('BW_CLIENT_ID and BW_CLIENT_SECRET are required');
}

async function getToken() {
  const res = await fetch('https://id.barentswatch.no/connect/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: process.env.BW_CLIENT_ID,
      client_secret: process.env.BW_CLIENT_SECRET,
      scope: 'api',
    }),
  });
  if (!res.ok) throw new Error(`token: HTTP ${res.status}`);
  return (await res.json()).access_token;
}

function isoWeeksInYear(year) {
  const jan1 = new Date(Date.UTC(year, 0, 1)).getUTCDay();
  const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  return jan1 === 4 || (leap && jan1 === 3) ? 53 : 52;
}
function isoWeekNow() {
  const d = new Date();
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const y = t.getUTCFullYear();
  const week = Math.ceil(((t - Date.UTC(y, 0, 1)) / 86400000 + 1) / 7);
  return { year: y, week };
}

await loadEnv();
const token = await getToken();
const localities = JSON.parse(await readFile(new URL('localities.geojson', OUT), 'utf8'));
const wanted = new Set(localities.features.map((f) => f.properties.loknr));

const now = isoWeekNow();
const weeks = [];
for (let y = START_YEAR; y <= now.year; y++) {
  const last = y === now.year ? now.week - 1 : isoWeeksInYear(y);
  for (let w = 1; w <= last; w++) weeks.push([y, w]);
}

const data = {};
for (const nr of wanted) data[nr] = { l: new Array(weeks.length).fill(null), f: new Array(weeks.length).fill(0) };

let i = 0;
for (const [y, w] of weeks) {
  const res = await fetch(`${BASE}/locality/${y}/${w}`, { headers: { authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`${y}/${w}: HTTP ${res.status}`);
  const json = await res.json();
  for (const l of json.localities) {
    const d = data[l.localityNo];
    if (!d) continue;
    d.l[i] = l.avgAdultFemaleLice == null ? null : Math.round(l.avgAdultFemaleLice * 100) / 100;
    d.f[i] =
      (l.hasReportedLice ? F.reported : 0) |
      (l.isFallow ? F.fallow : 0) |
      (l.hasMechanicalRemoval ? F.mechanical : 0) |
      (l.hasSubstanceTreatments ? F.substance : 0) |
      (l.hasCleanerfishDeployed ? F.cleanerfish : 0) |
      (l.hasPd ? F.pd : 0) |
      (l.hasIla ? F.ila : 0);
  }
  i++;
  if (i % 20 === 0) console.log(`${i}/${weeks.length} weeks`);
}

// Drop localities that never had any data to keep the file small.
for (const nr of Object.keys(data)) if (data[nr].f.every((x) => x === 0)) delete data[nr];

const out = {
  retrieved: new Date().toISOString(),
  weeks: weeks.map(([y, w]) => `${y}-${String(w).padStart(2, '0')}`),
  localities: data,
};
await writeFile(new URL('fishhealth.json', OUT), JSON.stringify(out));

const manifestUrl = new URL('manifest.json', OUT);
const manifest = JSON.parse(await readFile(manifestUrl, 'utf8'));
manifest.sources = manifest.sources.filter((s) => s.file !== 'fishhealth.json');
manifest.sources.push({
  file: 'fishhealth.json',
  organisation: 'BarentsWatch',
  dataset: `Fish health: weekly lice, treatments, fallow, PD/ILA (${out.weeks[0]} to ${out.weeks.at(-1)})`,
  url: `${BASE}/locality/{year}/{week}`,
  license: 'NLOD 2.0',
  featureCount: Object.keys(data).length,
  retrieved: out.retrieved,
});
await writeFile(manifestUrl, JSON.stringify(manifest, null, 2));
console.log(`fishhealth.json: ${Object.keys(data).length} localities × ${weeks.length} weeks`);
