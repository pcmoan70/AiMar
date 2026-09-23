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

// ---- Fiskeridirektoratet's public application list (CSV export of fiskeridir.no/akvakultur/akvakultursoknader):
// every application with its submission date, so brand-new ones appear before the map service has them,
// and every one gets a link to its page there (sea chart, handling authority).
const LIST_URL = 'https://www.fiskeridir.no/akvakultur/akvakultursoknader/_/service/no.fiskeridir/aqua-download-list?format=csv';
const listPage = (no) => `https://www.fiskeridir.no/akvakultur/akvakultursoknader/${no.toLowerCase()}`;
const LIST_STATUS = { 'Under behandling': 'SUBMITTED', Returnert: 'RETURNED', Ferdigbehandlet: 'DONE' };

/** Minimal CSV: semicolon-separated, double-quoted fields may contain separators and doubled quotes. */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ';') {
      row.push(cell);
      cell = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell);
      if (row.some((x) => x !== '')) rows.push(row);
      row = [];
      cell = '';
    } else cell += c;
  }
  row.push(cell);
  if (row.some((x) => x !== '')) rows.push(row);
  return rows;
}

async function mergeList() {
  const res = await fetch(LIST_URL, { headers: { 'user-agent': 'AiMar/1.0 (+https://pcmoan70.github.io/AiMar/)' } });
  if (!res.ok) throw new Error(`application list: HTTP ${res.status}`);
  const [head, ...rows] = parseCsv((await res.text()).replace(/^\uFEFF/, ''));
  const col = Object.fromEntries(head.map((h, i) => [h.trim(), i]));
  const get = (r, name) => (r[col[name]] ?? '').trim();
  const target = fileURLToPath(new URL('applications.geojson', OUT));
  const fc = JSON.parse(await readFile(target, 'utf8'));
  const have = new Map(fc.features.map((f) => [f.properties.appNo, f]));
  let added = 0;
  let linked = 0;
  for (const r of rows) {
    const appNo = get(r, 'Søknadsnummer');
    if (!appNo) continue;
    const status = LIST_STATUS[get(r, 'Status')] ?? get(r, 'Status');
    const withdrawn = get(r, 'Trukket') || null;
    const f = have.get(appNo);
    if (f) {
      f.properties.url = listPage(appNo);
      if (withdrawn) f.properties.withdrawn = withdrawn;
      linked++;
      continue;
    }
    // Only applications still being processed join the map; finished ones stay on the list.
    if (status !== 'SUBMITTED' || withdrawn) continue;
    const lat = Number(get(r, 'Breddegrad'));
    const lon = Number(get(r, 'Lengdegrad'));
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || !lat || !lon) continue;
    const props = {
      appNo,
      applicant: get(r, 'Søkers navn') || undefined,
      orgNo: get(r, 'Organisasjonsnummer') || undefined,
      kind: get(r, 'Søknadstype') || undefined,
      status,
      submitted: get(r, 'Innsendt') || undefined,
      navn: get(r, 'Lokalitet') || get(r, 'Tittel') || undefined,
      loknr: Number(get(r, 'Lokalitetsnummer')) || undefined,
      kommune: get(r, 'Kommune') || undefined,
      fylke: get(r, 'Fylke') || undefined,
      prodArea: get(r, 'Produksjonsområde') || undefined,
      species: get(r, 'Art') || undefined,
      url: listPage(appNo),
      source: 'list',
    };
    for (const k of Object.keys(props)) if (props[k] === undefined) delete props[k];
    fc.features.push({ type: 'Feature', geometry: { type: 'Point', coordinates: [round6(lon), round6(lat)] }, properties: props });
    added++;
  }
  fc.features.sort((a, b) => (a.properties.appNo ?? '').localeCompare(b.properties.appNo ?? ''));
  await writeFile(target + '.tmp', JSON.stringify(fc));
  await rename(target + '.tmp', target);
  console.log(`application list: ${rows.length} rows, ${linked} linked, ${added} added from the list only`);
  return { rows: rows.length, added };
}
const list = await mergeList();
counts['applications.geojson'] += list.added;

// ---- Fiskeridirektoratet's public application API (no key): status, type and the evaluation per sector
// authority (decisions with result and time, statements) for every application on the map.
const API = 'https://api.fiskeridir.no/aqua-portal-api-public/api/v1';
async function apiJson(url) {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, { headers: { 'user-agent': 'AiMar/1.0 (+https://pcmoan70.github.io/AiMar/)', accept: 'application/json' } });
    if (res.ok) return res.json();
    if (res.status === 404) return null;
    if (attempt >= 3 || (res.status < 500 && res.status !== 429)) throw new Error(`${url}: HTTP ${res.status}`);
    await sleep(2000 * (attempt + 1));
  }
}
async function enrichFromApi() {
  const target = fileURLToPath(new URL('applications.geojson', OUT));
  const fc = JSON.parse(await readFile(target, 'utf8'));
  let done = 0;
  let evaluated = 0;
  for (const f of fc.features) {
    const p = f.properties;
    try {
      const a = await apiJson(`${API}/application/${p.appNo}`);
      if (a) {
        p.apiStatus = a.status ?? null;
        p.typeCode = a.type ?? null;
        p.createdAt = a.createdAt?.slice(0, 10) ?? null;
        if (a.withdrawnAt) p.withdrawn = a.withdrawnAt.slice(0, 10);
        if (!p.submitted && a.submittedAt) p.submitted = a.submittedAt.slice(0, 10);
      }
      const e = await apiJson(`${API}/evaluation/${p.appNo}`);
      if (e) {
        p.result = e.result ?? null;
        p.evaluationFinishedAt = e.evaluationFinishedAt?.slice(0, 10) ?? null;
        p.evaluation = (e.evaluationParts ?? []).map((x) => ({
          org: x.organisationName,
          responsible: !!x.responsiblePart,
          decisions: (x.decisions ?? []).map((d) => ({ result: d.result ?? null, at: (d.decisionTime ?? d.registeredAt ?? '').slice(0, 10) || null })),
          statements: (x.statements ?? []).map((s) => ({ at: (s.statementTime ?? s.registeredAt ?? '').slice(0, 10) || null })),
        }));
        if (p.evaluation.length) evaluated++;
      }
      done++;
    } catch (err) {
      console.warn(`${p.appNo}: ${err.message}`);
    }
    await sleep(120);
  }
  await writeFile(target + '.tmp', JSON.stringify(fc));
  await rename(target + '.tmp', target);
  console.log(`application API: ${done}/${fc.features.length} applications read, ${evaluated} with an evaluation`);
  return done;
}
const enriched = await enrichFromApi();

const manifestUrl = new URL('manifest.json', OUT);
const manifest = JSON.parse(await readFile(manifestUrl, 'utf8'));
manifest.sources = manifest.sources.filter((s) => !s.file.startsWith('application'));
for (const { file, what } of LAYERS)
  manifest.sources.push({
    file,
    organisation: 'Fiskeridirektoratet',
    dataset: `Aquaculture applications under processing: ${what}${file === 'applications.geojson' ? ` (+ ${list.added} from the public application list, ${list.rows} rows; ${enriched} enriched from the application API)` : ''}`,
    url: file === 'applications.geojson' ? `${SERVICE} + ${LIST_URL} + ${API}` : SERVICE,
    license: 'NLOD 2.0',
    featureCount: counts[file],
    retrieved: new Date().toISOString(),
  });
await writeFile(manifestUrl, JSON.stringify(manifest, null, 2));
