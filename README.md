# AiMar – Norwegian Aquaculture Site Intelligence

_Updated 2026-09-13_

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
npm run fetch-data   # refresh the bundled locality snapshot (needs network)
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
  (MET Norway), and all active aquaculture localities. Layers with a colour
  scale show a legend when enabled.
- Click a locality for its register entry (capacity, species, operators,
  production form, municipality, clearance date, link to Akvakulturregisteret).
- Click anywhere else in the sea for a hypothetical-site summary: nearest farm
  and farm count / permitted capacity within 5, 10, 20 and 50 km.
- **Offline:** everything viewed while online is cached; the *Offline* panel can
  prefetch tiles for the current view down to a chosen zoom depth, shows storage
  usage, and lists the bundled data snapshot with its retrieval date.
- Settings (base map, overlays, last view, download depth, open panel) persist
  in `localStorage`.
- Installable as a PWA; a toast offers reload when a new version is deployed.

## Data sources and licences

| Source | Data | Licence |
|---|---|---|
| Kartverket | Topographic maps, nautical chart, bathymetry (Dybdedata) | CC BY 4.0 |
| Fiskeridirektoratet | Aquaculture localities and site polygons (Akvakulturregisteret), spawning areas, protected seabed habitats | NLOD 2.0 |
| Miljødirektoratet | Protected areas (Naturvern) | NLOD 2.0 |
| NGU | Marine base maps: sediment grain size, anchoring conditions, deposition areas, slope | NLOD 2.0 |
| MET Norway | NorKyst v3 800 m forecast: surface temperature, salinity, current speed and direction (latest model hour, via thredds ncWMS) | CC BY 4.0 |

Locality points are snapshotted at build time because the ArcGIS REST query
endpoint does not allow cross-origin browser requests. Run `npm run fetch-data`
to refresh; the snapshot date is written to `public/data/manifest.json`.

## Roadmap

Next up: BarentsWatch fish-health history (needs an API token), Kystverket
fairways and AIS traffic density, NorKyst climatological statistics, and the
Python feature engine.
