import { beforeEach, describe, expect, it, vi } from 'vitest'

function stubStorage(initial: Record<string, string> = {}) {
  const store = new Map(Object.entries(initial))
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
  })
  return store
}

describe('settings store', () => {
  beforeEach(() => vi.resetModules())

  it('merges stored values over defaults', async () => {
    stubStorage({ 'aimar.settings.v1': JSON.stringify({ baseLayer: 'sjokart' }) })
    const { getSettings, DEFAULT_SETTINGS } = await import('../settings')
    expect(getSettings().baseLayer).toBe('sjokart')
    expect(getSettings().overlays).toEqual(DEFAULT_SETTINGS.overlays)
  })

  it('persists updates and notifies subscribers', async () => {
    const store = stubStorage()
    const { updateSettings, getSettings } = await import('../settings')
    updateSettings({ downloadDepth: 4 })
    expect(getSettings().downloadDepth).toBe(4)
    expect(JSON.parse(store.get('aimar.settings.v1')!).downloadDepth).toBe(4)
  })

  it('falls back to defaults on corrupt storage', async () => {
    stubStorage({ 'aimar.settings.v1': '{not json' })
    const { getSettings, DEFAULT_SETTINGS } = await import('../settings')
    expect(getSettings()).toEqual(DEFAULT_SETTINGS)
  })
})
