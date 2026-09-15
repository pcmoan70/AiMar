// User settings live in localStorage: small, synchronous, never evicted with
// the tile caches. Anything re-downloadable belongs in Cache Storage instead.
import { useSyncExternalStore } from 'react'
import type { Category } from './layers'
import type { WeekHeatMode } from './liceWeek'
import type { FieldFilters } from './filters'

export type PanelId = 'layers' | 'inspect' | 'cases' | 'offline' | 'help' | null

export interface Settings {
  baseLayer: string
  overlays: string[]
  view: { center: [number, number]; zoom: number }
  /** Extra zoom levels below the current one to prefetch when downloading an area. */
  downloadDepth: number
  panel: PanelId
  /** Show only sites of these operators (empty = all). */
  operatorFilter: string[]
  /** Open overlay tab in the layer panel. */
  layerTab: Category
  /** Per tab: which overlays were on before the group was switched off, restored on switch-on. */
  groupMemory: Partial<Record<Category, string[]>>
  /** Maximum size of the offline caches on this device, in GB. */
  cacheLimitGb: number
  /** Register-field filters set from the site panel. */
  fieldFilters: FieldFilters
  /** Kernel radius (km) of the treatment heatmap. */
  heatRadiusKm: number
  /** Explanation popups the user blocked with Ø (hint ids). */
  blockedHints: string[]
  /** Week index into fishhealth.weeks for the lice-per-week layers; -1 = latest week. */
  liceWeek: number
  /** What the weekly heatmap smooths: reported lice, or farms with a treatment that week. */
  weekHeatMode: WeekHeatMode
}

const KEY = 'aimar.settings.v1'

export const DEFAULT_SETTINGS: Settings = {
  baseLayer: 'topo',
  overlays: ['localities'],
  view: { center: [8.5, 63.5], zoom: 5 },
  downloadDepth: 2,
  panel: 'layers',
  operatorFilter: [],
  layerTab: 'aquaculture',
  groupMemory: {},
  cacheLimitGb: 20,
  fieldFilters: {},
  heatRadiusKm: 20,
  blockedHints: [],
  liceWeek: -1,
  weekHeatMode: 'lice',
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
