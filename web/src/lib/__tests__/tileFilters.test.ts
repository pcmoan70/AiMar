import { describe, expect, it } from 'vitest'
import { alphaOf, applyFilter, rankOf } from '../tileFilters'

describe('rankOf', () => {
  it('orders the MarTraf hue palette from blue to red', () => {
    const blue = rankOf('ais-hue', 0, 0, 102)
    const green = rankOf('ais-hue', 0, 219, 0)
    const yellow = rankOf('ais-hue', 255, 255, 0)
    const red = rankOf('ais-hue', 221, 58, 27)
    expect(blue).toBeLessThan(green)
    expect(green).toBeLessThan(yellow)
    expect(yellow).toBeLessThan(red)
    expect(blue).toBe(0)
    expect(red).toBeGreaterThan(0.9)
  })
  it('treats grey as low traffic', () => expect(rankOf('ais-hue', 120, 120, 125)).toBe(0.2))
  it('ranks the white→orange gradient by distance from white', () => {
    expect(rankOf('ais-white', 254, 254, 249)).toBeLessThan(0.05)
    expect(rankOf('ais-white', 255, 140, 0)).toBe(1)
  })
})

describe('applyFilter', () => {
  it('keeps transparent pixels and fades low-traffic ones', () => {
    const px = new Uint8ClampedArray([0, 0, 102, 255, 221, 58, 27, 255, 0, 0, 0, 0])
    applyFilter('ais-hue', px)
    expect(px[3]).toBe(alphaOf(255, 0))
    expect(px[3]).toBeLessThan(30)
    expect(px[7]).toBeGreaterThan(230)
    expect(px[11]).toBe(0)
  })
})
