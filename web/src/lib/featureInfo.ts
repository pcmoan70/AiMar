// Hover lookups for WMS overlays: build a GetFeatureInfo request for the pixel
// under the cursor and reduce the server's answer to one short string.
import type { LayerDef } from './layers'

export type InfoKind = 'ncwms' | 'arcgis' | 'mapserver'

export interface InfoSpec {
  kind: InfoKind
  /** Query layers when they differ from the drawn layers (e.g. a queryable sub-layer). */
  layers?: string
  /** Property names to prefer when summarising a feature. */
  keys?: string[]
  /** Unit appended to numeric values. */
  unit?: string
  /** Label when a feature is present but carries no usable attributes. */
  presence?: string
}

const R = 6378137
export const toMerc = (lng: number, lat: number): [number, number] => [
  (R * lng * Math.PI) / 180,
  R * Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360)),
]

const FORMAT: Record<InfoKind, string> = { ncwms: 'text/xml', arcgis: 'application/geo+json', mapserver: 'text/plain' }

/** GetFeatureInfo URL for a 101×101 px window centred on lngLat at the given ground resolution (m/px). */
export function infoUrl(layer: LayerDef, lngLat: [number, number], metresPerPixel: number): string | null {
  if (!layer.info || layer.kind !== 'wms') return null
  const [x, y] = toMerc(lngLat[0], lngLat[1])
  const half = 50 * metresPerPixel
  const q = new URLSearchParams({
    service: 'WMS',
    request: 'GetFeatureInfo',
    version: '1.3.0',
    layers: layer.wmsLayers ?? '',
    query_layers: layer.info.layers ?? layer.wmsLayers ?? '',
    styles: '',
    crs: 'EPSG:3857',
    bbox: `${x - half},${y - half},${x + half},${y + half}`,
    width: '101',
    height: '101',
    i: '50',
    j: '50',
    format: 'image/png',
    info_format: FORMAT[layer.info.kind],
    feature_count: '3',
    ...(layer.info.kind === 'mapserver' ? { buffer: '4' } : {}),
    ...Object.fromEntries(Object.entries(layer.params ?? {}).filter(([k]) => k !== 'styles' && k !== 'colorscalerange')),
  })
  const sep = layer.url.includes('?') ? '&' : '?'
  return `${layer.url}${sep}${q.toString()}`
}

const KEY_HINT = /navn|name|type|kategori|verneform|art|klasse|class|omrade|beskr|kornst|helning|ankr|bunnfell|leid|status/i

function summarise(props: Record<string, unknown>, keys?: string[]): string | null {
  const entries = Object.entries(props).filter(([, v]) => v != null && v !== '' && typeof v !== 'object')
  if (!entries.length) return null
  const preferred = keys?.map((k) => entries.find(([ek]) => ek.toLowerCase() === k.toLowerCase())).filter(Boolean) as [string, unknown][]
  const picked = preferred?.length ? preferred : entries.filter(([k]) => KEY_HINT.test(k)).slice(0, 2)
  const use = picked.length ? picked : entries.slice(0, 1)
  return use.map(([, v]) => String(v)).join(' · ')
}

/** Reduce a GetFeatureInfo response to a short label, or null when nothing is there. */
export function parseInfo(spec: InfoSpec, text: string): string | null {
  if (!text || /ServiceException/i.test(text)) return null
  if (spec.kind === 'ncwms') {
    const m = text.match(/<value>([^<]+)<\/value>/)
    if (!m) return null
    const v = Number(m[1])
    return Number.isFinite(v) ? `${v.toFixed(2)}${spec.unit ? ` ${spec.unit}` : ''}` : m[1]
  }
  if (spec.kind === 'arcgis') {
    try {
      const fc = JSON.parse(text)
      const f = fc.features?.[0]
      return f ? (summarise(f.properties ?? {}, spec.keys) ?? spec.presence ?? 'present') : null
    } catch {
      return null
    }
  }
  // MapServer text/plain: "  key = 'value'" lines per feature
  if (/returned no results/i.test(text)) return null
  const props: Record<string, string> = {}
  for (const line of text.split('\n')) {
    const m = line.match(/^\s*([\w.]+)\s*=\s*'?(.*?)'?\s*$/)
    if (m && !props[m[1]]) props[m[1]] = m[2]
  }
  return summarise(props, spec.keys) ?? (/Feature \d+/.test(text) ? (spec.presence ?? 'present') : null)
}
