# AiMar – Norwegian Aquaculture Site Intelligence

_Updated 2026-09-15_

AiMar is an open-data GIS for assessing salmon-farming sites along the Norwegian
coast. The long-term goal is answering **"what would happen if a salmon farm were
established here?"**. The current release is Phase 1: an installable,
**offline-capable web map** of existing aquaculture localities and marine
conditions, built entirely on open Norwegian services.

## Repository layout

| Path | Purpose |
|---|---|
| `web/` | Vite + React + TypeScript Progressive Web App (MapLibre GL) |
| `web/scripts/fetch-data.mjs` | Snapshots datasets the browser cannot fetch directly into `web/public/data/` with a provenance manifest |
| `web/scripts/smoke.mjs` | Headless-Chrome end-to-end test (online, click-to-inspect, offline reload) |
| `ARCHITECTURE.md` | Architecture with diagrams |
| `CHANGES.md` | Change log |

## Quick start

```bash
cd web
npm install
npm run dev          # http://localhost:5173 (service worker enabled in dev)
npm run build        # production build in web/dist, includes sw.js + manifest
npm run preview      # serve the build on http://localhost:4173
npm run fetch-data   # refresh the bundled locality + site-border snapshot (needs network)
npm run fetch-fishhealth  # refresh fish-health snapshot (needs BW_CLIENT_ID/SECRET in web/.env.local)
node scripts/fetch-seatemp.mjs  # weekly sea temperature per site (BarentsWatch), resumable
node scripts/fetch-tides.mjs    # tidal statistics per site (Kartverket), resumable
node scripts/fetch-docs.mjs  # documents published on eInnsyn: originals to DOCS_DIR, 500-char excerpts to docs.json (needs pdftotext)
npm run copy-doc-text  # bundle the extracted document texts into public/data/text/
npm run fetch-deleted  # withdrawn localities from Akvakulturregisteret (ArcGIS REST)
npm run fetch-cases  # eInnsyn case-history snapshot: incremental since last run (no key needed); --full re-harvests, --rematch re-runs matching only
npm test             # unit tests (vitest)
npm run smoke        # e2e test against the preview server (needs /usr/bin/google-chrome)
```

The build output in `web/dist` is static and can be hosted anywhere that serves
files over HTTPS (required for service workers).

## Deployment

`.github/workflows/deploy.yml` builds and publishes `web/dist` to GitHub Pages
on every push to `main` (unit tests must pass first). The build sets
`BASE_PATH=/AiMar/` so assets, the manifest and the service worker resolve
under the project-pages path. In the repository settings, *Pages → Source* must
be set to **GitHub Actions** once. For a custom domain or root hosting, build
with `BASE_PATH=/`.

## What the app does

- Base maps from Kartverket: topographic, greytone, nautical raster chart.
- Overlays: bathymetry (Kartverket), protected areas (Miljødirektoratet),
  protected seabed habitats, spawning areas and licensed site polygons
  (Fiskeridirektoratet), seabed sediment, anchoring conditions, deposition
  areas and slope (NGU), NorKyst v3 surface temperature, salinity and currents
  (MET Norway), fairways, fairway areas, shipping anchorages and AIS vessel
  track density (Kystverket), licensed site borders and all active aquaculture
  localities (bundled vector data); Fiskeridirektoratet production areas with
  traffic-light status, NYTEK moorings, escapes, PD/ILA zones, deleted sites,
  national salmon fjords, coral bans, shellfish beds, and a Fisheries tab with
  fishing grounds, fishing activity, cod spawning fields and lock-up sites. Layers with a colour scale show a legend
  when enabled.
- Search box in the header finds a locality by name or number and flies to it.
- Operator dropdown on the map filters dots and site borders to selected
  operators, with a colour dot per operator, site counts, capacity and
  zoom-to-sites.
- Every figure has a hover explanation (source and calculation method).
- English and Norwegian UI (login screen and ⚙ Settings), including hover
  explanations and help.
- Week readout counts sites above a settable warm-water threshold (12.5 °C).
- Weekly heatmap switchable between lice pressure and treatment density, on a
  timeline of individual weeks or averaged per week number over all years with
  the last year overlaid as spikes.
- Lice per week: a year/week scrubber (sparklines of farms above the limit
  and farms treated, arrow keys) colours every locality by its reported
  lice that week and can smooth them into a lice-pressure heatmap within R km.
  Limits follow the regulation: 0.5, or 0.2 in the spring weeks (16–21 from
  Trøndelag southwards, 21–26 from Nordland northwards).
- Treatment-intensity heatmap: share of production weeks with a lice treatment
  over the last four years, smoothed over farms within a chosen radius.
- Site-panel filters: multi-select value pickers with counts for every register
  field (capacity as licence-multiple ranges; composite fields split into
  components) and for lice history (mean, peak, weeks above limit, treatment
  weeks over 52 weeks).
- Moving the pointer over the map shows a card with what each enabled overlay
  contains at that point (locality, traffic level, protected area, seabed
  class, sea temperature and more).
- Click a locality for its register entry (capacity, species, operators,
  production form, municipality, clearance date, link to Akvakulturregisteret)
  and its fish-health history: weekly adult female lice since 2012 against the
  0.5 limit, treatments, fallow periods, PD/ILA flags, with a period dropdown
  (last year, 4 years, 8 years, all). Operators selected in the map dropdown add lines with
  the inverse-distance-squared weighted lice level at their other farms.
- **Cases** tab: every eInnsyn journal entry for the localities shown on the
  map (all, or those passing the operator and field filters), with word search
  over title, authority and site, kind chips with counts, sorting by date, site,
  authority or kind, grouping by case file with case number, and site names
  that open the Inspect panel.
- Click anywhere else in the sea for a hypothetical-site summary: nearest farm,
  farm count / permitted capacity within 5, 10, 20 and 50 km, and regional lice
  pressure (mean lice and share of farm-weeks above the limit within 10 and 20 km
  over the last year).
- **Offline:** everything viewed while online is cached; the *Offline* panel can
  prefetch tiles for the current view down to a chosen zoom depth, shows storage
  usage, and lists the bundled data snapshot with its retrieval date.
- Settings (base map, overlays, last view, download depth, open panel) persist
  in `localStorage`.
- Installable as a PWA. The app checks for a new version every 10 minutes,
  when the tab becomes visible and when the connection returns, and offers a
  reload.

## Data sources and licences

| Source | Data | Licence |
|---|---|---|
| Kartverket | Topographic maps, nautical chart, bathymetry (Dybdedata) | CC BY 4.0 |
| Fiskeridirektoratet | Aquaculture localities and site borders (Akvakulturregisteret), spawning areas, protected seabed habitats | NLOD 2.0 |
| Kystverket | Main/secondary fairways, fairway areas, shipping anchorages, AIS traffic density (MarTraf yearly 2024 and monthly to April 2025; 1 km track density 2022) | NLOD 2.0 |
| BarentsWatch | Fish health: weekly lice counts, treatments, fallow state, PD/ILA per locality | NLOD 2.0 |
| eInnsyn (Digitaliseringsdirektoratet) | Public-record journal entries on aquaculture cases (applications, statements, decisions, refusals, complaints) matched to localities | NLOD 2.0 |
| Miljødirektoratet | Protected areas (Naturvern) | NLOD 2.0 |
| NGU | Marine base maps: sediment grain size, anchoring conditions, deposition areas, slope | NLOD 2.0 |
| MET Norway | NorKyst v3 800 m forecast: surface temperature, salinity, current speed and direction (latest model hour, via thredds ncWMS) | CC BY 4.0 |

Locality points and site borders are snapshotted at build time (the ArcGIS
REST query endpoint does not allow cross-origin browser requests, and borders
require one API call per site). Run `npm run fetch-data` to refresh; the
snapshot date is written to `public/data/manifest.json`. Fish-health data comes
from the BarentsWatch API, which needs OAuth client credentials; the snapshot
script reads them from `web/.env.local` locally and from repository secrets in
CI, so no token ever reaches the browser. A scheduled workflow
(`.github/workflows/refresh-data.yml`) refreshes all snapshots every Monday and
redeploys when the data changed.

## Roadmap

Next up: NorKyst climatological statistics, hypothetical-site physical features
via WMS GetFeatureInfo, and the Python feature engine.
