import { describe, expect, it } from 'vitest'
import { tempSeries, type SeaTemp } from '../siteData'

describe('sea temperature alignment', () => {
  const data: SeaTemp = { retrieved: '', weeks: ['2024-01', '2024-02', '2024-03'], localities: { '1': [4.1, null, 3.9] } }
  it('re-aligns onto the lice week labels', () => {
    expect(tempSeries(data, 1, ['2023-52', '2024-01', '2024-02', '2024-03', '2024-04'])).toEqual([null, 4.1, null, 3.9, null])
    expect(tempSeries(data, 2, ['2024-01'])).toBeNull()
  })
})
