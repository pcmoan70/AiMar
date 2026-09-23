// Symbols that mark what is live right now, the same on the map and in the lists:
// a diamond for an application at public inspection, a star for a newly submitted application.
export const SYMBOL_COLOURS = {
  hearing: '#8e24aa',
  hearingPast: '#9aa4ae',
  newApplication: '#2e7d32',
} as const

export type SymbolKind = keyof typeof SYMBOL_COLOURS

/** Outline of the shape on a unit square, as SVG path data (viewBox 0 0 20 20). */
export const SYMBOL_PATHS: Record<'diamond' | 'star', string> = {
  diamond: 'M10 1.5 L18.5 10 L10 18.5 L1.5 10 Z',
  star: 'M10 1.2 L12.6 7.4 L19.3 7.9 L14.2 12.3 L15.8 18.8 L10 15.3 L4.2 18.8 L5.8 12.3 L0.7 7.9 L7.4 7.4 Z',
}

export const SYMBOL_SHAPE: Record<SymbolKind, keyof typeof SYMBOL_PATHS> = { hearing: 'diamond', hearingPast: 'diamond', newApplication: 'star' }

/** Raster icon for the map, drawn once per kind and registered on every style load. */
export function symbolImage(kind: SymbolKind, size = 40): ImageData {
  const c = document.createElement('canvas')
  c.width = size
  c.height = size
  const ctx = c.getContext('2d')!
  ctx.scale(size / 20, size / 20)
  const p = new Path2D(SYMBOL_PATHS[SYMBOL_SHAPE[kind]])
  ctx.fillStyle = SYMBOL_COLOURS[kind]
  ctx.fill(p)
  ctx.strokeStyle = '#ffffff'
  ctx.lineWidth = 1.4
  ctx.lineJoin = 'round'
  ctx.stroke(p)
  return ctx.getImageData(0, 0, size, size)
}

export const symbolIconId = (kind: SymbolKind) => `sym-${kind}`
