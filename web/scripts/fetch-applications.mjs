// Aquaculture applications under processing, from Fiskeridirektoratet's ArcGIS REST service
// (fiskeridirWMS_akva): the application point with its full form data, the applied-for site area
// and the applied-for anchor points. Written to public/data/applications*.geojson.
// Paged sequentially, one layer at a time. Run: npm run fetch-applications
import { readFile, rename, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { setDefaultAutoSelectFamilyAttemptTimeout } from 'node:net';
// Node gives each address family 250 ms by default; slow hosts then fail with ETIMEDOUT while curl succeeds.
setDefaultAutoSelectFamilyAttemptTimeout(10000);

const OUT = new URL('../public/data/', import.meta.url);
const SERVICE = 'https://gis.fiskeridir.no/server/rest/services/fiskeridirWMS_akva/MapServer';
const LAYERS = [
  { id: 33, file: 'applications.geojson', what: 'application points' },
  { id: 34, file: 'application_areas.geojson', what: 'applied-for areas' },
  { id: 35, file: 'application_anchors.geojson', what: 'applied-for anchor points' },
];
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
const isoDay = (ms) => (typeof ms === 'number' ? new Date(ms).toISOString().slice(0, 10) : null);
const clean = (v) => (typeof v === 'string' ? v.trim() || null : (v ?? null));
/** Keep the fields worth showing, with plain names. */
function props(a) {
  const out = {
    appNo: clean(a.applicationno),
    applicant: clean(a.applicantorganisationname),
    orgNo: clean(a.applicantorganisationnumber),
    type: clean(a.type),
    kind: clean(a.soeknadstype),
    status: clean(a.status_application),
    submitted: isoDay(a.submittedat),
    loknr: a.sitenr ? Number(a.sitenr) : null,
    navn: clean(a.sitename),
    kommune: clean(a.municipalityname),
    fylke: clean(a.countymunicipalityname),
    areaChanged: a.isareachanged === 1 || a.isareachanged === true || null,
    biomass: a.desiredbiomass_value ?? null,
    plannedProd: a.plannedprod_value ?? null,
    feed: a.plannedfeedsize_value ?? null,
    cycleMonths: a.productioncycle_value ?? null,
    netDepth: a.netdata_depth_value ?? null,
    netType: clean(a.netdata_typedescription),
    netTreatment: clean(a.netdata_treatment),
    species: clean(a.art_popularname),
    prodArea: clean(a.sitedata_prodareaname),
    licences: clean(a.licensedata_newlicenses),
  };
  for (const k of Object.keys(out)) if (out[k] === null) delete out[k];
  return out;
}

const rings = (geom) =>
  geom?.rings ? { type: 'Polygon', coordinates: geom.rings.map((r) => r.map(([x, y]) => [round6(x), round6(y)])) } : null;

async function fetchLayer({ id, file, what }) {
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
    const page = await getJson(`${SERVICE}/${id}/query?${q}`);
    for (const f of page.features ?? []) {
      const geometry = f.geometry?.x != null ? { type: 'Point', coordinates: [round6(f.geometry.x), round6(f.geometry.y)] } : rings(f.geometry);
      if (geometry) features.push({ type: 'Feature', geometry, properties: props(f.attributes) });
    }
    if (!page.exceededTransferLimit && (page.features ?? []).length < PAGE) break;
    await sleep(300); // one request at a time, politely
  }
  features.sort((a, b) => (a.properties.appNo ?? '').localeCompare(b.properties.appNo ?? ''));
  const target = fileURLToPath(new URL(file, OUT));
  await writeFile(target + '.tmp', JSON.stringify({ type: 'FeatureCollection', features }));
  await rename(target + '.tmp', target);
  console.log(`${file}: ${features.length} ${what}`);
  return features.length;
}

const counts = {};
for (const layer of LAYERS) counts[layer.file] = await fetchLayer(layer);

const manifestUrl = new URL('manifest.json', OUT);
const manifest = JSON.parse(await readFile(manifestUrl, 'utf8'));
manifest.sources = manifest.sources.filter((s) => !s.file.startsWith('application'));
for (const { file, what } of LAYERS)
  manifest.sources.push({
    file,
    organisation: 'Fiskeridirektoratet',
    dataset: `Aquaculture applications under processing: ${what}`,
    url: SERVICE,
    license: 'NLOD 2.0',
    featureCount: counts[file],
    retrieved: new Date().toISOString(),
  });
await writeFile(manifestUrl, JSON.stringify(manifest, null, 2));
