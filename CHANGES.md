# Changes

## 2026-09-14

- Help rewritten in sections (header, map, site panel, lice chart, layers,
  offline, sources) covering all current features.

- Site panel field filters: clicking a register value opens a picker listing
  every value the field takes with site counts (capacity as ranges in
  multiples of the 780 t standard licence); picking one (status, capacity ≥,
  species, purpose, production form, placement, municipality, production area)
  limits the map to matching sites; a red ✕ next to the field and chips under
  the operator dropdown clear filters. Filters combine with the operator
  selection and are remembered.

- Pipeline: the NorKyst pass now also computes monthly temperature and
  salinity statistics at six depths (mean, p10, p90, shares below 4 °C / 20 PSU
  and above 18 °C) and archives every day's subset as int16 on the data disk
  for advection and sea-lice modelling; renderer handles scalar fields.

- Right-click on a locality opens a menu to select its operator(s) or clear
  the selection.

- Map dots are drawn with grey (unlisted) operators at the bottom and coloured
  operators on top, largest company topmost (`circle-sort-key`).

- Operator colours: fixed table (`web/src/lib/operatorColours.ts`) gives every
  operator with 16+ sites its own colour (40 today; first eight on the
  validated palette, then an extended sequence). `scripts/gen-operator-colours.mjs`
  appends new entrants after each data refresh without touching existing
  rows; others are grey; a selected unlisted operator borrows a free colour. Map dots, chart lines
  and scatter dots share these colours; the Aquaculture tab shows the legend.

- Lice chart: one toggle button switches between history and "site vs average"; the scatter view plots each
  week as a dot of comparison average (x) against this site (y) with a 1:1
  diagonal, nearest-dot hover and a share-of-weeks-above summary.
- Lice chart: with no operator selected, an orange line shows the 1/d²-weighted
  lice level at all reporting farms within 150 km; a missing weekly report is
  treated as "not operating", never as zero.
- Lice chart: operators selected in the map dropdown appear as extra lines —
  the distance-weighted (1/d²) lice level at that operator's other farms within
  150 km, counting only farms that reported each week; legend, hover readout
  and table include them.

- Fish-health snapshot extended from four years to the full history since
  2012; the lice chart has a period dropdown (last year, 4 years, 8 years, all).

- Cache limit: caches are kept under a byte limit (20 GB default, set under
  ⚙ Settings). A janitor reads Workbox's last-used timestamps and evicts
  least-recently-used overlay images, forecast images and lookups first,
  base-map tiles last; runs after start-up and every 10 minutes, plus a
  "Purge to limit" button in the Offline panel.

- Overlay tabs: the count circle on each tab is a group switch — orange when
  layers are on (click to switch them all off, the selection is remembered),
  outlined when off (click to restore the selection or enable the group).
- Hover: depth areas show as a range with unit (e.g. 40–50 m).

- Base map moved to a ⚙ Settings dropdown in the header; the layer panel holds overlays only.

- Caching: overlay and base-tile caches raised to 40 000 entries (90/180
  days), a same-origin cache for climatology images, MapLibre keeps 300 decoded
  tiles per source in memory, and the Offline panel shows live cache counts.

- Map hover: a card follows the pointer listing every enabled overlay (a dash
  when nothing is there), including bathymetry depth areas and current
  direction as compass bearings; the card lists what every enabled overlay
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
