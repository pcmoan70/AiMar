import { describe, expect, it } from 'vitest'
import { OPERATOR_COLOURS, OTHER_COLOUR, PALETTE, paletteFor, siteColour } from '../operatorColours'

describe('operator colour rules', () => {
  it('table operators keep their fixed hue regardless of selection', () => {
    expect(paletteFor([]).get('MOWI SEAWATER NORWAY AS')).toBe(PALETTE[0])
    expect(paletteFor(['NOVA SEA HAVBRUK AS', 'MOWI SEAWATER NORWAY AS']).get('MOWI SEAWATER NORWAY AS')).toBe(PALETTE[0])
  })
  it('selected unlisted operators borrow the first free hues in selection order', () => {
    const pal = paletteFor(['MOWI SEAWATER NORWAY AS', 'ACME AS', 'BETA AS'])
    expect(pal.get('ACME AS')).toBe(PALETTE[1]) // blue is taken by the selected Mowi
    expect(pal.get('BETA AS')).toBe(PALETTE[2])
    expect(paletteFor(['ACME AS']).get('ACME AS')).toBe(PALETTE[0])
  })
  it('unselected unlisted operators are grey; multi-holder sites follow table order', () => {
    expect(siteColour('ACME AS')).toBe(OTHER_COLOUR)
    expect(siteColour('ACME AS, SALMAR OPPDRETT AS')).toBe(OPERATOR_COLOURS[1].colour)
    expect(siteColour('ACME AS', ['ACME AS'])).toBe(PALETTE[0])
  })
  it('gives every table operator a unique colour from the sequence; the first eight are the validated hues', () => {
    expect(new Set(OPERATOR_COLOURS.map((o) => o.colour)).size).toBe(OPERATOR_COLOURS.length)
    for (const o of OPERATOR_COLOURS) expect(PALETTE).toContain(o.colour)
    expect(OPERATOR_COLOURS.slice(0, 8).map((o) => o.colour)).toEqual(PALETTE.slice(0, 8))
    expect(new Set(PALETTE).size).toBe(PALETTE.length)
  })
})
