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
/** Opacity of localities with no lice report for the chosen week (not operating). */
const NOT_REPORTED_ALPHA = 0.2
/** Ring on sites over the lice limit in force that week (0.2 in the spring weeks, else 0.5). */
const OVER_LIMIT_STROKE = '#7f0d0d'

export const DELETED_LAYER = 'deleted-sites'
/** Muted slate for withdrawn sites, distinct from the operator palette. */
const DELETED_COLOUR = '#6b7a88'

export type MapHit = Selection | { type: 'loknr'; loknr: number }

const POLYGON_LAYER = 'site-polygons'


/** MapLibre filter for the operator selection and field filters (a locality-number list): null means no filter. */
function operatorFilter(_operators: string[], loknrs: number[] | null): { points: ExpressionSpecification; polygons: ExpressionSpecification } | null {
  if (!loknrs) return null
  const expr: ExpressionSpecification = ['in', ['get', 'loknr'], ['literal', loknrs]]
  return { points: expr, polygons: expr }
}

interface LiceStyle {
  colours: Map<number, string> | null
  dim: number[] | null
  over: number[] | null
  ranks: number[][] | null
}

/** Paint and layout expressions for the locality dots. Kept separate so a week change can be applied
 *  with setPaintProperty instead of rebuilding the whole style, which made the map flash. */
function circleExpressions(s: Settings, lice: LiceStyle) {
      // Colour by operator: table entries first (fixed order), then selected unlisted operators, else grey.
  const pal = paletteFor(s.operatorFilter)
  const assignments = [
    ...OPERATOR_COLOURS,
    ...s.operatorFilter.filter((op) => !OPERATOR_COLOURS.some((o) => o.name === op)).map((op) => ({ name: op, colour: pal.get(op)! })),
  ]
  // Lice-per-week layer: colour by the chosen week's reported lice instead of by operator.
  const liceExpr: ExpressionSpecification | null = lice.colours
    ? (['match', ['get', 'loknr'], ...[...lice.colours.entries()].flatMap(([nr, c]) => [nr, c]), OTHER_COLOUR] as unknown as ExpressionSpecification)
    : null
  // Sites with no report for the chosen week were not operating: draw them faded.
  const opacityExpr: ExpressionSpecification | number = liceExpr && lice.dim?.length ? (['match', ['get', 'loknr'], lice.dim, NOT_REPORTED_ALPHA, 1] as unknown as ExpressionSpecification) : 1
  const strokeExpr: ExpressionSpecification | string = liceExpr && lice.over?.length ? (['match', ['get', 'loknr'], lice.over, OVER_LIMIT_STROKE, '#ffffff'] as unknown as ExpressionSpecification) : '#ffffff'
  const strokeWidth: ExpressionSpecification | number = liceExpr && lice.over?.length ? (['match', ['get', 'loknr'], lice.over, 2, 1] as unknown as ExpressionSpecification) : 1
  const colourExpr: ExpressionSpecification = liceExpr ?? [
    'case',
    ...assignments.flatMap((a): [ExpressionSpecification, string] => [
      ['>=', ['index-of', a.name, ['coalesce', ['get', 'til_innehavere'], '']], 0],
      a.colour,
    ]),
    OTHER_COLOUR,
  ] as unknown as ExpressionSpecification
  // While the weekly lice layer is on, draw order follows the lice level: the worst on top,
  // sites without a report at the bottom. Otherwise it follows operator size.
  const liceSort: ExpressionSpecification | null =
    liceExpr && lice.ranks?.some((b) => b.length)
      ? (['match', ['get', 'loknr'], ...lice.ranks.flatMap((b, i) => (b.length ? [b, i + 1] : [])), 0] as unknown as ExpressionSpecification)
      : null
  const sortExpr: ExpressionSpecification = liceSort ?? [
    'case',
    ...assignments.flatMap((a, i): [ExpressionSpecification, number] => [
      ['>=', ['index-of', a.name, ['coalesce', ['get', 'til_innehavere'], '']], 0],
      assignments.length - i,
    ]),
    0,
  ] as unknown as ExpressionSpecification
  return { colourExpr, opacityExpr, strokeExpr, strokeWidth, sortExpr }
}

function buildStyle(
  s: Settings,
  selectedLoknr: number | null,
  polygonLoknrs: number[] | null,
  liceColours: Map<number, string> | null,
  liceDim: number[] | null,
  liceOver: number[] | null,
  liceRanks: number[][] | null,
): StyleSpecification {
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
      if (l.id === DELETED_LAYER) {
        // Former farms: hollow grey rings, under the active localities.
        layers.push({
          id: l.id,
          type: 'circle',
          source: l.id,
          paint: {
            'circle-radius': ['interpolate', ['linear'], ['zoom'], 4, 2.5, 9, 5, 14, 8],
            'circle-color': 'rgba(255,255,255,.55)',
            'circle-stroke-color': DELETED_COLOUR,
            'circle-stroke-width': 1.5,
          },
        })
        continue
      }
      if (l.render === 'fill') {
        const filter = opf ? { filter: opf.polygons } : {}
        layers.push({ id: l.id, type: 'fill', source: l.id, ...filter, paint: { 'fill-color': SALMON_COLOUR, 'fill-opacity': 0.2 } })
        layers.push({ id: `${l.id}-outline`, type: 'line', source: l.id, ...filter, paint: { 'line-color': '#c8641a', 'line-width': 1.5 } })
        continue
      }
      const { colourExpr, opacityExpr, strokeExpr, strokeWidth, sortExpr } = circleExpressions(s, { colours: liceColours, dim: liceDim, over: liceOver, ranks: liceRanks })
      layers.push({
        id: l.id,
        type: 'circle',
        source: l.id,
        ...(opf ? { filter: opf.points } : {}),
        layout: { 'circle-sort-key': sortExpr },
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 4, 3, 9, 6, 14, 10],
          'circle-color': colourExpr,
          'circle-opacity': opacityExpr,
          'circle-stroke-color': strokeExpr,
          'circle-stroke-width': strokeWidth,
          'circle-stroke-opacity': opacityExpr,
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
  /** Locality numbers without a report for the chosen week, drawn faded. */
  liceDim: number[] | null
  /** Locality numbers over the limit in force that week, ringed. */
  liceOver: number[] | null
  /** Locality numbers grouped by lice bin, lowest first; drives the draw order while scrubbing. */
  liceRanks: number[][] | null
  onSelect: (hit: MapHit) => void
  /** Right-click: the locality under the pointer (or null) and the pixel position. */
  onContextMenu: (locality: LocalityProps | null, point: { x: number; y: number }) => void
  onMap: (map: MlMap | null) => void
}

export default function MapView({ selectedLoknr, filteredLoknrs, liceColours, liceDim, liceOver, liceRanks, onSelect, onContextMenu, onMap }: Props) {
  const container = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MlMap | null>(null)
  const onSelectRef = useRef(onSelect)
  onSelectRef.current = onSelect
  const onContextRef = useRef(onContextMenu)
  onContextRef.current = onContextMenu
  const appliedStyle = useRef('')
  const settings = useSettings()
  const styleKey = JSON.stringify([settings.baseLayer, settings.overlays, selectedLoknr, settings.operatorFilter, filteredLoknrs?.length ?? -1, !!liceColours])

  useEffect(() => {
    const s = getSettings()
    appliedStyle.current = JSON.stringify([s.baseLayer, s.overlays, null, s.operatorFilter, filteredLoknrs?.length ?? -1, !!liceColours])
    const map = new MlMap({
      container: container.current!,
      style: buildStyle(s, null, filteredLoknrs, liceColours, liceDim, liceOver, liceRanks),
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
      const gone = map.getLayer(DELETED_LAYER) ? map.queryRenderedFeatures(e.point, { layers: [DELETED_LAYER] })[0] : undefined
      if (gone) return onSelectRef.current({ type: 'farm', props: gone.properties as LocalityProps })
      onSelectRef.current({ type: 'point', lngLat: [e.lngLat.lng, e.lngLat.lat] })
    })
    map.on('contextmenu', (e: MapMouseEvent) => {
      e.preventDefault()
      const hit = map.getLayer(LOCALITIES_LAYER)
        ? map.queryRenderedFeatures(e.point, { layers: [LOCALITIES_LAYER] })[0]
        : undefined
      onContextRef.current(hit ? (hit.properties as LocalityProps) : null, { x: e.point.x, y: e.point.y })
    })
    for (const id of [LOCALITIES_LAYER, DELETED_LAYER]) {
      map.on('mouseenter', id, () => (map.getCanvas().style.cursor = 'pointer'))
      map.on('mouseleave', id, () => (map.getCanvas().style.cursor = ''))
    }

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

  // A week change only repaints the dots: rebuilding the style would reload sources and flash the map.
  const liceKey = JSON.stringify([liceColours ? [...liceColours.entries()] : null, liceDim, liceOver, liceRanks])
  useEffect(() => {
    const map = mapRef.current
    if (!map || !map.getLayer(LOCALITIES_LAYER)) return
    const { colourExpr, opacityExpr, strokeExpr, strokeWidth, sortExpr } = circleExpressions(settings, { colours: liceColours, dim: liceDim, over: liceOver, ranks: liceRanks })
    map.setPaintProperty(LOCALITIES_LAYER, 'circle-color', colourExpr)
    map.setPaintProperty(LOCALITIES_LAYER, 'circle-opacity', opacityExpr)
    map.setPaintProperty(LOCALITIES_LAYER, 'circle-stroke-color', strokeExpr)
    map.setPaintProperty(LOCALITIES_LAYER, 'circle-stroke-width', strokeWidth)
    map.setPaintProperty(LOCALITIES_LAYER, 'circle-stroke-opacity', opacityExpr)
    map.setLayoutProperty(LOCALITIES_LAYER, 'circle-sort-key', sortExpr)
  }, [liceKey]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!mapRef.current || styleKey === appliedStyle.current) return
    appliedStyle.current = styleKey
    mapRef.current.setStyle(buildStyle(settings, selectedLoknr, filteredLoknrs, liceColours, liceDim, liceOver, liceRanks), { diff: true })
  }, [styleKey]) // eslint-disable-line react-hooks/exhaustive-deps

  return <div ref={container} className="map" />
}
