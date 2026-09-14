// Fixed colour table for operators. Rules:
//  1. The eight largest operators (by active sites, 2026-09) own the eight hues of
//     the validated categorical palette, in this fixed order; the table is edited by
//     hand, never regenerated, so a company keeps its colour across releases.
//  2. Every other operator is grey on the map ("other operators").
//  3. When an unlisted operator is selected in the dropdown it borrows, for as long
//     as it is selected, the first hue not used by any selected table operator,
//     in selection order — so charts can still tell selected companies apart.
//  4. A site with several licence holders takes the colour of the first table
//     entry it matches, else of the first selected operator it matches, else grey.
//  5. This site's own line in charts is navy and the "all farms" comparison is
//     dark grey; neither is an operator hue.

export const PALETTE = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#4a3aa7', '#e34948'] as const

export const OPERATOR_COLOURS: { name: string; colour: string }[] = [
  { name: 'MOWI SEAWATER NORWAY AS', colour: PALETTE[0] },
  { name: 'SALMAR OPPDRETT AS', colour: PALETTE[1] },
  { name: 'CERMAQ NORWAY SALMON AS', colour: PALETTE[2] },
  { name: 'NORGESKJELL AS', colour: PALETTE[3] },
  { name: 'MOWI ASA', colour: PALETTE[4] },
  { name: 'NORDLAKS HAVBRUK AS', colour: PALETTE[5] },
  { name: 'LERØY MIDT SJØ AS', colour: PALETTE[6] },
  { name: 'NOVA SEA HAVBRUK AS', colour: PALETTE[7] },
]

export const OTHER_COLOUR = '#8d99a6'
export const SITE_COLOUR = '#0b3d5c'
export const ALL_FARMS_COLOUR = '#5d6b7a'

const TABLE = new Map(OPERATOR_COLOURS.map((o) => [o.name, o.colour]))

/** Colour for every operator that matters right now: the table plus borrowed hues for selected unlisted operators. */
export function paletteFor(selected: string[]): Map<string, string> {
  const out = new Map(TABLE)
  const used = new Set(selected.filter((s) => TABLE.has(s)).map((s) => TABLE.get(s)!))
  for (const op of selected) {
    if (out.has(op)) continue
    const free = PALETTE.find((c) => !used.has(c)) ?? OTHER_COLOUR
    used.add(free)
    out.set(op, free)
  }
  return out
}

/** Colour of a site given its comma-separated operator list (rule 4). */
export function siteColour(operators: string, selected: string[] = []): string {
  const pal = paletteFor(selected)
  const ops = operators.split(',').map((s) => s.trim())
  for (const o of OPERATOR_COLOURS) if (ops.includes(o.name)) return o.colour
  for (const s of selected) if (ops.includes(s)) return pal.get(s)!
  return OTHER_COLOUR
}
