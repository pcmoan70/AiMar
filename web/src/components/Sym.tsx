import { SYMBOL_COLOURS, SYMBOL_PATHS, SYMBOL_SHAPE, type SymbolKind } from '../lib/symbols'

/** The map symbol as an inline icon, so a list item is recognisable as the dot it matches on the map. */
export default function Sym({ kind, title, size = 13 }: { kind: SymbolKind; title?: string; size?: number }) {
  return (
    <svg className="sym" viewBox="0 0 20 20" width={size} height={size} role={title ? 'img' : undefined} aria-label={title} aria-hidden={title ? undefined : true}>
      {title && <title>{title}</title>}
      <path d={SYMBOL_PATHS[SYMBOL_SHAPE[kind]]} fill={SYMBOL_COLOURS[kind]} stroke="#fff" strokeWidth="1.4" strokeLinejoin="round" />
    </svg>
  )
}
