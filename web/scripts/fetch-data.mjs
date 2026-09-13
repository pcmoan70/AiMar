// Snapshots open datasets that the browser cannot fetch directly (no CORS on
// the Fiskeridirektoratet ArcGIS REST query endpoint) into public/data, with a
// provenance manifest. Run: npm run fetch-data
// Note: the site-polygon layer (18) returns no geometry via REST; polygons are
// shown from the WMS instead.
import { writeFile, mkdir } from 'node:fs/promises';

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

await writeFile(new URL('manifest.json', OUT), JSON.stringify(manifest, null, 2));
console.log('manifest.json written');
