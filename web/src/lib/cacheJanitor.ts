// Keeps the service-worker caches under a byte limit. Workbox only caps entry
// counts, so this reads its last-used timestamps (IndexedDB 'workbox-expiration')
// and evicts least-recently-used entries: overlay images, forecast images and
// other data first, base-map tiles last, the app-shell precache never.

export const DEFAULT_CACHE_LIMIT_GB = 20
const TARGET_RATIO = 0.9 // stop evicting at 90 % of the limit
const BATCH = 200
const BASE_TILES = 'map-tiles'

export interface CacheEntry {
  cacheName: string
  url: string
  timestamp: number
}

export interface JanitorResult {
  before: number
  after: number
  evicted: Record<string, number>
}

/** Eviction order: all non-base caches by age, then base tiles by age. */
export function planEviction(entries: CacheEntry[]): CacheEntry[] {
  const byAge = (a: CacheEntry, b: CacheEntry) => a.timestamp - b.timestamp
  const others = entries.filter((e) => e.cacheName !== BASE_TILES).sort(byAge)
  const base = entries.filter((e) => e.cacheName === BASE_TILES).sort(byAge)
  return [...others, ...base]
}

function readExpirationEntries(): Promise<CacheEntry[]> {
  return new Promise((resolve) => {
    const req = indexedDB.open('workbox-expiration')
    req.onerror = () => resolve([])
    req.onsuccess = () => {
      const db = req.result
      if (!db.objectStoreNames.contains('cache-entries')) {
        db.close()
        return resolve([])
      }
      const all = db.transaction('cache-entries', 'readonly').objectStore('cache-entries').getAll()
      all.onsuccess = () => {
        db.close()
        resolve((all.result as CacheEntry[]).filter((e) => e.cacheName && e.url))
      }
      all.onerror = () => {
        db.close()
        resolve([])
      }
    }
  })
}

function forgetExpirationEntries(entries: CacheEntry[]): Promise<void> {
  return new Promise((resolve) => {
    const req = indexedDB.open('workbox-expiration')
    req.onerror = () => resolve()
    req.onsuccess = () => {
      const db = req.result
      if (!db.objectStoreNames.contains('cache-entries')) {
        db.close()
        return resolve()
      }
      const tx = db.transaction('cache-entries', 'readwrite')
      const store = tx.objectStore('cache-entries')
      for (const e of entries) store.delete(`${e.cacheName}|${e.url}`)
      tx.oncomplete = () => {
        db.close()
        resolve()
      }
      tx.onerror = () => {
        db.close()
        resolve()
      }
    }
  })
}

const usage = async () => (await navigator.storage?.estimate?.())?.usage ?? 0

/** Evict until usage is below the limit. Returns what was done. */
export async function runJanitor(limitBytes: number): Promise<JanitorResult> {
  const before = await usage()
  const evicted: Record<string, number> = {}
  if (before <= limitBytes) return { before, after: before, evicted }
  const plan = planEviction(await readExpirationEntries())
  const target = limitBytes * TARGET_RATIO
  let after = before
  for (let i = 0; i < plan.length && after > target; i += BATCH) {
    const batch = plan.slice(i, i + BATCH)
    await Promise.all(
      batch.map(async (e) => {
        const c = await caches.open(e.cacheName)
        if (await c.delete(e.url)) evicted[e.cacheName] = (evicted[e.cacheName] ?? 0) + 1
      }),
    )
    await forgetExpirationEntries(batch)
    after = await usage()
  }
  return { before, after, evicted }
}

let timer: number | undefined
let lastResult: JanitorResult | null = null
export const lastJanitorResult = () => lastResult

/** Run once shortly after start-up, then periodically. */
export function scheduleJanitor(getLimitBytes: () => number, intervalMs = 10 * 60 * 1000): void {
  const run = async () => {
    try {
      lastResult = await runJanitor(getLimitBytes())
    } catch {
      /* storage API unavailable */
    }
  }
  window.clearInterval(timer)
  window.setTimeout(run, 30 * 1000)
  timer = window.setInterval(run, intervalMs)
}
