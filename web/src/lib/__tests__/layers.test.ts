import { describe, expect, it } from 'vitest'
import { CATEGORIES, OVERLAY_LAYERS, overlaysIn } from '../layers'

describe('layer registry', () => {
  it('assigns every overlay to a tab', () => {
    for (const l of OVERLAY_LAYERS) expect(l.category, l.id).toBeDefined()
    const all = CATEGORIES.flatMap((c) => overlaysIn(c.id).map((l) => l.id))
    expect(all.sort()).toEqual(OVERLAY_LAYERS.map((l) => l.id).sort())
  })
  it('orders layers inside a tab by the importance list', () => {
    expect(overlaysIn('seabed').map((l) => l.id).slice(0, 2)).toEqual(['dybdedata', 'ngu-anchoring'])
    expect(overlaysIn('shipping')[0].id).toBe('fairways')
  })
  it('only ranks ids that exist', () => {
    const ids = new Set(OVERLAY_LAYERS.map((l) => l.id))
    for (const c of CATEGORIES) for (const id of c.order) expect(ids.has(id), id).toBe(true)
  })
})
