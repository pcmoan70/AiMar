import { useEffect, useRef } from 'react'
import {
  Map as MlMap,
  NavigationControl,
  GeolocateControl,
  ScaleControl,
  type ExpressionSpecification,
  type MapMouseEvent,
  type LayerSpecification,
  type SourceSpecification,
  type StyleSpecification,
} from 'maplibre-gl'
import { BASE_LAYERS, LOCALITIES_LAYER, OVERLAY_LAYERS, SALMON_COLOUR, layerById, wmsTileUrl } from '../lib/layers'
import { OPERATOR_COLOURS, OTHER_COLOUR, paletteFor } from '../lib/operatorColours'
import { getSettings, updateSettings, useSettings, type Settings } from '../lib/settings'
import { dataUrl, type LocalityProps } from '../lib/localities'
import { filteredTileUrl } from '../lib/tileFilters'
import { runJanitor } from '../lib/cacheJanitor'
import { heatValueAt } from '../lib/heatmap'

export type Selection =
  | { type: 'farm'; props: LocalityProps }
  | { type: 'point'; lngLat: [number, number] }

/** What a map click hit; a border polygon only carries its locality number. */
export type MapHit = Selection | { type: 'loknr'; loknr: number }

const POLYGON_LAYER = 'site-polygons'


/** MapLibre filter for the operator selection and field filters (a locality-number list): null means no filter. */
function operatorFilter(_operators: string[], loknrs: number[] | null): { points: ExpressionSpecification; polygons: ExpressionSpecification } | null {
  if (!loknrs) return null
  const expr: ExpressionSpecification = ['in', ['get', 'loknr'], ['literal', loknrs]]
  return { points: expr, polygons: expr }
}

function buildStyle(s: Settings, selectedLoknr: number | null, polygonLoknrs: number[] | null, liceColours: Map<number, string> | null): StyleSpecification {
  const opf = operatorFilter(s.operatorFilter, polygonLoknrs)
  const sources: Record<string, SourceSpecification> = {}
  const layers: LayerSpecification[] = []
  const base = layerById(s.baseLayer) ?? BASE_LAYERS[0]
  sources[base.id] = {
    type: 'raster',
    tiles: [base.url],
    tileSize: 256,
    maxzoom: base.maxzoom,
    attribution: base.attribution,
  }
  layers.push({ id: base.id, type: 'raster', source: base.id })

  for (const l of OVERLAY_LAYERS) {
    if (!s.overlays.includes(l.id)) continue
    if (l.kind === 'computed') {
      if (l.render === 'dots') continue // recolours the locality dots below, no source of its own
      // Image painted by HeatmapLayer; a transparent pixel until the first draw.
      sources[l.id] = {
        type: 'image',
        url: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
        coordinates: [[-180, 85], [180, 85], [180, -85], [-180, -85]],
      }
      layers.push({ id: l.id, type: 'raster', source: l.id, paint: { 'raster-opacity': 1, 'raster-resampling': 'linear' } })
      continue
    }
    if (l.kind === 'wms') {
      const tile = l.tileFilter ? filteredTileUrl(l.tileFilter, wmsTileUrl(l)) : wmsTileUrl(l)
      sources[l.id] = { type: 'raster', tiles: [tile], tileSize: 256, attribution: l.attribution }
      layers.push({ id: l.id, type: 'raster', source: l.id, paint: { 'raster-opacity': l.opacity ?? 1 } })
    } else if (l.kind === 'geojson') {
      sources[l.id] = { type: 'geojson', data: dataUrl(l.url.replace(/^data\//, '')), attribution: l.attribution }
      if (l.render === 'fill') {
        const filter = opf ? { filter: opf.polygons } : {}
        layers.push({ id: l.id, type: 'fill', source: l.id, ...filter, paint: { 'fill-color': SALMON_COLOUR, 'fill-opacity': 0.2 } })
        layers.push({ id: `${l.id}-outline`, type: 'line', source: l.id, ...filter, paint: { 'line-color': '#c8641a', 'line-width': 1.5 } })
        continue
      }
      // Colour by operator: table entries first (fixed order), then selected unlisted operators, else grey.
      const pal = paletteFor(s.operatorFilter)
      const assignments = [
        ...OPERATOR_COLOURS,
        ...s.operatorFilter.filter((op) => !OPERATOR_COLOURS.some((o) => o.name === op)).map((op) => ({ name: op, colour: pal.get(op)! })),
      ]
      // Lice-per-week layer: colour by the chosen week's reported lice instead of by operator.
      const liceExpr: ExpressionSpecification | null = liceColours
        ? (['match', ['get', 'loknr'], ...[...liceColours.entries()].flatMap(([nr, c]) => [nr, c]), OTHER_COLOUR] as unknown as ExpressionSpecification)
        : null
      const colourExpr: ExpressionSpecification = liceExpr ?? [
        'case',
        ...assignments.flatMap((a): [ExpressionSpecification, string] => [
          ['>=', ['index-of', a.name, ['coalesce', ['get', 'til_innehavere'], '']], 0],
          a.colour,
        ]),
        OTHER_COLOUR,
      ] as unknown as ExpressionSpecification
      // Draw order: grey sites at the bottom, then coloured operators with the largest (first in the table) on top.
      const sortExpr: ExpressionSpecification = [
        'case',
        ...assignments.flatMap((a, i): [ExpressionSpecification, number] => [
          ['>=', ['index-of', a.name, ['coalesce', ['get', 'til_innehavere'], '']], 0],
          assignments.length - i,
        ]),
        0,
      ] as unknown as ExpressionSpecification
      layers.push({
        id: l.id,
        type: 'circle',
        source: l.id,
        ...(opf ? { filter: opf.points } : {}),
        layout: { 'circle-sort-key': sortExpr },
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 4, 3, 9, 6, 14, 10],
          'circle-color': colourExpr,
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 1,
        },
      })
      layers.push({
        id: `${l.id}-selected`,
        type: 'circle',
        source: l.id,
        filter: ['==', ['get', 'loknr'], selectedLoknr ?? -1],
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 4, 8, 14, 16],
          'circle-color': 'rgba(0,0,0,0)',
          'circle-stroke-color': '#111111',
          'circle-stroke-width': 3,
        },
      })
    }
  }
  return { version: 8, sources, layers }
}

interface Props {
  selectedLoknr: number | null
  /** Locality numbers matching the operator filter (for the border polygons), null when unfiltered. */
  filteredLoknrs: number[] | null
  /** loknr -> colour for the lice-per-week layer, null when that layer is off. */
  liceColours: Map<number, string> | null
  onSelect: (hit: MapHit) => void
  /** Right-click: the locality under the pointer (or null) and the pixel position. */
  onContextMenu: (locality: LocalityProps | null, point: { x: number; y: number }) => void
  onMap: (map: MlMap | null) => void
}

export default function MapView({ selectedLoknr, filteredLoknrs, liceColours, onSelect, onContextMenu, onMap }: Props) {
  const container = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MlMap | null>(null)
  const onSelectRef = useRef(onSelect)
  onSelectRef.current = onSelect
  const onContextRef = useRef(onContextMenu)
  onContextRef.current = onContextMenu
  const appliedStyle = useRef('')
  const settings = useSettings()
  const styleKey = JSON.stringify([settings.baseLayer, settings.overlays, selectedLoknr, settings.operatorFilter, filteredLoknrs?.length ?? -1, liceColours ? settings.liceWeek : null, liceColours?.size ?? 0])

  useEffect(() => {
    const s = getSettings()
    appliedStyle.current = JSON.stringify([s.baseLayer, s.overlays, null, s.operatorFilter, filteredLoknrs?.length ?? -1, liceColours ? s.liceWeek : null, liceColours?.size ?? 0])
    const map = new MlMap({
      container: container.current!,
      style: buildStyle(s, null, filteredLoknrs, liceColours),
      center: s.view.center,
      zoom: s.view.zoom,
      attributionControl: { compact: true },
      // Decoded tiles kept in memory per source, so panning back never re-reads the disk cache.
      maxTileCacheSize: 300,
    })
    map.addControl(new NavigationControl(), 'top-right')
    map.addControl(new GeolocateControl({ trackUserLocation: false }), 'top-right')
    map.addControl(new ScaleControl({ unit: 'metric' }), 'bottom-left')

    map.on('moveend', () => {
      const c = map.getCenter()
      updateSettings({ view: { center: [c.lng, c.lat], zoom: map.getZoom() } })
    })
    map.on('click', (e: MapMouseEvent) => {
      const hit = map.getLayer(LOCALITIES_LAYER)
        ? map.queryRenderedFeatures(e.point, { layers: [LOCALITIES_LAYER] })[0]
        : undefined
      if (hit) return onSelectRef.current({ type: 'farm', props: hit.properties as LocalityProps })
      const poly = map.getLayer(POLYGON_LAYER)
        ? map.queryRenderedFeatures(e.point, { layers: [POLYGON_LAYER] })[0]
        : undefined
      if (poly) return onSelectRef.current({ type: 'loknr', loknr: Number(poly.properties.loknr) })
      onSelectRef.current({ type: 'point', lngLat: [e.lngLat.lng, e.lngLat.lat] })
    })
    map.on('contextmenu', (e: MapMouseEvent) => {
      e.preventDefault()
      const hit = map.getLayer(LOCALITIES_LAYER)
        ? map.queryRenderedFeatures(e.point, { layers: [LOCALITIES_LAYER] })[0]
        : undefined
      onContextRef.current(hit ? (hit.properties as LocalityProps) : null, { x: e.point.x, y: e.point.y })
    })
    map.on('mouseenter', LOCALITIES_LAYER, () => (map.getCanvas().style.cursor = 'pointer'))
    map.on('mouseleave', LOCALITIES_LAYER, () => (map.getCanvas().style.cursor = ''))

    mapRef.current = map
    ;(window as unknown as { __aimar: { map: MlMap; runJanitor: typeof runJanitor; heatValueAt: typeof heatValueAt } }).__aimar = { map, runJanitor, heatValueAt } // test hook (scripts/smoke.mjs)
    onMap(map)
    return () => {
      onMap(null)
      map.remove()
      mapRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!mapRef.current || styleKey === appliedStyle.current) return
    appliedStyle.current = styleKey
    mapRef.current.setStyle(buildStyle(settings, selectedLoknr, filteredLoknrs, liceColours), { diff: true })
  }, [styleKey]) // eslint-disable-line react-hooks/exhaustive-deps

  return <div ref={container} className="map" />
}
