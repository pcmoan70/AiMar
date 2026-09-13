# Changes

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
