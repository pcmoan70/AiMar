# AiMar architecture

_Updated 2026-09-14 (fish health) — Phase 1 (offline-first PWA, no backend)_

## Overview

Phase 1 is a static web application. The browser talks directly to open
Norwegian map services; datasets that the browser cannot reach (no CORS or
token required) are snapshotted at build time and bundled with the app. A
service worker makes the app shell, bundled data and every viewed tile
available offline.

```mermaid
flowchart LR
  subgraph Browser
    UI[React UI<br/>App, panels] --> Map[MapView<br/>MapLibre GL]
    UI --> Settings[(localStorage<br/>settings)]
    Map --> SW[Service worker<br/>Workbox]
    UI --> SW
    SW --> Precache[(Cache Storage<br/>app shell + data snapshot)]
    SW --> Tiles[(Cache Storage<br/>map-tiles, wms-images)]
  end
  SW -- online --> KV[Kartverket WMTS / WMS]
  SW -- online --> MD[Miljødirektoratet WMS]
  SW -- online --> FD[Fiskeridirektoratet WMS]
  SW -- online --> NGU[NGU marine geology WMS]
  SW -- online --> MET[MET NorKyst ncWMS]
  SW -- online --> KYV[Kystverket WMS + AIS density WMS]
  Build[scripts/fetch-data.mjs<br/>build time + weekly workflow] --> FDREST[Fiskeridirektoratet ArcGIS REST]
  Build --> PUBAQUA[Fiskeridirektoratet pub-aqua API<br/>site borders]
  Build -- client credentials --> BW[BarentsWatch fish-health API]
  Build --> Data[public/data/*.geojson + manifest.json]
  Data --> Precache
```

## Source layout (`web/src`)

| File | Responsibility |
|---|---|
| `main.tsx` | Boots React, points MapLibre at its bundled worker |
| `App.tsx` | Layout: header tabs, map, side panel, update toast |
| `components/MapView.tsx` | Builds a MapLibre style from the layer registry + settings, click/hover handling, persists view |
| `components/LayerPanel.tsx` | Base-map radio, overlay checkboxes, legend, provenance per layer |
| `components/InspectPanel.tsx` | Locality register entry, or hypothetical-site neighbourhood summary |
| `components/OfflinePanel.tsx` | Online state, install button, storage usage, area download, cache clearing, data snapshot provenance |
| `components/SearchBox.tsx` | Header search: name/number lookup, fly-to and select |
| `components/OperatorDropdown.tsx` | Floating operator filter on the map; drives MapLibre filters on localities and borders |
| `components/HelpPanel.tsx` | In-app help |
| `components/UpdatePrompt.tsx` | "New version" / "ready offline" toast via `virtual:pwa-register/react`; polls `sw.js` every 10 min and on focus/online |
| `lib/layers.ts` | **Layer registry**: id, kind (xyz / wms / geojson), URL, organisation, licence, attribution, cache policy |
| `lib/settings.ts` | `localStorage`-backed settings store exposed through `useSyncExternalStore` |
| `lib/localities.ts` | Locality types, data loader, haversine neighbourhood features, search |
| `lib/fishhealth.ts` | Fish-health snapshot types, per-locality lice series, 52-week summary, regional lice pressure |
| `components/LiceChart.tsx` | SVG lice time series: 0.5 limit line, fallow wash, treatment markers, hover readout, table view |
| `lib/offline.ts` | Online hook, tile enumeration for a bounding box, prefetch with concurrency, storage estimate, cache clearing |
| `lib/install.ts` | Captures `beforeinstallprompt` |
| `lib/tileFilters.ts` | Custom `aisalpha://` tile protocol: decodes density tiles and sets alpha from traffic rank (hue palette for MarTraf, distance-from-white for the 2022 layer) |
| `lib/__tests__/` | Vitest unit tests for tile maths, neighbourhood features and the settings store |

## Storage model

| Data | Store | Written by | Policy |
|---|---|---|---|
| App shell (JS/CSS/HTML/icons) and `public/data/*` | Workbox precache | Service worker install | Versioned per build; new version prompts reload |
| Kartverket tiles | Cache Storage `map-tiles` | Service worker runtime caching | Cache-first, 20 000 entries / 180 days |
| WMS images (Kartverket, Miljødirektoratet, Fiskeridirektoratet, NGU, Kystverket) | Cache Storage `wms-images` | Service worker runtime caching | Cache-first, 10 000 entries / 60 days |
| NorKyst forecast images (MET thredds) | Cache Storage `forecast-images` | Service worker runtime caching | Cache-first, 3 000 entries / 1 day |
| Settings | `localStorage` key `aimar.settings.v1` | `lib/settings.ts` | Never evicted with caches |
| Per-site time series (future) | IndexedDB | Phase 2 | Per locality, explicit refresh |

The "Download this area" action simply fetches every tile URL for the active
layers over the current bounds and zoom range; the service worker's runtime
caching stores the responses, so prefetch and normal browsing share one cache.

```mermaid
sequenceDiagram
  participant U as User
  participant P as OfflinePanel
  participant SW as Service worker
  participant C as Cache Storage
  participant S as Tile server
  U->>P: Download (zoom z..z+depth)
  P->>P: enumerate tiles for bounds × active layers
  loop up to 6 in flight
    P->>SW: fetch(tileUrl)
    SW->>C: match
    alt cached
      C-->>SW: response
    else
      SW->>S: GET tile
      S-->>SW: image
      SW->>C: put
    end
    SW-->>P: response
  end
  P->>U: progress, storage usage
```

## Rendering

`MapView.buildStyle` turns the registry + settings into a MapLibre style:
raster sources for XYZ and WMS (WMS uses a `{bbox-epsg-3857}` tile template),
GeoJSON sources drawn as circles (localities, coloured by species, plus a
highlight layer filtered on the selected locality number) or as fill + outline
(site borders). Clicking a border resolves its locality number to the bundled
locality record. Settings changes call
`setStyle(..., { diff: true })` so only changed layers are touched.

Two MapLibre 6 details matter under Vite: the worker must be registered with
`setWorkerUrl` using a `?worker&url` import, and GeoJSON `data` URLs must be
absolute because they are fetched from that worker.

## Build-time data snapshot

`scripts/fetch-data.mjs` queries the Fiskeridirektoratet ArcGIS REST layer
`akvakultur_lokaliteter` (1781 active localities) as GeoJSON, then fetches each
site's border polygon from the pub-aqua API (`/sites/{siteNr}/borders`, two
workers, backing off on HTTP 429). It rounds coordinates to 6 decimals and
writes `localities.geojson`, `site_polygons.geojson` and a `manifest.json` with
retrieval timestamp, source URL, licence and feature counts. The service worker
precaches all three, so they are available on first offline start. The
`refresh-data` workflow runs the script weekly and commits + redeploys when the
data changed.

`scripts/fetch-fishhealth.mjs` obtains a BarentsWatch token with client
credentials (from `web/.env.local` locally, repository secrets in CI), then
calls `fishhealth/locality/{year}/{week}` once per ISO week for the last three
full years plus the current year. It writes `fishhealth.json`: the week labels
plus, per locality, an array of adult-female-lice values and an array of flag
bitmasks (reported, fallow, mechanical removal, substance treatment, cleaner
fish, PD, ILA). Localities without any report are dropped. The file is
precached with the rest of the data.

## Testing

`npm test` runs Vitest unit tests for the pure modules (tile enumeration and
URLs, haversine/neighbourhood features, settings persistence).
`scripts/smoke.mjs` drives headless Chrome against the preview build: map
load, tile requests, service-worker activation, tiles in Cache Storage,
click-to-inspect, settings persistence, and an offline reload that must render
tiles from cache.

## Later phases

Phases 2+ add the Python/FastAPI feature engine, PostGIS, NorKyst statistics,
connectivity modelling and per-site time series (cached in IndexedDB). The
layer registry and cache policies are designed so those services plug in as
additional entries rather than code changes in the map.
