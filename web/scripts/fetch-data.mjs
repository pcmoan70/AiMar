// Snapshots open datasets that the browser cannot fetch directly (no CORS on
// the Fiskeridirektoratet ArcGIS REST query endpoint) into public/data, with a
// provenance manifest. Run: npm run fetch-data
// Site polygons: the ArcGIS polygon layer returns no geometry via REST, so
// borders are fetched per site from the pub-aqua API (one request per locality).
import { writeFile, readFile, mkdir } from 'node:fs/promises';

const OUT = new URL('../public/data/', import.meta.url);
const BASE = 'https://gis.fiskeridir.no/server/rest/services/fiskeridirWMS/MapServer';

const SOURCES = [
  {
    file: 'localities.geojson',
    layer: 3,
    dataset: 'akvakultur_lokaliteter (Akvakulturregisteret, active localities)',
    fields:
      'loknr,navn,status_lokalitet,kapasitet_lok,kapasitet_unittype,plassering,vannmiljo,fylke,kommune,til_arter,til_innehavere,til_formaal,til_produksjonsform,prodareacode,klareringsdato,lokalitet_url',
  },
];

function round(coords) {
  return typeof coords[0] === 'number'
    ? coords.map((c) => Math.round(c * 1e6) / 1e6)
    : coords.map(round);
}

await mkdir(OUT, { recursive: true });
const manifest = { retrieved: new Date().toISOString(), sources: [] };

for (const s of SOURCES) {
  const url = `${BASE}/${s.layer}/query?where=1%3D1&outFields=${s.fields}&f=geojson&outSR=4326`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${s.file}: HTTP ${res.status}`);
  const fc = await res.json();
  if (fc.exceededTransferLimit) throw new Error(`${s.file}: result truncated by server`);
  fc.features = fc.features.filter((f) => f.geometry);
  for (const f of fc.features) f.geometry.coordinates = round(f.geometry.coordinates);
  await writeFile(new URL(s.file, OUT), JSON.stringify(fc));
  manifest.sources.push({
    file: s.file,
    organisation: 'Fiskeridirektoratet',
    dataset: s.dataset,
    url,
    license: 'NLOD 2.0',
    crs: 'EPSG:4326',
    featureCount: fc.features.length,
  });
  console.log(`${s.file}: ${fc.features.length} features`);
}

// ---- site polygons from pub-aqua borders
const PUB_AQUA = 'https://api.fiskeridir.no/pub-aqua/api/v1';
const localities = JSON.parse(await readFile(new URL('localities.geojson', OUT), 'utf8'));
const siteNrs = localities.features.map((f) => f.properties.loknr);
const polygons = [];
let failed = 0;
const queue = [...siteNrs];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// The API rate-limits (HTTP 429); keep concurrency low and back off on 429.
async function fetchBorders(nr) {
  for (let attempt = 0; attempt < 6; attempt++) {
    const res = await fetch(`${PUB_AQUA}/sites/${nr}/borders`);
    if (res.status === 429) {
      await sleep(Number(res.headers.get('retry-after') ?? 0) * 1000 || 2000 * 2 ** attempt);
      continue;
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }
  throw new Error('rate limited');
}
async function worker() {
  while (queue.length) {
    const nr = queue.shift();
    try {
      await sleep(150);
      for (const b of await fetchBorders(nr)) {
        if (!b.points || b.points.length < 3) continue;
        const ring = [...b.points].sort((a, c) => a.index - c.index).map((p) => [p.longitude, p.latitude]);
        ring.push(ring[0]);
        polygons.push({
          type: 'Feature',
          geometry: { type: 'Polygon', coordinates: [round(ring)] },
          properties: { loknr: nr, name: b.name, borderType: b.type?.value ?? null },
        });
      }
    } catch (e) {
      failed++;
      console.warn(`borders ${nr}: ${e.message}`);
    }
  }
}
await Promise.all(Array.from({ length: 2 }, worker));
await writeFile(new URL('site_polygons.geojson', OUT), JSON.stringify({ type: 'FeatureCollection', features: polygons }));
manifest.sources.push({
  file: 'site_polygons.geojson',
  organisation: 'Fiskeridirektoratet',
  dataset: 'Akvakulturregisteret site borders (pub-aqua API /sites/{siteNr}/borders)',
  url: `${PUB_AQUA}/sites/{siteNr}/borders`,
  license: 'NLOD 2.0',
  crs: 'EPSG:4326',
  featureCount: polygons.length,
});
console.log(`site_polygons.geojson: ${polygons.length} polygons (${failed} sites failed)`);

await writeFile(new URL('manifest.json', OUT), JSON.stringify(manifest, null, 2));
console.log('manifest.json written');
