// Configuration-driven layer registry. Every layer declares its source,
// license, attribution and cache policy so nothing is hard-coded in app logic.
// Cache policies are enforced by the service worker (see vite.config.ts):
//   precache   – bundled with the app at build time
//   cache-first – fetched on demand, then served from Cache Storage
//   forecast    – like cache-first but expires within a day (model output changes hourly)

export type LayerKind = 'xyz' | 'wms' | 'geojson'
export type CachePolicy = 'precache' | 'cache-first' | 'forecast'

export interface LayerDef {
  id: string
  title: string
  group: 'base' | 'overlay'
  kind: LayerKind
  /** XYZ tile template, WMS endpoint, or bundled data path (relative to BASE_URL). */
  url: string
  wmsLayers?: string
  /** Extra WMS query parameters (styles, colour scales, ...). */
  params?: Record<string, string>
  /** Legend image URL shown in the layer panel when enabled. */
  legend?: string
  /** How a GeoJSON layer is drawn (default circle). */
  render?: 'circle' | 'fill'
  organisation: string
  license: string
  attribution: string
  cache: CachePolicy
  opacity?: number
  maxzoom?: number
  description?: string
}

const KV = 'https://cache.kartverket.no/v1/wmts/1.0.0'
const NGU = 'https://geo.ngu.no/mapserver/MarineGrunnkartWMS'
const NORKYST = 'https://thredds.met.no/thredds/wms/fou-hi/norkystv3_800m_m00_be'
const KYSTVERKET = 'https://services.kystverket.no/wms.ashx'
const AIS = 'https://wms-geo.kystverket.no/density'
const KV_ATTR = '© Kartverket'
const CC4 = 'CC BY 4.0'
const NLOD = 'NLOD 2.0'

export const LAYERS: LayerDef[] = [
  {
    id: 'topo',
    title: 'Topographic (Kartverket)',
    group: 'base',
    kind: 'xyz',
    url: `${KV}/topo/default/webmercator/{z}/{y}/{x}.png`,
    organisation: 'Kartverket',
    license: CC4,
    attribution: KV_ATTR,
    cache: 'cache-first',
    maxzoom: 18,
  },
  {
    id: 'topograatone',
    title: 'Topographic greytone (Kartverket)',
    group: 'base',
    kind: 'xyz',
    url: `${KV}/topograatone/default/webmercator/{z}/{y}/{x}.png`,
    organisation: 'Kartverket',
    license: CC4,
    attribution: KV_ATTR,
    cache: 'cache-first',
    maxzoom: 18,
  },
  {
    id: 'sjokart',
    title: 'Nautical chart (Kartverket)',
    group: 'base',
    kind: 'xyz',
    url: `${KV}/sjokartraster/default/webmercator/{z}/{y}/{x}.png`,
    organisation: 'Kartverket',
    license: CC4,
    attribution: KV_ATTR,
    cache: 'cache-first',
    maxzoom: 18,
  },
  {
    id: 'dybdedata',
    title: 'Bathymetry (Kartverket Dybdedata)',
    group: 'overlay',
    kind: 'wms',
    url: 'https://wms.geonorge.no/skwms1/wms.dybdedata2',
    wmsLayers: 'Dybdedata2',
    organisation: 'Kartverket',
    license: CC4,
    attribution: KV_ATTR,
    cache: 'cache-first',
    opacity: 0.7,
    description: 'Depth contours and soundings.',
  },
  {
    id: 'naturvern',
    title: 'Protected areas (Miljødirektoratet)',
    group: 'overlay',
    kind: 'wms',
    url: 'https://kart.miljodirektoratet.no/arcgis/services/vern/mapserver/WMSServer',
    wmsLayers: 'naturvern_klasser_omrade',
    organisation: 'Miljødirektoratet',
    license: NLOD,
    attribution: '© Miljødirektoratet',
    cache: 'cache-first',
    opacity: 0.6,
    description: 'Nature reserves, national parks and other protected areas.',
  },
  {
    id: 'bunnhabitat',
    title: 'Protected seabed habitats (Fiskeridirektoratet)',
    group: 'overlay',
    kind: 'wms',
    url: 'https://gis.fiskeridir.no/server/services/fiskeridirWMS/MapServer/WMSServer',
    wmsLayers: 'verneomraader_bunnhabitat',
    organisation: 'Fiskeridirektoratet',
    license: NLOD,
    attribution: '© Fiskeridirektoratet',
    cache: 'cache-first',
    opacity: 0.6,
    description: 'Coral reefs and other protected bottom habitats.',
  },
  {
    id: 'gyteomraader',
    title: 'Spawning areas (Fiskeridirektoratet)',
    group: 'overlay',
    kind: 'wms',
    url: 'https://gis.fiskeridir.no/server/services/fiskeridirWMS/MapServer/WMSServer',
    wmsLayers: 'gyteomraader',
    organisation: 'Fiskeridirektoratet',
    license: NLOD,
    attribution: '© Fiskeridirektoratet',
    cache: 'cache-first',
    opacity: 0.6,
    description: 'Fish spawning grounds reported by fishers.',
  },
  {
    id: 'ngu-sediment',
    title: 'Seabed sediment grain size (NGU)',
    group: 'overlay',
    kind: 'wms',
    url: NGU,
    wmsLayers: 'Sedimentkornstorrelse',
    legend: `${NGU}?service=WMS&request=GetLegendGraphic&version=1.3.0&layer=Sedimentkornstorrelse&format=image/png&sld_version=1.1.0`,
    organisation: 'NGU',
    license: NLOD,
    attribution: '© NGU',
    cache: 'cache-first',
    opacity: 0.7,
    description: 'Marine base maps; coverage limited to surveyed areas.',
  },
  {
    id: 'ngu-anchoring',
    title: 'Anchoring conditions (NGU)',
    group: 'overlay',
    kind: 'wms',
    url: NGU,
    wmsLayers: 'Ankringsforhold',
    legend: `${NGU}?service=WMS&request=GetLegendGraphic&version=1.3.0&layer=Ankringsforhold&format=image/png&sld_version=1.1.0`,
    organisation: 'NGU',
    license: NLOD,
    attribution: '© NGU',
    cache: 'cache-first',
    opacity: 0.7,
    description: 'Seabed suitability for anchoring, from sediment and terrain.',
  },
  {
    id: 'ngu-deposition',
    title: 'Deposition areas (NGU)',
    group: 'overlay',
    kind: 'wms',
    url: NGU,
    wmsLayers: 'Bunnfellingsomrader',
    legend: `${NGU}?service=WMS&request=GetLegendGraphic&version=1.3.0&layer=Bunnfellingsomrader&format=image/png&sld_version=1.1.0`,
    organisation: 'NGU',
    license: NLOD,
    attribution: '© NGU',
    cache: 'cache-first',
    opacity: 0.7,
    description: 'Areas where fine material settles; proxy for waste accumulation.',
  },
  {
    id: 'ngu-slope',
    title: 'Seabed slope (NGU)',
    group: 'overlay',
    kind: 'wms',
    url: NGU,
    wmsLayers: 'Helning',
    legend: `${NGU}?service=WMS&request=GetLegendGraphic&version=1.3.0&layer=Helning&format=image/png&sld_version=1.1.0`,
    organisation: 'NGU',
    license: NLOD,
    attribution: '© NGU',
    cache: 'cache-first',
    opacity: 0.7,
  },
  {
    id: 'norkyst-temp',
    title: 'Sea surface temperature (NorKyst v3)',
    group: 'overlay',
    kind: 'wms',
    url: NORKYST,
    wmsLayers: 'temperature',
    params: { styles: 'default-scalar/x-Rainbow', colorscalerange: '0,20' },
    legend: `${NORKYST}?REQUEST=GetLegendGraphic&LAYER=temperature&PALETTE=x-Rainbow&COLORSCALERANGE=0,20&WIDTH=60&HEIGHT=200&FORMAT=image/png`,
    organisation: 'MET Norway',
    license: CC4,
    attribution: '© MET Norway, NorKyst v3',
    cache: 'forecast',
    opacity: 0.65,
    description: 'Latest 800 m model hour, 0–20 °C.',
  },
  {
    id: 'norkyst-salinity',
    title: 'Sea surface salinity (NorKyst v3)',
    group: 'overlay',
    kind: 'wms',
    url: NORKYST,
    wmsLayers: 'salinity',
    params: { styles: 'default-scalar/x-Rainbow', colorscalerange: '20,35' },
    legend: `${NORKYST}?REQUEST=GetLegendGraphic&LAYER=salinity&PALETTE=x-Rainbow&COLORSCALERANGE=20,35&WIDTH=60&HEIGHT=200&FORMAT=image/png`,
    organisation: 'MET Norway',
    license: CC4,
    attribution: '© MET Norway, NorKyst v3',
    cache: 'forecast',
    opacity: 0.65,
    description: 'Latest 800 m model hour, 20–35 PSU; low values show river plumes.',
  },
  {
    id: 'norkyst-current',
    title: 'Surface current speed (NorKyst v3)',
    group: 'overlay',
    kind: 'wms',
    url: NORKYST,
    wmsLayers: 'u_eastward:v_northward-mag',
    params: { styles: 'default-scalar/x-Rainbow', colorscalerange: '0,1' },
    legend: `${NORKYST}?REQUEST=GetLegendGraphic&LAYER=u_eastward:v_northward-mag&PALETTE=x-Rainbow&COLORSCALERANGE=0,1&WIDTH=60&HEIGHT=200&FORMAT=image/png`,
    organisation: 'MET Norway',
    license: CC4,
    attribution: '© MET Norway, NorKyst v3',
    cache: 'forecast',
    opacity: 0.65,
    description: 'Latest 800 m model hour, 0–1 m/s.',
  },
  {
    id: 'norkyst-arrows',
    title: 'Surface current direction (NorKyst v3)',
    group: 'overlay',
    kind: 'wms',
    url: NORKYST,
    wmsLayers: 'u_eastward:v_northward-dir',
    params: { styles: 'arrows' },
    organisation: 'MET Norway',
    license: CC4,
    attribution: '© MET Norway, NorKyst v3',
    cache: 'forecast',
    opacity: 0.9,
    description: 'Arrows for the latest model hour.',
  },
  {
    id: 'fairways',
    title: 'Main and secondary fairways (Kystverket)',
    group: 'overlay',
    kind: 'wms',
    url: KYSTVERKET,
    wmsLayers: 'layer_552',
    organisation: 'Kystverket',
    license: NLOD,
    attribution: '© Kystverket',
    cache: 'cache-first',
    opacity: 0.9,
    description: 'Hovedled og biled, current fairway regulation.',
  },
  {
    id: 'fairway-area',
    title: 'Fairway areas (Kystverket)',
    group: 'overlay',
    kind: 'wms',
    url: KYSTVERKET,
    wmsLayers: 'layer_554',
    organisation: 'Kystverket',
    license: NLOD,
    attribution: '© Kystverket',
    cache: 'cache-first',
    opacity: 0.5,
    description: 'Farledsareal: the regulated navigation corridor around fairways.',
  },
  {
    id: 'ship-anchorages',
    title: 'Shipping anchorage areas (Kystverket)',
    group: 'overlay',
    kind: 'wms',
    url: KYSTVERKET,
    wmsLayers: 'layer_888',
    organisation: 'Kystverket',
    license: NLOD,
    attribution: '© Kystverket',
    cache: 'cache-first',
    opacity: 0.7,
  },
  {
    id: 'ais-density',
    title: 'AIS vessel track density 2022 (Kystverket)',
    group: 'overlay',
    kind: 'wms',
    url: AIS,
    wmsLayers: 'ais_trackdensity_norway_2022_1000mx1000m',
    organisation: 'Kystverket',
    license: NLOD,
    attribution: '© Kystverket',
    cache: 'cache-first',
    opacity: 0.7,
    description: 'Vessel track density from AIS, 1 km grid, full year 2022.',
  },
  {
    id: 'site-polygons',
    title: 'Aquaculture site borders (Fiskeridirektoratet)',
    group: 'overlay',
    kind: 'geojson',
    render: 'fill',
    url: 'data/site_polygons.geojson',
    organisation: 'Fiskeridirektoratet',
    license: NLOD,
    attribution: '© Fiskeridirektoratet',
    cache: 'precache',
    description: 'Licensed site outlines from Akvakulturregisteret, snapshot bundled with the app.',
  },
  {
    id: 'localities',
    title: 'Aquaculture localities (Fiskeridirektoratet)',
    group: 'overlay',
    kind: 'geojson',
    url: 'data/localities.geojson',
    organisation: 'Fiskeridirektoratet',
    license: NLOD,
    attribution: '© Fiskeridirektoratet',
    cache: 'precache',
    description: 'Active localities from Akvakulturregisteret, snapshot bundled with the app.',
  },
]

export const LOCALITIES_LAYER = 'localities'
export const SALMON_COLOUR = '#f28c28'
export const OTHER_COLOUR = '#2a9d8f'
export const LEGEND = [
  { colour: SALMON_COLOUR, label: 'Salmon / trout locality' },
  { colour: OTHER_COLOUR, label: 'Other species' },
]

export const BASE_LAYERS = LAYERS.filter((l) => l.group === 'base')
export const OVERLAY_LAYERS = LAYERS.filter((l) => l.group === 'overlay')
export const layerById = (id: string) => LAYERS.find((l) => l.id === id)

export function wmsTileUrl(layer: LayerDef): string {
  const q = new URLSearchParams({
    service: 'WMS',
    request: 'GetMap',
    version: '1.3.0',
    layers: layer.wmsLayers ?? '',
    styles: '',
    crs: 'EPSG:3857',
    width: '256',
    height: '256',
    format: 'image/png',
    transparent: 'true',
    ...layer.params,
  })
  return `${layer.url}?${q.toString()}&bbox={bbox-epsg-3857}`
}
