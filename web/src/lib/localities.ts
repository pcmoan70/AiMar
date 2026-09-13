import type { FeatureCollection, Point } from 'geojson'

export interface LocalityProps {
  loknr: number
  navn: string
  status_lokalitet: string
  kapasitet_lok: number | null
  kapasitet_unittype: string | null
  plassering: string
  vannmiljo: string
  fylke: string
  kommune: string
  til_arter: string | null
  til_innehavere: string | null
  til_formaal: string | null
  til_produksjonsform: string | null
  prodareacode: string | null
  klareringsdato: number | null
  lokalitet_url: string | null
}

export type Localities = FeatureCollection<Point, LocalityProps>

export interface DataManifest {
  retrieved: string
  sources: { file: string; organisation: string; dataset: string; url: string; license: string; featureCount: number }[]
}

// Absolute URL: MapLibre fetches GeoJSON from a worker where relative paths do not resolve.
export const dataUrl = (file: string) => new URL(`${import.meta.env.BASE_URL}data/${file}`, location.href).href

export async function loadLocalities(): Promise<Localities> {
  const res = await fetch(dataUrl('localities.geojson'))
  if (!res.ok) throw new Error(`localities: HTTP ${res.status}`)
  return res.json()
}

export async function loadManifest(): Promise<DataManifest> {
  const res = await fetch(dataUrl('manifest.json'))
  if (!res.ok) throw new Error(`manifest: HTTP ${res.status}`)
  return res.json()
}

export const isSalmon = (p: LocalityProps) => /laks/i.test(p.til_arter ?? '')

/** Great-circle distance in km. */
export function haversineKm(a: [number, number], b: [number, number]) {
  const R = 6371
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(b[1] - a[1])
  const dLon = toRad(b[0] - a[0])
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[1])) * Math.cos(toRad(b[1])) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

export interface Neighbourhood {
  nearest: { name: string; loknr: number; km: number } | null
  within: { km: number; count: number; capacityTn: number }[]
}

/** Simple neighbourhood features for an arbitrary point (plan §10, "neighbouring farms"). */
export function neighbourhood(localities: Localities, at: [number, number]): Neighbourhood {
  const radii = [5, 10, 20, 50]
  const within = radii.map((km) => ({ km, count: 0, capacityTn: 0 }))
  let nearest: Neighbourhood['nearest'] = null
  for (const f of localities.features) {
    const km = haversineKm(at, f.geometry.coordinates as [number, number])
    if (!nearest || km < nearest.km) nearest = { name: f.properties.navn, loknr: f.properties.loknr, km }
    const cap = f.properties.kapasitet_unittype === 'TN' ? (f.properties.kapasitet_lok ?? 0) : 0
    for (const w of within) {
      if (km <= w.km) {
        w.count++
        w.capacityTn += cap
      }
    }
  }
  return { nearest, within }
}
