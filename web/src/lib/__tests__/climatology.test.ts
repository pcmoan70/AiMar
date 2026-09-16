import { describe, expect, it } from 'vitest'
import { arrowGeoJSON, type ArrowSample } from '../climatology'

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
