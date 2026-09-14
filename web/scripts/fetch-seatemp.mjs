// Weekly farm-reported sea temperature per locality from BarentsWatch
// (fishhealth/locality/{loknr}/seatemperature/{year}) into public/data/seatemp.json,
// on the same week index as fishhealth.json. Resumable and idempotent: completed
// past years are stored in `done` and never fetched again; the current year is
// refreshed on every run. Needs BW_CLIENT_ID / BW_CLIENT_SECRET (env or web/.env.local).
import { readFile, writeFile } from 'node:fs/promises';

const OUT = new URL('../public/data/', import.meta.url);
const START_YEAR = 2012;
const BASE = 'https://www.barentswatch.no/bwapi/v1/geodata/fishhealth';
const SAVE_EVERY = 200; // requests between checkpoints

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
  if (!process.env.BW_CLIENT_ID || !process.env.BW_CLIENT_SECRET) throw new Error('BW_CLIENT_ID and BW_CLIENT_SECRET are required');
}
async function getToken() {
  const res = await fetch('https://id.barentswatch.no/connect/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'client_credentials', client_id: process.env.BW_CLIENT_ID, client_secret: process.env.BW_CLIENT_SECRET, scope: 'api' }),
  });
  if (!res.ok) throw new Error(`token: HTTP ${res.status}`);
  return (await res.json()).access_token;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

await loadEnv();
let token = await getToken();
let tokenAt = Date.now();
async function getJson(url, attempt = 0) {
  if (Date.now() - tokenAt > 45 * 60e3) {
    token = await getToken();
    tokenAt = Date.now();
  }
  let res;
  try {
    res = await fetch(url, { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(60000) });
  } catch (e) {
    if (attempt >= 8) throw e;
    await sleep(Math.min(5000 * 2 ** attempt, 120000));
    return getJson(url, attempt + 1);
  }
  if (res.status === 404) return null;
  if (res.status === 429 || res.status >= 500) {
    if (attempt >= 8) throw new Error(`${url}: HTTP ${res.status}`);
    await sleep(Math.min(5000 * 2 ** attempt, 120000));
    return getJson(url, attempt + 1);
  }
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.json();
}

// Week index shared with fishhealth.json ("YYYY-Www" labels)
const fishhealth = JSON.parse(await readFile(new URL('fishhealth.json', OUT), 'utf8'));
const weeks = fishhealth.weeks;
const weekIndex = new Map(weeks.map((w, i) => [w, i]));
const localities = JSON.parse(await readFile(new URL('localities.geojson', OUT), 'utf8'));
const loknrs = localities.features.map((f) => f.properties.loknr);
const thisYear = new Date().getUTCFullYear();

const prev = await readFile(new URL('seatemp.json', OUT), 'utf8').then(JSON.parse, () => null);
const data = prev?.localities ?? {};
const done = new Set(prev?.done ?? []); // "loknr:year" for complete past years
// Re-align previous arrays if the week index grew
for (const nr of Object.keys(data)) if (data[nr].length < weeks.length) data[nr] = [...data[nr], ...new Array(weeks.length - data[nr].length).fill(null)];

const jobs = [];
for (const nr of loknrs) for (let y = START_YEAR; y <= thisYear; y++) if (!done.has(`${nr}:${y}`)) jobs.push([nr, y]);
console.log(`${jobs.length} locality-years to fetch (${done.size} already complete)`);

async function save() {
  const out = { retrieved: new Date().toISOString(), weeks, localities: data, done: [...done] };
  await writeFile(new URL('seatemp.json', OUT), JSON.stringify(out));
}
let n = 0;
for (const [nr, y] of jobs) {
  const r = await getJson(`${BASE}/locality/${nr}/seatemperature/${y}`);
  if (r?.data?.length) {
    const arr = (data[nr] ??= new Array(weeks.length).fill(null));
    for (const w of r.data) {
      const i = weekIndex.get(`${y}-${String(w.week).padStart(2, '0')}`);
      if (i !== undefined && w.seaTemperature != null) arr[i] = Math.round(w.seaTemperature * 10) / 10;
    }
  }
  if (y < thisYear) done.add(`${nr}:${y}`);
  if (++n % SAVE_EVERY === 0) {
    await save();
    console.log(`  ${n}/${jobs.length}`);
  }
  await sleep(80);
}
// Drop localities without a single value
for (const nr of Object.keys(data)) if (!data[nr].some((v) => v != null)) delete data[nr];
await save();
console.log(`seatemp.json: ${Object.keys(data).length} localities with weekly sea temperature`);
