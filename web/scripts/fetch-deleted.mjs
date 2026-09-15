// Snapshot of deleted (withdrawn) aquaculture localities from Fiskeridirektoratet's map service
// (ArcGIS REST layer akvakultur_slettede_lokaliteter) into public/data/deleted_localities.geojson.
// Fields are normalised to the same shape as localities.geojson, so the site panel can show a former
// farm exactly like an active one. Paged sequentially, one request at a time. Run: npm run fetch-deleted
import { readFile, rename, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { setDefaultAutoSelectFamilyAttemptTimeout } from 'node:net';
// Node gives each address family 250 ms by default; slow hosts then fail with ETIMEDOUT while curl succeeds.
setDefaultAutoSelectFamilyAttemptTimeout(10000);

const OUT = new URL('../public/data/', import.meta.url);
const LAYER = 'https://gis.fiskeridir.no/server/rest/services/fiskeridirWMS/MapServer/5';
const PAGE = 500;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function getJson(url, attempt = 0) {
  let res;
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(90000) });
  } catch (e) {
    if (attempt >= 6) throw e;
    await sleep(Math.min(5000 * 2 ** attempt, 60000));
    return getJson(url, attempt + 1);
  }
  if (res.status === 429 || res.status >= 500) {
    if (attempt >= 6) throw new Error(`${url}: HTTP ${res.status}`);
    await sleep(Math.min(5000 * 2 ** attempt, 60000));
    return getJson(url, attempt + 1);
  }
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  const data = await res.json();
  if (data.error) throw new Error(`${url}: ${data.error.message ?? 'service error'}`);
  return data;
}

const round6 = (n) => Math.round(n * 1e6) / 1e6;
const isoDay = (ms) => (ms == null ? null : new Date(ms).toISOString().slice(0, 10));
const clean = (v) => (typeof v === 'string' ? v.trim().replace(/^"|"$/g, '') || null : (v ?? null));

/** Same property names as localities.geojson, so the app can treat a former site like an active one. */
function feature(a, geom) {
  const lon = geom?.x ?? a.lon;
  const lat = geom?.y ?? a.lat;
  if (lon == null || lat == null) return null;
  return {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [round6(lon), round6(lat)] },
    properties: {
      loknr: a.loknr,
      navn: clean(a.navn),
      status_lokalitet: clean(a.status_lokalitet) ?? 'TRUKKET',
      kapasitet_lok: a.kapasitet_lok ?? null,
      kapasitet_unittype: clean(a.kapasitet_unittype),
      plassering: clean(a.plassering),
      vannmiljo: clean(a.vannmiljo),
      fylke: clean(a.fylke_akvareg),
      kommune: clean(a.kommune_akvareg),
      til_arter: clean(a.til_arter),
      til_innehavere: clean(a.til_innehavere),
      til_formaal: clean(a.til_formaal),
      til_produksjonsform: clean(a.til_produksjonsform),
      prodareacode: null,
      klareringsdato: isoDay(a.klareringsdato),
      klareringstype: clean(a.klareringstype),
      lokalitet_url: clean(a.lokalitet_url_ekstern) ?? clean(a.lokalitet_url),
    },
  };
}

const features = [];
for (let offset = 0; ; offset += PAGE) {
  const q = new URLSearchParams({
    where: '1=1',
    outFields: '*',
    returnGeometry: 'true',
    outSR: '4326',
    resultOffset: String(offset),
    resultRecordCount: String(PAGE),
    f: 'json',
  });
  const page = await getJson(`${LAYER}/query?${q}`);
  for (const f of page.features ?? []) {
    const feat = feature(f.attributes, f.geometry);
    if (feat) features.push(feat);
  }
  console.log(`${features.length} deleted localities`);
  if (!page.exceededTransferLimit && (page.features ?? []).length < PAGE) break;
  await sleep(300); // one request at a time, politely
}
features.sort((a, b) => a.properties.loknr - b.properties.loknr);

const target = fileURLToPath(new URL('deleted_localities.geojson', OUT));
await writeFile(target + '.tmp', JSON.stringify({ type: 'FeatureCollection', features }));
await rename(target + '.tmp', target);

const manifestUrl = new URL('manifest.json', OUT);
const manifest = JSON.parse(await readFile(manifestUrl, 'utf8'));
manifest.sources = manifest.sources.filter((s) => s.file !== 'deleted_localities.geojson');
manifest.sources.push({
  file: 'deleted_localities.geojson',
  organisation: 'Fiskeridirektoratet',
  dataset: 'Deleted (withdrawn) aquaculture localities from Akvakulturregisteret, with their register entry',
  url: LAYER,
  license: 'NLOD 2.0',
  featureCount: features.length,
  retrieved: new Date().toISOString(),
});
await writeFile(manifestUrl, JSON.stringify(manifest, null, 2));
console.log(`deleted_localities.geojson: ${features.length} features`);
