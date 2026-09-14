import { describe, expect, it } from 'vitest'
import { overlaysIn } from '../layers'

/** Mirrors the badge logic in LayerPanel: off stores the active set, on restores it or enables all. */
function toggle(overlays: string[], memory: string[] | undefined, tab: 'seabed') {
  const ids = overlaysIn(tab).map((l) => l.id)
  const on = ids.filter((id) => overlays.includes(id))
  if (on.length) return { overlays: overlays.filter((id) => !ids.includes(id)), memory: on }
  const restore = (memory ?? []).filter((id) => ids.includes(id))
  return { overlays: [...overlays, ...(restore.length ? restore : ids)], memory }
}

describe('group toggle', () => {
  it('switches a group off and remembers what was on', () => {
    const r = toggle(['localities', 'dybdedata', 'ngu-slope'], undefined, 'seabed')
    expect(r.overlays).toEqual(['localities'])
    expect(r.memory).toEqual(['dybdedata', 'ngu-slope'])
  })
  it('restores the remembered selection', () => {
    const r = toggle(['localities'], ['dybdedata', 'ngu-slope'], 'seabed')
    expect(r.overlays.sort()).toEqual(['dybdedata', 'localities', 'ngu-slope'])
  })
  it('enables the whole group when nothing is remembered', () => {
    const r = toggle(['localities'], undefined, 'seabed')
    expect(r.overlays.length).toBe(1 + overlaysIn('seabed').length)
  })
})
