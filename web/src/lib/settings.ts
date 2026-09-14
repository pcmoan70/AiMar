// User settings live in localStorage: small, synchronous, never evicted with
// the tile caches. Anything re-downloadable belongs in Cache Storage instead.
import { useSyncExternalStore } from 'react'

export type PanelId = 'layers' | 'inspect' | 'offline' | 'help' | null

export interface Settings {
  baseLayer: string
  overlays: string[]
  view: { center: [number, number]; zoom: number }
  /** Extra zoom levels below the current one to prefetch when downloading an area. */
  downloadDepth: number
  panel: PanelId
  /** Show only sites of these operators (empty = all). */
  operatorFilter: string[]
}

const KEY = 'aimar.settings.v1'

export const DEFAULT_SETTINGS: Settings = {
  baseLayer: 'topo',
  overlays: ['localities'],
  view: { center: [8.5, 63.5], zoom: 5 },
  downloadDepth: 2,
  panel: 'layers',
  operatorFilter: [],
}

function load(): Settings {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) }
  } catch {
    /* storage unavailable or corrupt: fall back to defaults */
  }
  return DEFAULT_SETTINGS
}

let state = load()
const listeners = new Set<() => void>()

export const getSettings = () => state

export function updateSettings(patch: Partial<Settings>) {
  state = { ...state, ...patch }
  try {
    localStorage.setItem(KEY, JSON.stringify(state))
  } catch {
    /* ignore quota / private-mode errors */
  }
  listeners.forEach((l) => l())
}

export function resetSettings() {
  updateSettings(DEFAULT_SETTINGS)
}

function subscribe(l: () => void) {
  listeners.add(l)
  return () => listeners.delete(l)
}

export const useSettings = () => useSyncExternalStore(subscribe, getSettings)
