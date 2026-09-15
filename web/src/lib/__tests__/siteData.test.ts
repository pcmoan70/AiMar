import { describe, expect, it } from 'vitest'
import { tempSeries, type SeaTemp } from '../siteData'

describe('sea temperature alignment', () => {
  const data: SeaTemp = { retrieved: '', weeks: ['2024-01', '2024-02', '2024-03'], localities: { '1': [4.1, null, 3.9] } }
  it('re-aligns onto the lice week labels', () => {
    expect(tempSeries(data, 1, ['2023-52', '2024-01', '2024-02', '2024-03', '2024-04'])).toEqual([null, 4.1, null, 3.9, null])
    expect(tempSeries(data, 2, ['2024-01'])).toBeNull()
  })
})

describe('implausible temperatures', () => {
  it('drops reports outside the plausible range', async () => {
    const { tempSeries } = await import('../siteData')
    const data = { retrieved: '', weeks: ['2024-01', '2024-02', '2024-03'], localities: { '1': [98, 8.4, -5] } }
    expect(tempSeries(data, 1, ['2024-01', '2024-02', '2024-03'])).toEqual([null, 8.4, null])
  })
})

describe('warm sites', () => {
  it('counts sites above the threshold, weekly and by week number', async () => {
    const { warmAtWeek, warmAtSeasonWeek } = await import('../siteData')
    const data = {
      retrieved: '',
      weeks: ['2023-20', '2023-21', '2024-20'],
      localities: { '1': [13, 9, 14], '2': [11, 12, 11.5], '3': [null, null, null] },
    }
    expect(warmAtWeek(data, '2023-20')).toEqual({ above: 1, measured: 2 })
    expect(warmAtWeek(data, '2023-20', 10)).toEqual({ above: 2, measured: 2 })
    // week 20 averaged over 2023 and 2024: site 1 = 13.5, site 2 = 11.25
    expect(warmAtSeasonWeek(data, 20)).toEqual({ above: 1, measured: 2 })
    expect(warmAtSeasonWeek(data, 20, 14)).toEqual({ above: 0, measured: 2 })
    expect(warmAtWeek(data, '2030-01')).toEqual({ above: 0, measured: 0 })
  })
})
