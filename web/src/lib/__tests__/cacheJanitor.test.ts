import { describe, expect, it } from 'vitest'
import { planEviction } from '../cacheJanitor'

describe('planEviction', () => {
  it('evicts overlay and other caches by age before any base tiles', () => {
    const plan = planEviction([
      { cacheName: 'map-tiles', url: 'a', timestamp: 1 },
      { cacheName: 'wms-images', url: 'b', timestamp: 5 },
      { cacheName: 'forecast-images', url: 'c', timestamp: 3 },
      { cacheName: 'wms-images', url: 'd', timestamp: 2 },
      { cacheName: 'map-tiles', url: 'e', timestamp: 0 },
    ])
    expect(plan.map((e) => e.url)).toEqual(['d', 'c', 'b', 'e', 'a'])
  })
})
