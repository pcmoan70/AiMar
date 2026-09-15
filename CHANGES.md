# Changes

## 2026-09-15

- Scrubber readout counts the localities whose farm-reported sea temperature
  that week is above a warm-water threshold, 12.5 °C by default, where lice
  development speeds up. The threshold is a setting (8 to 16 °C) in ⚙ Settings,
  and the season view averages each site over the years it reported.
- "Reload" on the new-version toast now actually loads the new version. The
  waiting service worker is told to skip waiting directly and the reload is
  forced once it has taken over, instead of relying on the plugin helper, which
  left the page on the old build with the toast still showing.
- Scrubbing no longer flashes: a week change repaints the locality dots with
  setPaintProperty instead of rebuilding the whole map style, which had been
  tearing down and reloading every source. Twelve scrub steps now cause no
  style reloads and no base-tile requests.
- Site panel: the lice limit is drawn as a red step line again (it was filling
  the area between the spring limit and 0.5), with a vertical riser where the
  limit changes.
- Sea temperature: 35 reports outside −2 to 30 °C (up to 98 °C) are dropped as
  typing errors, in the fetcher and in the app.
- While the weekly lice layer is on, dots are drawn in order of lice level:
  the worst on top, sites without a report at the bottom, so clusters are not
  hidden behind quiet neighbours.
- Spring limits are visible on the scrubber and the map: the timeline and the
  season axis shade weeks 16–26, and localities over the limit in force that
  week (0.2 in the spring weeks by region, else 0.5) get a dark red ring. In
  week 18 of 2024 that is 6 sites against 3 under a flat 0.5 limit.
- Tidal statistics for 1 713 localities and 2 946 withdrawn localities bundled.
- While scrubbing, localities with no lice report for the chosen week (not
  operating) are drawn at 20 % opacity instead of solid grey, so the operating
  sites carry the picture.
- Fish-health snapshot now covers withdrawn sites too (2 703 localities, of
  which 924 are former farms with lice history), at no extra API cost.
- Deleted localities are now bundled data rather than a map image: about 2 900
  withdrawn sites with their full register entry (name, number, capacity,
  species, holders, purpose, production form, clearance date and type, county,
  municipality, register link), drawn as hollow grey rings under the active
  sites. Click one to open the ordinary site panel, marked "withdrawn".
- Scrubber has a second axis: **Season** averages every measure by ISO week
  number over all years since 2012, and the map then shows each site's mean
  lice (or how often it was treated) for that week number. The graph draws the
  multi-year averages as curves with the last year's own values as spikes on
  top, and shades the spring-limit weeks 16–26.
- The weekly heatmap switches between lice pressure and treatment density for
  the chosen week, from a toggle on the scrubber and from ⚙ Settings. Treatment
  mode smooths the share of reporting farms treated that week (scale top 50 %);
  title, legend, scale and hover follow the mode.
- Case views mark entries whose documents are published here with a dot; the
  dot pulses only while that entry's documents are on screen, so the marker
  follows what you are reading. Others keep a quiet ring, and the pulse is
  replaced by a static ring under prefers-reduced-motion.
- Full-text archive for the documents: `pipeline/docs/extract_text.py` keeps
  the originals untouched on the external drive and writes one text file per
  document plus `index.json` with provenance (source path, SHA-256, size, MIME,
  method, pages, OCR pages, tool versions, entry id, title). PDF text layers
  via PyMuPDF, scans and images via tesseract (nor+eng), DOCX via pandoc,
  XLSX via openpyxl. `web/scripts/apply-doc-text.mjs` refreshes the app's
  excerpts and marks OCR'd text with [OCR].
- Document excerpts published: 3 845 files (5.5 GB, kept on the external
  drive) for 911 entries, 3 337 with extracted text; `docs.json` holds only
  what the app shows, the harvester's bookkeeping moved to
  `web/data-state/docs-state.json`. Fetchers fail fast on archives the eInnsyn
  proxy cannot serve and use a 10 s dual-stack connect timeout.
- Lice per week: two Aquaculture layers driven by a year/week scrubber at the
  bottom of the map: a timeline with two sparklines (share of reporting farms
  above the limit in force, share with a treatment registered), click/drag,
  ◀ ▶, arrow keys (Page Up/Down = a year); fixed-width readout and colour key. "Lice per week" colours every locality
  by its reported adult female lice that week (5 bins, grey = no report);
  "Lice pressure per week" is a kernel-weighted mean of the reported lice
  within R km. Hover shows the value; the slider shows farms reporting, farms
  above the limit and the colour key.
- Lice limit is now week- and region-aware (luseforskriften § 8): 0.2 in weeks
  16–21 from Trøndelag southwards and weeks 21–26 from Nordland northwards,
  0.5 otherwise. Used by the chart's red line (stepped), weeks-above-limit
  summaries, filters, regional pressure and the weekly slider summary.
- Fourteen Fiskeridirektoratet overlays: production areas with traffic-light
  status, NYTEK moorings and current-measurement points, escapes, PD/ILA zones,
  deleted localities (Aquaculture tab); national salmon fjords, coral-reef bans,
  shellfish beds (Environment); new Fisheries tab with fishing grounds for
  passive and active gear, fishing activity since 2011, cod spawning fields and
  seine lock-up sites. All hover-readable.
- New resumable fetchers: `fetch-seatemp.mjs` (weekly farm-reported sea
  temperature per site from BarentsWatch, 2012→) and `fetch-tides.mjs`
  (Kartverket tide API: mean/max tidal range, mean high/low water per site).
  Both skip what a previous run completed. The site panel shows the tidal range
  (mean and max, mean high and low water) and a sea-temperature panel under the
  lice chart sharing its period and hover, once the two files exist.

## 2026-09-14

- Documents published on eInnsyn (about 5 % of entries, mostly county
  governors) are fetched by `scripts/fetch-docs.mjs`: originals kept under
  `DOCS_DIR` (the external drive locally), first 500 characters extracted with
  pdftotext into `docs.json`, shown under the entry with a link to the file.
- Explanation popups have a prohibition-sign button (ISO 7010 P001) that
  blocks that explanation; ⚙ Settings
  gets "Unblock explanations (n)" to show them again. Blocks persist on the
  device (settings store).
- Operator dropdown lists operators by permitted capacity (tonnes) instead of
  site count; "Zoom to sites" and "Show all" are always visible (disabled
  when nothing is selected) so the list does not jump.
- Operator colours now show as a dot beside each operator in the map dropdown
  (and on the dropdown button when one operator is selected); the colour legend
  under Layers → Aquaculture is gone.
- Case harvest is incremental (entries updated since the last snapshot via
  `oppdatertDatoFrom`; `--full` re-harvests) and completes every matched case
  file from `/saksmappe/{id}/journalpost`, so entries whose title does not name
  the site are included. Cases panel gains "Group by case" with case number and
  a link to the case on einnsyn.no; search also matches case titles.
- Cases tab: all case-history entries for the localities passing the current
  filters, with word search, kind chips, sorting by date/site/authority/kind and
  200-row paging; site names open the Inspect panel.
- Case history links fixed: einnsyn.no has no `/journalpost/<id>` page; entries
  now open as `/saksmappe?id=<case>&jid=<entry>` using the archive identifiers
  stored by the harvester (title search on einnsyn as fallback).
- Explanation popups (dotted-underlined figures) are now light with a black ✕
  in the upper-right corner; they stay open while the pointer is on the popup
  and close with ✕, Escape or leaving it.
- Case history: a weekly harvest of eInnsyn public-record journal entries
  about aquaculture cases (last 3 years), matched to localities by name and
  municipality or locality number, shown as a timeline in the site panel with
  links to eInnsyn for document requests (`web/scripts/fetch-cases.mjs`).

- Treatment-intensity heatmap layer (Aquaculture tab): share of production
  weeks with a lice treatment over the last 4 years, kernel-smoothed over farms
  within a user-chosen radius R (5–50 km), computed on the device, with legend,
  hover value and explanation.
- Language control is a single button showing the current language.
- Operator colours grouped by brand word: companies sharing the first word of
  their name (MOWI, SALMAR, LERØY …) share a hue in lighter/darker variants;
  the generator is append-only per brand and member.

- Two languages: English and Norwegian (bokmål) for every visible string,
  hover explanation and help text; selector on the login screen and under
  ⚙ Settings, default from the browser language (`web/src/i18n/`).
- Field filters are multi-select checkboxes with an All toggle, values listed
  alphabetically with an A–Z / count sort switch, composite fields (species,
  purpose, production form) split into their components.
- Lice-history filters: mean lice, peak lice, weeks above the limit and
  treatment weeks over the last 52 weeks, as ranges in the site panel.
- The Offline panel moved from the header into ⚙ Settings.

- Help rewritten in sections (header, map, site panel, lice chart, layers,
  offline, sources) covering all current features.

- Site panel field filters: clicking a register value opens a picker listing
  every value the field takes with site counts (capacity as ranges in
  multiples of the 780 t standard licence); picking one (status, capacity ≥,
  species, purpose, production form, placement, municipality, production area)
  limits the map to matching sites; a red ✕ next to the field and chips under
  the operator dropdown clear filters. Filters combine with the operator
  selection and are remembered.

- Pipeline: NorKyst sampled every 3 hours (four snapshots per tidal cycle);
  the raw archive is compressed NetCDF4 (int16, 1 cm/s / 0.01 °C / 0.01 PSU,
  zlib+shuffle, ~120 MB/day) with a separate grid file.
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
