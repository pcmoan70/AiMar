// Tidal statistics per locality from Kartverket's tide API (vannstand.kartverket.no):
// one year of predicted high/low waters at the site position (nearest gauge with the
// API's local delay/height factor), reduced to mean/max tidal range, mean high and
// low water and the gauge used. Writes public/data/tides.json. Idempotent: sites already
// present are skipped, so a rerun only adds new localities.
import { readFile, writeFile } from 'node:fs/promises';
import { setDefaultAutoSelectFamilyAttemptTimeout } from 'node:net';
// Node gives each address family 250 ms by default; slow hosts (api.einnsyn.no) then fail with ETIMEDOUT while curl succeeds.
setDefaultAutoSelectFamilyAttemptTimeout(10000);

const OUT = new URL('../public/data/', import.meta.url);
const API = 'https://vannstand.kartverket.no/tideapi.php';
const YEAR = 2025; // any full calendar year of predictions (18.6-year nodal cycle ignored)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getText(url, attempt = 0) {
  let res;
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(60000) });
  } catch (e) {
    if (attempt >= 6) throw e;
    await sleep(Math.min(5000 * 2 ** attempt, 60000));
    return getText(url, attempt + 1);
  }
  if (res.status === 429 || res.status >= 500) {
    if (attempt >= 6) throw new Error(`HTTP ${res.status}`);
    await sleep(Math.min(5000 * 2 ** attempt, 60000));
    return getText(url, attempt + 1);
  }
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

const localities = JSON.parse(await readFile(new URL('localities.geojson', OUT), 'utf8'));
const prev = await readFile(new URL('tides.json', OUT), 'utf8').then(JSON.parse, () => null);
const tides = prev?.localities ?? {};
const todo = localities.features.filter((f) => !tides[f.properties.loknr]);
console.log(`${todo.length} localities to fetch (${Object.keys(tides).length} already done)`);

async function save() {
  await writeFile(new URL('tides.json', OUT), JSON.stringify({ retrieved: new Date().toISOString(), year: YEAR, localities: tides }));
}
let n = 0;
for (const f of todo) {
  const [lon, lat] = f.geometry.coordinates;
  const url = `${API}?lat=${lat.toFixed(5)}&lon=${lon.toFixed(5)}&fromtime=${YEAR}-01-01T00:00&totime=${YEAR}-12-31T23:59&datatype=tab&refcode=cd&lang=nb&tzone=0&dst=0&tide_request=locationdata`;
  try {
    const xml = await getText(url);
    const loc = xml.match(/<location [^>]*name="([^"]*)"[^>]*factor="([^"]*)"/);
    const levels = [...xml.matchAll(/<waterlevel value="([-\d.]+)" time="[^"]+" flag="(high|low)"/g)].map((m) => [Number(m[1]), m[2]]);
    if (levels.length < 100) throw new Error(`only ${levels.length} extremes`);
    const highs = levels.filter((l) => l[1] === 'high').map((l) => l[0]);
    const lows = levels.filter((l) => l[1] === 'low').map((l) => l[0]);
    // range per tide: each high against the following low
    const ranges = [];
    for (let i = 0; i < levels.length - 1; i++) if (levels[i][1] === 'high' && levels[i + 1][1] === 'low') ranges.push(levels[i][0] - levels[i + 1][0]);
    const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;
    tides[f.properties.loknr] = {
      gauge: loc?.[1] ?? null,
      factor: loc ? Number(loc[2]) : null,
      meanHigh: Math.round(mean(highs)),
      meanLow: Math.round(mean(lows)),
      meanRange: Math.round(mean(ranges)),
      maxRange: Math.round(Math.max(...ranges)),
      hat: Math.round(Math.max(...highs)),
      lat: Math.round(Math.min(...lows)),
    };
  } catch (err) {
    console.warn(`${f.properties.loknr} ${f.properties.navn}: ${err.message}`);
  }
  if (++n % 100 === 0) {
    await save();
    console.log(`  ${n}/${todo.length}`);
  }
  await sleep(250);
}
await save();
console.log(`tides.json: ${Object.keys(tides).length} localities`);
