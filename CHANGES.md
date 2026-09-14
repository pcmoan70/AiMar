# Changes

## 2026-09-14

- Map hover: a card follows the pointer listing what every enabled overlay
  shows at that point — locality and operators, site border, AIS traffic level
  (sampled from decoded tiles), and GetFeatureInfo answers from NorKyst
  (values), Miljødirektoratet / Fiskeridirektoratet (features) and NGU /
  Kystverket (MapServer text). Debounced, cached, aborted on move.

- Layer panel: overlays grouped in tabs (Aquaculture, Seabed, Ocean,
  Environment, Shipping), ordered by importance within each tab, with a badge
  for enabled layers. Registry gained `category` and a per-tab order.

- Hover explanations: every displayed figure (register fields, lice values,
  neighbourhood and lice-pressure tables, operator counts, storage and tile
  counts) shows its source and calculation method on hover, focus or tap.
  Texts live in `web/src/lib/hints.ts`.

- Update checks: the app polls for a new service worker every 10 minutes and
  on tab focus / reconnect, then prompts to reload.

- AIS density overlays get per-pixel transparency: tiles are decoded in the
  browser and low-traffic cells are faded while busy lanes stay opaque
  (`lib/tileFilters.ts`, custom MapLibre protocol).

- Operator filter: dropdown on the map (multi-select with search, zoom to
  sites, remembered in settings) limits localities and site borders to the
  chosen operators.

- AIS traffic density from Kystverket's MarTraf WMS-T (yearly 2024, monthly
  April 2025) added next to the 2022 track-density layer.
- Climatology pipeline hardened: per-day child process with timeout, retries
  with backoff, skip persistently failing days, checkpoints every 3 days.

- BarentsWatch fish-health snapshot (weekly lice, treatments, fallow, PD/ILA,
  last four years) via client credentials kept in `.env.local` / repo secrets.
- Inspect panel shows a lice time-series chart with the 0.5 limit, fallow
  periods, treatment markers, hover readout and a table view, plus a 52-week
  summary. Hypothetical sites get a regional lice-pressure table.

- Kystverket overlays: main/secondary fairways, fairway areas, shipping
  anchorage areas, AIS vessel track density 2022.
- Site borders are now bundled vector polygons from the pub-aqua API (clickable,
  offline) instead of a WMS image layer.
- Locality search box (name or number) with fly-to.
- Weekly scheduled workflow refreshes the data snapshot and redeploys on change.
- Deployed to GitHub Pages; repo made public; planning documents kept local.

## 2026-09-13

- Re-scoped Phase 1 of the project plan as an offline-first Progressive Web App
  without a backend; added an offline strategy table to the plan.
- Created `web/`: Vite + React + TypeScript + MapLibre GL, `vite-plugin-pwa`
  service worker with app-shell precache and cache-first runtime caching for
  Kartverket tiles and WMS images.
- Layer registry with source, licence, attribution and cache policy: Kartverket
  topo / greytone / nautical base maps, bathymetry, Miljødirektoratet protected
  areas, Fiskeridirektoratet seabed habitats, spawning areas, site polygons and
  active localities.
- Build-time snapshot of Fiskeridirektoratet localities with provenance manifest
  (`npm run fetch-data`).
- Click-to-inspect panel for localities; hypothetical-site neighbourhood summary
  (nearest farm, farms and capacity within 5/10/20/50 km).
- Settings persisted in `localStorage`; Offline panel with install button,
  storage usage, "download this area" tile prefetch and cache clearing.
- Headless-Chrome smoke test (`npm run smoke`) covering online use and offline
  reload.
- Docs: README, ARCHITECTURE (mermaid diagrams), tasks/todo, tasks/lessons.
- Added NGU marine geology overlays (sediment grain size, anchoring conditions,
  deposition areas, slope) and MET NorKyst v3 forecast overlays (surface
  temperature, salinity, current speed, current direction) with legends; forecast
  images use a separate one-day cache.
- Layer registry gained `params` (extra WMS parameters) and `legend`.
- Vitest unit tests for tile maths, neighbourhood features and settings (`npm test`).
