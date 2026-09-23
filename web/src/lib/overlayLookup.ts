// What every enabled overlay shows at one place. Shared by the hover card, which
// follows the pointer, and the site panel, which asks at the farm's position.
import type { Map as MlMap } from 'maplibre-gl'
import { CATEGORIES, overlaysIn, type LayerDef } from './layers'
import { infoUrl, parseInfo, toMerc } from './featureInfo'
import { sampleDensity, sampleDensityMax } from './tileFilters'
import { heatValueAt } from './heatmap'
import { liceWeekValue } from './liceWeek'
import { climAt, climGrid, CLIM_FIELDS } from './climatology'
import type { Settings } from './settings'
import { isNewApplication, type LocalityProps } from './localities'
import { t } from './i18n'

export interface LookupRow {
  id: string
  title: string
  /** null = nothing at this point, undefined = still loading */
  value: string | null | undefined
}

export const shortTitle = (l: LayerDef) => t(`layer.${l.id}.title`).replace(/\s*\([^)]*\)\s*$/, '')

/** The overlays that are switched on, in panel order. */
export const enabledOverlays = (s: Settings) => CATEGORIES.flatMap((c) => overlaysIn(c.id)).filter((l) => s.overlays.includes(l.id))

/**
 * Rows that can be answered on the device: bundled data, decoded tiles and computed grids.
 * Server-side (GetFeatureInfo) rows come back as `undefined` and are filled by `fetchInfoRows`.
 * `loknr` names the farm when the lookup is for a site rather than a pointer position.
 */
export function instantRows(map: MlMap, lngLat: [number, number], enabled: LayerDef[], s: Settings, loknr?: number): LookupRow[] {
  const point = map.project(lngLat)
  const [mx, my] = toMerc(lngLat[0], lngLat[1])
  const feature = (layer: string) => (map.getLayer(layer) ? map.queryRenderedFeatures(point, { layers: [layer] })[0] : undefined)
  // Mercator metres stretch by 1/cos(lat), so a ground radius is scaled before sampling.
  const mercRadius = (m: number) => m / Math.max(0.2, Math.cos((lngLat[1] * Math.PI) / 180))
  const siteNr = loknr ?? (feature('localities')?.properties as LocalityProps | undefined)?.loknr

  return enabled.map((l) => {
    const row = (value: string | null | undefined, title = shortTitle(l)): LookupRow => ({ id: l.id, title, value })
    if (l.id === 'localities') {
      const p = feature('localities')?.properties as LocalityProps | undefined
      return row(p ? `${p.navn} (${p.loknr})${p.til_innehavere ? ` · ${p.til_innehavere}` : ''}` : null, t('hover.locality'))
    }
    if (l.id === 'measured-currents') {
      const c = feature('measured-currents')?.properties as { navn?: string; mean?: number; max?: number; direction?: number; date?: string } | undefined
      return row(
        c
          ? t('currents.hover', { navn: c.navn ?? '', mean: c.mean ?? '–', max: c.max ?? '–', dir: c.direction == null ? '–' : `${c.direction}°`, date: c.date ?? '–' })
          : null,
      )
    }
    if (l.id === 'applications' || l.id === 'application-anchors') {
      const a = feature(l.id)?.properties as { navn?: string; appNo?: string; applicant?: string; biomass?: number; submitted?: string } | undefined
      return row(a ? `${a.navn ?? a.appNo} · ${a.applicant ?? ''}${a.biomass ? ` · ${a.biomass} t` : ''}${isNewApplication(a as { submitted?: string; appNo: string }) ? ` · ${t('app.new')}` : ''}` : null)
    }
    if (l.id === 'deleted-sites') {
      const p = feature('deleted-sites')?.properties as LocalityProps | undefined
      return row(p ? `${p.navn} (${p.loknr})${p.klareringsdato ? ` · ${t('inspect.clearedShort')} ${String(p.klareringsdato).slice(0, 4)}` : ''}` : null)
    }
    if (l.id === 'site-polygons') {
      const f = feature('site-polygons')
      return row(f ? `${f.properties.name ?? ''} (${f.properties.loknr})` : null, t('hover.border'))
    }
    if (CLIM_FIELDS[l.id]) {
      const g = climGrid(l.id)
      const v = g && climAt(g, lngLat[0], lngLat[1])
      return row(
        v
          ? t('clim.hover', {
              mean: v.mean.toFixed(1),
              p90: v.p90.toFixed(1),
              u: g!.layer.units,
              dir: v.direction == null ? '–' : `${Math.round(v.direction)}°`,
              steady: v.steadiness == null ? '–' : `${Math.round(v.steadiness * 100)} %`,
            })
          : null,
      )
    }
    if (l.id === 'treatment-heat') {
      const h = heatValueAt(l.id, mx, my)
      return row(h ? t('heat.hover', { p: (h.value * 100).toFixed(1), r: h.radiusKm }) : null)
    }
    if (l.id === 'lice-heat') {
      const h = heatValueAt(l.id, mx, my)
      const mode = s.weekHeatMode
      return row(h ? t(`weekHeat.hover.${mode}`, { v: mode === 'treatment' ? Math.round(h.value * 100) : h.value.toFixed(2), r: h.radiusKm }) : null, t(`weekHeat.title.${mode}`))
    }
    if (l.id === 'lice-week') {
      const v = siteNr === undefined ? undefined : liceWeekValue(siteNr)
      return row(siteNr === undefined ? null : v == null ? t('liceWeek.notReported') : t('liceWeek.hover', { v: v.toFixed(2) }))
    }
    if (l.tileFilter && l.wmsLayers) {
      // Traffic: the busiest lane within the lookup radius, else the pixel under the point.
      const d = l.lookup ? sampleDensityMax(l.wmsLayers, mx, my, mercRadius(l.lookup.radiusM)) : sampleDensity(l.wmsLayers, mx, my)
      const label = d === undefined ? null : d === 'none' ? t('hover.noTraffic') : t(`hover.traffic.${d}`)
      return row(label && l.lookup ? t('hover.maxWithin', { v: label, r: l.lookup.radiusM / 1000 }) : label)
    }
    if (l.info) return row(undefined)
    return row(t('hover.noLookup'))
  })
}

const cache = new Map<string, string | null>()

/** GetFeatureInfo for the overlays that need the server; cached per position, zoom and language. */
export async function fetchInfoRows(map: MlMap, lngLat: [number, number], queryable: LayerDef[], lang: string, signal: AbortSignal): Promise<Map<string, string | null>> {
  const mpp = (40075016.686 * Math.cos((lngLat[1] * Math.PI) / 180)) / 256 / 2 ** map.getZoom()
  const key = (l: LayerDef) => `${lang}|${l.id}|${lngLat[0].toFixed(4)}|${lngLat[1].toFixed(4)}|${Math.round(map.getZoom())}`
  const results = await Promise.all(
    queryable.map(async (l): Promise<[string, string | null]> => {
      const k = key(l)
      if (!cache.has(k)) {
        const url = infoUrl(l, lngLat, mpp)
        if (!url) return [l.id, null]
        try {
          const res = await fetch(url, { signal })
          cache.set(k, res.ok ? parseInfo(l.info!, await res.text(), l.id) : null)
        } catch {
          return [l.id, null]
        }
        if (cache.size > 2000) cache.delete(cache.keys().next().value!)
      }
      return [l.id, cache.get(k) ?? null]
    }),
  )
  return new Map(results)
}
