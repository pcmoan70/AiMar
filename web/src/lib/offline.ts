// Offline support helpers: online state, tile prefetch for an area, storage status.
// Prefetching simply fetches each tile URL; the service worker's runtime caching
// (vite.config.ts) stores the responses in Cache Storage.
import { useEffect, useState } from 'react'
import { wmsTileUrl, type LayerDef } from './layers'

export function useOnline() {
  const [online, setOnline] = useState(navigator.onLine)
  useEffect(() => {
    const up = () => setOnline(true)
    const down = () => setOnline(false)
    window.addEventListener('online', up)
    window.addEventListener('offline', down)
    return () => {
      window.removeEventListener('online', up)
      window.removeEventListener('offline', down)
    }
  }, [])
  return online
}

export const MAX_DOWNLOAD_TILES = 6000

export interface Bbox {
  west: number
  south: number
  east: number
  north: number
}

export interface Tile {
  z: number
  x: number
  y: number
}

const ORIGIN = 20037508.342789244

function lonLatToTile(lon: number, lat: number, z: number): [number, number] {
  const n = 2 ** z
  const x = Math.floor(((lon + 180) / 360) * n)
  const latR = (lat * Math.PI) / 180
  const y = Math.floor(((1 - Math.log(Math.tan(latR) + 1 / Math.cos(latR)) / Math.PI) / 2) * n)
  return [Math.min(Math.max(x, 0), n - 1), Math.min(Math.max(y, 0), n - 1)]
}

function tileBbox3857({ z, x, y }: Tile): string {
  const res = (2 * ORIGIN) / 2 ** z
  const minx = -ORIGIN + x * res
  const maxy = ORIGIN - y * res
  return [minx, maxy - res, minx + res, maxy].join(',')
}

export function tilesInBounds(bounds: Bbox, zmin: number, zmax: number): Tile[] {
  const tiles: Tile[] = []
  for (let z = zmin; z <= zmax; z++) {
    const [x0, y0] = lonLatToTile(bounds.west, bounds.north, z)
    const [x1, y1] = lonLatToTile(bounds.east, bounds.south, z)
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) tiles.push({ z, x, y })
  }
  return tiles
}

export function tileUrl(layer: LayerDef, t: Tile): string {
  if (layer.kind === 'xyz')
    return layer.url.replace('{z}', String(t.z)).replace('{x}', String(t.x)).replace('{y}', String(t.y))
  return wmsTileUrl(layer).replace('{bbox-epsg-3857}', tileBbox3857(t))
}

/** URLs needed to show `layers` over `bounds` for zoom levels zmin..zmax. */
export function areaUrls(layers: LayerDef[], bounds: Bbox, zmin: number, zmax: number): string[] {
  const urls: string[] = []
  for (const layer of layers) {
    if (layer.kind === 'geojson') continue
    const top = Math.min(zmax, layer.maxzoom ?? zmax)
    for (const t of tilesInBounds(bounds, zmin, top)) urls.push(tileUrl(layer, t))
  }
  return urls
}

export interface DownloadProgress {
  done: number
  total: number
  failed: number
}

export async function downloadUrls(
  urls: string[],
  onProgress: (p: DownloadProgress) => void,
  signal?: AbortSignal,
): Promise<DownloadProgress> {
  const progress: DownloadProgress = { done: 0, total: urls.length, failed: 0 }
  const queue = [...urls]
  const worker = async () => {
    while (queue.length && !signal?.aborted) {
      const url = queue.shift()!
      try {
        const res = await fetch(url, { signal })
        if (!res.ok) progress.failed++
      } catch {
        if (signal?.aborted) return
        progress.failed++
      }
      progress.done++
      onProgress({ ...progress })
    }
  }
  await Promise.all(Array.from({ length: 6 }, worker))
  return progress
}

export interface StorageStatus {
  usage: number
  quota: number
  persisted: boolean
}

export async function storageStatus(): Promise<StorageStatus> {
  const est = navigator.storage?.estimate ? await navigator.storage.estimate() : {}
  const persisted = navigator.storage?.persisted ? await navigator.storage.persisted() : false
  return { usage: est.usage ?? 0, quota: est.quota ?? 0, persisted }
}

export async function requestPersistentStorage(): Promise<boolean> {
  return navigator.storage?.persist ? navigator.storage.persist() : false
}

/** Delete runtime caches (tiles, WMS images); the app-shell precache is kept. */
export async function clearRuntimeCaches(): Promise<number> {
  const names = (await caches.keys()).filter((n) => !n.includes('precache'))
  await Promise.all(names.map((n) => caches.delete(n)))
  return names.length
}

export function formatBytes(b: number) {
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} kB`
  if (b < 1024 ** 3) return `${(b / 1024 ** 2).toFixed(1)} MB`
  return `${(b / 1024 ** 3).toFixed(2)} GB`
}
