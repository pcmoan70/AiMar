// Explanations shown on hover for every displayed figure: source and method.
const REG = 'Source: Fiskeridirektoratet, Akvakulturregisteret (open data, NLOD 2.0), snapshot bundled with the app; refreshed weekly.'
const BW = 'Source: BarentsWatch fish-health API (NLOD 2.0), weekly reports filed by the farm, snapshot bundled with the app.'

export const HINTS = {
  loknr: `Locality number: the register's permanent identifier for the site. ${REG}`,
  status: `Register status of the locality (AKTIV = active). ${REG}`,
  capacity: `Maximum permitted standing biomass (tonnes, TN) or, for some fresh-water sites, number of fish (STK). Register field kapasitet_lok. ${REG}`,
  species: `Species the locality is cleared for (register field til_arter). ${REG}`,
  operators: `Licence holders connected to the site (register field til_innehavere). ${REG}`,
  purpose: `Licence purpose, e.g. KOMMERSIELL (commercial), FORSKNING (research). ${REG}`,
  productionForm: `Production form, e.g. Matfisk (grow-out), Settefisk (smolt). ${REG}`,
  placement: `Placement (SJØ = sea, LAND = on land) and water environment. ${REG}`,
  municipality: `Municipality and county of the site position. ${REG}`,
  prodArea: `Production area (1–13) under the traffic-light system that regulates growth by lice impact on wild salmon. ${REG}`,
  clearance: `Date of the first clearance (approval) of the locality. ${REG}`,
  latestLice: `Most recent reported average number of adult female salmon lice per fish. Farms count lice weekly; the regulatory limit is 0.5 (0.2 in spring in some areas). ${BW}`,
  last52: `Over the last 52 weeks of the snapshot: weeks with a lice report, weeks where the reported average exceeded 0.5 adult female lice per fish, and weeks flagged with mechanical removal or medicinal (bath/feed) treatment. ${BW}`,
  liceChart: `Weekly average adult female lice per fish for the last four years. Red line = 0.5 limit; grey bands = weeks reported as fallow; ▲ mechanical removal, ◆ medicinal treatment. Hover the chart for values. ${BW}`,
  position: 'Clicked position in WGS84 latitude/longitude, five decimals (about 1 m).',
  nearestFarm: `Closest active locality by great-circle (haversine) distance from the clicked point to the register position of each site. ${REG}`,
  licePressure: `Regional lice pressure: for all active localities within the radius, every weekly report in the last 52 weeks is pooled. Mean lice = average of the reported adult-female-lice values; Weeks > limit = share of those farm-weeks above 0.5; Farms = localities that reported at least once. Distances are great-circle from the clicked point. ${BW}`,
  neighbours: `Number of active localities within each radius (great-circle distance) and the sum of their permitted capacity in tonnes (sites with capacity in tonnes only). ${REG}`,
  operatorSites: `Sites where this operator is listed as licence holder, and the sum of those sites' permitted capacity in tonnes. A site with several holders counts for each of them. ${REG}`,
  storage: 'Reported by the browser (navigator.storage.estimate): space used by this app’s caches, data and settings, and the quota the browser allows it.',
  tileCount: 'Number of map images to fetch for the current view: for every enabled base and overlay layer, all tiles covering the view at the current zoom and the extra zoom levels below it.',
  cacheCounts: 'Entries in the service-worker caches on this device: every base-map tile, overlay image (WMS and AIS density, including hover lookups) and NorKyst forecast image fetched so far is kept and served from disk on repeat visits; the most recently viewed tiles are also held in memory by the map. Forecast images expire after a day, overlays after 90 days, base tiles after 180 days.',
  snapshot: 'Date the bundled datasets were downloaded from their sources; a weekly job refreshes them and redeploys the app.',
} as const

export type HintKey = keyof typeof HINTS
