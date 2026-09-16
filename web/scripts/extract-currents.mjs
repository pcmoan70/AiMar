// Measured current data from the eInnsyn current-measurement reports (NS 9425), pulled out of the
// extracted texts and placed at the locality the report belongs to. Writes
// public/data/current_measurements.geojson: mean and maximum speed, the dominant direction, the
// depths measured, and the document id so the app can link to the text.
//   TEXT_DIR=/media/pc/ext4TB/AiMar/docs/text node scripts/extract-currents.mjs
import { readFile, readdir, rename, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const OUT = new URL('../public/data/', import.meta.url);
const TEXT_DIR = process.env.TEXT_DIR ?? '/media/pc/ext4TB/AiMar/docs/text';

const num = (s) => Number(String(s).replace(',', '.'));
const COMPASS = {
  nord: 0, nordnordøst: 22.5, nordøst: 45, østnordøst: 67.5, øst: 90, østsørøst: 112.5, sørøst: 135, sørsørøst: 157.5,
  sør: 180, sørsørvest: 202.5, sørvest: 225, vestsørvest: 247.5, vest: 270, vestnordvest: 292.5, nordvest: 315, nordnordvest: 337.5,
};

/** Pull the numbers the NS 9425 summaries state in plain sentences. */
function parse(text) {
  const flat = text.replace(/\s+/g, ' ');
  const out = {};
  // "Gjennomsnittlig strømhastighet er 11,4 cm/s"
  const mean = flat.match(/[Gg]jennomsnittlig\w*\s+(?:strømhastighet|vannstrøm)[^.]{0,40}?er\s+(\d{1,3}[.,]\d)\s*cm\/s/);
  if (mean) out.mean = num(mean[1]);
  // "Maksimal strømhastighet i den målte perioden var 26,2 cm/s", or a per-depth list
  const max = flat.match(/[Mm]aksimal\w*\s+(?:strøm)?hastighet\w*[^.]{0,90}?(\d{1,3}[.,]\d)\s*cm\/s/);
  if (max) out.max = num(max[1]);
  const maxList = flat.match(/maksimalhastighet\w*\s+er\s+henholdsvis\s+([\d.,\s og]+?)cm\/s/i);
  if (maxList) {
    const vals = maxList[1].split(/,| og /).map((x) => num(x.trim())).filter(Number.isFinite);
    if (vals.length) out.max = Math.max(out.max ?? 0, ...vals);
  }
  // "mot sør-sørvest (195 grader)" or "sørvest (225 grader)"
  const dir = flat.match(/(?:mot|retning)\s+([a-zæøå-]+)\s*\((\d{1,3})\s*grader\)/i) ?? flat.match(/\((\d{1,3})\s*grader\)/);
  if (dir) {
    out.direction = Number(dir[dir.length - 1]);
    if (dir.length === 3) out.directionName = dir[1];
  } else {
    const word = flat.match(/hovedretning\w*\s+(?:er\s+)?mot\s+([a-zæøå]+)/i);
    const deg = word && COMPASS[word[1].toLowerCase()];
    if (deg != null) {
      out.direction = deg;
      out.directionName = word[1];
    }
  }
  // "9.6, 8.1, 7.4 og 2.9 cm/s på 5, 15, 74 og 138 meters dyp"
  const perDepth = flat.match(/vannstrøm\s+([\d.,\s og]+)\s*cm\/s\s+på\s+([\d,\s og]+)\s*meters?\s*dyp/i);
  if (perDepth) {
    const speeds = perDepth[1].split(/,| og /).map((s) => num(s.trim())).filter(Number.isFinite);
    const depths = perDepth[2].split(/,| og /).map((s) => Number(s.trim())).filter(Number.isFinite);
    if (speeds.length && speeds.length === depths.length) {
      out.byDepth = depths.map((d, i) => ({ depth: d, mean: speeds[i] }));
      if (out.mean == null) out.mean = speeds[0];
    }
  }
  const depths = [...new Set([...flat.matchAll(/\b(\d{1,3})\s*m(?:eters?)?\s*dyp/gi)].map((m) => Number(m[1])))].filter((d) => d > 0 && d < 400);
  if (depths.length) out.depths = depths.sort((a, b) => a - b).slice(0, 8);
  return out;
}

const cases = JSON.parse(await readFile(new URL('cases.json', OUT), 'utf8'));
const docs = JSON.parse(await readFile(new URL('docs.json', OUT), 'utf8')).docs;
const localities = JSON.parse(await readFile(new URL('localities.geojson', OUT), 'utf8'));
const pos = new Map(localities.features.map((f) => [f.properties.loknr, { coords: f.geometry.coordinates, navn: f.properties.navn }]));
// entry id -> localities the entry is about
const entrySites = new Map();
for (const [loknr, idxs] of Object.entries(cases.localities))
  for (const i of idxs) {
    const id = cases.entries[i].id;
    if (!entrySites.has(id)) entrySites.set(id, []);
    entrySites.get(id).push(Number(loknr));
  }
const index = JSON.parse(await readFile(join(TEXT_DIR, 'index.json'), 'utf8'));
const files = new Set(await readdir(TEXT_DIR));

const features = [];
let reports = 0;
let noValues = 0;
for (const [entry, list] of Object.entries(docs)) {
  const sites = entrySites.get(entry) ?? [];
  for (const d of list) {
    if (!/strøm/i.test(d.title ?? '') || !files.has(`${d.id}.txt`)) continue;
    reports++;
    const rec = index[d.id];
    const text = await readFile(join(TEXT_DIR, `${d.id}.txt`), 'utf8');
    const v = parse(text);
    if (v.mean == null && v.max == null) {
      noValues++;
      continue;
    }
    for (const loknr of sites) {
      const site = pos.get(loknr);
      if (!site) continue;
      features.push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: site.coords },
        properties: {
          doc: d.id,
          entry,
          loknr,
          navn: site.navn,
          title: d.title,
          date: cases.entries.find((e) => e.id === entry)?.date ?? null,
          method: rec?.method ?? null,
          ...v,
        },
      });
    }
  }
}
features.sort((a, b) => (b.properties.mean ?? 0) - (a.properties.mean ?? 0));
const target = fileURLToPath(new URL('current_measurements.geojson', OUT));
await writeFile(target + '.tmp', JSON.stringify({ type: 'FeatureCollection', features }));
await rename(target + '.tmp', target);

const manifestUrl = new URL('manifest.json', OUT);
const manifest = JSON.parse(await readFile(manifestUrl, 'utf8'));
manifest.sources = manifest.sources.filter((s) => s.file !== 'current_measurements.geojson');
manifest.sources.push({
  file: 'current_measurements.geojson',
  organisation: 'eInnsyn (report authors: Åkerblå, Akvaplan-niva and others)',
  dataset: 'Measured current speed and direction read out of NS 9425 survey reports published on eInnsyn',
  url: 'https://api.einnsyn.no/search?query=str%C3%B8mm%C3%A5ling',
  license: 'NLOD 2.0',
  featureCount: features.length,
  retrieved: new Date().toISOString(),
});
await writeFile(manifestUrl, JSON.stringify(manifest, null, 2));
console.log(`${reports} current reports, ${noValues} without readable values, ${features.length} site measurements written`);
