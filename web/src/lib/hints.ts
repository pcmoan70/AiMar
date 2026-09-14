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
  liceChart: `Weekly average adult female lice per fish, from 2012 when weekly reporting started; the Period dropdown shows the last year, 4 or 8 years, or everything. The "Site vs average" view plots each week as a dot, the comparison average on the x-axis and this site on the y-axis: dots above the diagonal are weeks where this site had more lice than its surroundings. Red line = 0.5 limit; grey bands = weeks reported as fallow; ▲ mechanical removal, ◆ medicinal treatment. Hover the chart for values. ${BW}`,
  liceChartAll: `History view — blue line: this site's weekly adult female lice per fish. Orange line: the lice level at all other farms within 150 km as seen from this site, averaged with weights 1/d² (d = great-circle distance, floor 0.5 km), a passive radial-spread assumption that ignores currents, wind and waves. Only farms that filed a lice report that week count: a missing report means the farm was not operating (fallow or empty), not zero lice, so it carries no weight. Weeks with no reporting farm are gaps. ${BW}`,
  liceChartOperators: `History view — blue line: this site's weekly adult female lice per fish. Each coloured line is the lice level at one selected operator's other farms within 150 km, seen from this site: the farms' reported values are averaged with weights 1/d² (d = great-circle distance, floor 0.5 km), a passive radial-spread assumption that ignores currents, wind and waves. Only farms that filed a lice report that week count: a missing report means the farm was not operating (fallow or empty), not zero lice, so it carries no weight. Weeks with no reporting farm are gaps. "Site vs average" plots each week as a dot (x = the operator average, y = this site); above the diagonal means this site had more lice. ${BW}`,
  position: 'Clicked position in WGS84 latitude/longitude, five decimals (about 1 m).',
  nearestFarm: `Closest active locality by great-circle (haversine) distance from the clicked point to the register position of each site. ${REG}`,
  licePressure: `Regional lice pressure: for all active localities within the radius, every weekly lice report in the last 52 weeks is pooled; weeks without a report mean the farm was not operating and are left out, never counted as zero. Mean lice = average of the reported adult-female-lice values; Weeks > limit = share of those farm-weeks above 0.5; Farms = localities that reported at least once. Distances are great-circle from the clicked point. ${BW}`,
  neighbours: `Number of active localities within each radius (great-circle distance) and the sum of their permitted capacity in tonnes (sites with capacity in tonnes only). ${REG}`,
  operatorSites: `Sites where this operator is listed as licence holder, and the sum of those sites' permitted capacity in tonnes. A site with several holders counts for each of them. ${REG}`,
  storage: 'Reported by the browser (navigator.storage.estimate): space used by this app’s caches, data and settings, and the quota the browser allows it.',
  tileCount: 'Number of map images to fetch for the current view: for every enabled base and overlay layer, all tiles covering the view at the current zoom and the extra zoom levels below it.',
  cacheCounts: 'Entries in the service-worker caches on this device: every base-map tile, overlay image (WMS and AIS density, including hover lookups) and NorKyst forecast image fetched so far is kept and served from disk on repeat visits; the most recently viewed tiles are also held in memory by the map. Forecast images expire after a day, overlays after 90 days, base tiles after 180 days.',
  cacheLimit: 'When the browser reports more storage in use than this limit, the app removes cached entries least-recently-used first: overlay images, forecast images and lookups before base-map tiles, until usage is below 90 % of the limit. Runs 30 s after start-up and every 10 minutes; the app shell and bundled data are never removed.',
  snapshot: 'Date the bundled datasets were downloaded from their sources; a weekly job refreshes them and redeploys the app.',
} as const

export type HintKey = keyof typeof HINTS
