import { describe, expect, it } from 'vitest'
import { arrowGeoJSON, barbCounts, barbGeoJSON, MS_TO_KNOTS, type ArrowSample } from '../climatology'

const sample = (dir: number): ArrowSample => ({ lon: 5, lat: 60, dir, mean: 1, p90: 2 })

describe('arrowGeoJSON', () => {
  it('draws a shaft that points the way the waves travel, with the head at the tip', () => {
    const [f] = arrowGeoJSON([sample(0)], 1).features
    const [tail, tip, left, again, right] = f.geometry.coordinates
    expect(tip[1]).toBeGreaterThan(tail[1]) // due north
    expect(tip[1] - tail[1]).toBeCloseTo(1, 6)
    expect(again).toEqual(tip)
    // Barbs sit behind the tip, one either side of the shaft.
    expect(left[1]).toBeLessThan(tip[1])
    expect(right[1]).toBeLessThan(tip[1])
    expect(Math.sign(left[0] - tip[0])).toBe(-Math.sign(right[0] - tip[0]))
  })

  it('stretches east-west so the arrow keeps its length on screen', () => {
    const [f] = arrowGeoJSON([sample(90)], 1).features
    const [tail, tip] = f.geometry.coordinates
    expect(tip[0] - tail[0]).toBeCloseTo(1 / Math.cos((60 * Math.PI) / 180), 6)
    expect(tip[1]).toBeCloseTo(tail[1], 6)
  })

  it('carries the mean and the 90th percentile through to the line', () => {
    expect(arrowGeoJSON([sample(180)], 1).features[0].properties).toMatchObject({ dir: 180, mean: 1, p90: 2 })
  })
})

describe('barbCounts', () => {
  it('counts half barbs, full barbs and pennants to the nearest 5 knots', () => {
    expect(barbCounts(0)).toEqual({ pennants: 0, full: 0, half: 0 })
    expect(barbCounts(5)).toEqual({ pennants: 0, full: 0, half: 1 })
    expect(barbCounts(12)).toEqual({ pennants: 0, full: 1, half: 0 })
    expect(barbCounts(13)).toEqual({ pennants: 0, full: 1, half: 1 })
    expect(barbCounts(25)).toEqual({ pennants: 0, full: 2, half: 1 })
    expect(barbCounts(50)).toEqual({ pennants: 1, full: 0, half: 0 })
    expect(barbCounts(65)).toEqual({ pennants: 1, full: 1, half: 1 })
  })
})

describe('barbGeoJSON', () => {
  const at = (dir: number, mean: number): ArrowSample => ({ lon: 5, lat: 60, dir, mean, p90: mean + 5 })

  it('runs the shaft into the wind, opposite the way the wind travels', () => {
    // 10 m/s ≈ 19 knots, which rounds to 20: two full barbs and no half.
    const [f] = barbGeoJSON([at(0, 10)], 1).features
    const [shaft] = f.geometry.coordinates
    expect(shaft[1][1]).toBeLessThan(shaft[0][1]) // wind goes north, shaft points south
    expect(f.properties.knots).toBe(Math.round(10 * MS_TO_KNOTS))
  })

  it('draws one line per barb on top of the shaft', () => {
    const lines = (mean: number) => barbGeoJSON([at(90, mean)], 1).features[0].geometry.coordinates.length
    expect(lines(10)).toBe(1 + 2) // 19 kt -> 20: two full barbs
    expect(lines(13)).toBe(1 + 3) // 25 kt: two full and a half
    expect(lines(2.2)).toBe(1 + 1) // 4 kt -> 5: a lone half barb
  })

  it('draws a ring and no shaft when it is calm', () => {
    const [f] = barbGeoJSON([at(45, 0.5)], 1).features
    expect(f.geometry.coordinates).toHaveLength(1)
    expect(f.geometry.coordinates[0]).toHaveLength(17)
    expect(f.geometry.coordinates[0][0]).toEqual(f.geometry.coordinates[0][16])
  })

  it('counts a chosen statistic instead of the mean when asked', () => {
    const [f] = barbGeoJSON([at(0, 10)], 1, (a) => a.p90).features
    expect(f.properties.knots).toBe(Math.round(15 * MS_TO_KNOTS))
  })
})
