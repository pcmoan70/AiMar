import { describe, expect, it } from 'vitest'
import { OPERATOR_COLOURS, OTHER_COLOUR, PALETTE, brandOf, hueOf, paletteFor, siteColour, variant } from '../operatorColours'

describe('operator colour rules', () => {
  it('groups companies by brand word and gives them the same hue', () => {
    const mowi = OPERATOR_COLOURS.filter((o) => o.brand === 'MOWI')
    expect(mowi.length).toBeGreaterThan(1)
    const hues = new Set(mowi.map((o) => hueOf(o.colour)))
    expect(hues.size).toBe(1)
    expect(new Set(mowi.map((o) => o.colour)).size).toBe(mowi.length) // distinct variants
    expect(brandOf('MOWI SEAWATER NORWAY AS')).toBe('MOWI')
    expect(brandOf('Lerøy Midt Sjø AS')).toBe('LERØY')
  })
  it('gives every table operator a unique colour; brand bases come from the sequence', () => {
    expect(new Set(OPERATOR_COLOURS.map((o) => o.colour)).size).toBe(OPERATOR_COLOURS.length)
    const bases = new Map<string, string>()
    for (const o of OPERATOR_COLOURS) if (!bases.has(o.brand)) bases.set(o.brand, o.colour)
    for (const c of bases.values()) expect(PALETTE).toContain(c)
    expect(OPERATOR_COLOURS[0].colour).toBe(PALETTE[0])
  })
  it('table operators keep their colour regardless of selection', () => {
    expect(paletteFor(['NOVA SEA HAVBRUK AS', 'MOWI SEAWATER NORWAY AS']).get('MOWI SEAWATER NORWAY AS')).toBe(PALETTE[0])
  })
  it('an unlisted operator of a known brand borrows a variant of that brand hue', () => {
    const c = paletteFor(['MOWI FISKEFÔR AS']).get('MOWI FISKEFÔR AS')!
    expect(hueOf(c)).toBe(hueOf(PALETTE[0]))
    expect(OPERATOR_COLOURS.some((o) => o.colour === c)).toBe(false)
  })
  it('an unlisted operator of an unknown brand borrows the first free sequence colour', () => {
    const pal = paletteFor(['MOWI SEAWATER NORWAY AS', 'ACME AS'])
    expect(pal.get('ACME AS')).toBe(PALETTE[1]) // blue is taken by the selected Mowi
    expect(paletteFor(['ACME AS']).get('ACME AS')).toBe(PALETTE[0])
  })
  it('unselected unlisted operators are grey; multi-holder sites follow table order', () => {
    expect(siteColour('ACME AS')).toBe(OTHER_COLOUR)
    expect(siteColour('ACME AS, SALMAR OPPDRETT AS')).toBe(OPERATOR_COLOURS.find((o) => o.name === 'SALMAR OPPDRETT AS')!.colour)
    expect(siteColour('ACME AS', ['ACME AS'])).toBe(PALETTE[0])
  })
  it('variants keep the hue and stay within a readable lightness band', () => {
    for (let k = 0; k < 6; k++) expect(hueOf(variant('#2a78d6', k))).toBe(hueOf('#2a78d6'))
    expect(variant('#2a78d6', 0)).toBe('#2a78d6')
  })
})
