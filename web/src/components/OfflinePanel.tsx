import { useEffect, useRef, useState } from 'react'
import type { Map as MlMap } from 'maplibre-gl'
import { BASE_LAYERS, OVERLAY_LAYERS, layerById } from '../lib/layers'
import { loadManifest, type DataManifest } from '../lib/localities'
import {
  areaUrls,
  cacheCounts,
  clearRuntimeCaches,
  downloadUrls,
  formatBytes,
  MAX_DOWNLOAD_TILES,
  requestPersistentStorage,
  storageStatus,
  useOnline,
  type CacheCounts,
  type DownloadProgress,
  type StorageStatus,
} from '../lib/offline'
import { updateSettings, useSettings } from '../lib/settings'
import { useInstallPrompt } from '../lib/install'
import Hint from './Hint'
import { HINTS } from '../lib/hints'

interface Props {
  map: MlMap | null
}

export default function OfflinePanel({ map }: Props) {
  const s = useSettings()
  const online = useOnline()
  const install = useInstallPrompt()
  const [storage, setStorage] = useState<StorageStatus | null>(null)
  const [counts, setCounts] = useState<CacheCounts | null>(null)
  const [manifest, setManifest] = useState<DataManifest | null>(null)
  const [viewTick, setViewTick] = useState(0)
  const [progress, setProgress] = useState<DownloadProgress | null>(null)
  const [running, setRunning] = useState(false)
  const abort = useRef<AbortController | null>(null)

  const refreshStorage = () => {
    storageStatus().then(setStorage)
    cacheCounts().then(setCounts).catch(() => setCounts(null))
  }
  useEffect(() => {
    refreshStorage()
    loadManifest().then(setManifest).catch(() => setManifest(null))
  }, [])
  useEffect(() => {
    if (!map) return
    let last = 0
    const tick = () => {
      setViewTick((t) => t + 1)
      if (Date.now() - last > 3000) {
        last = Date.now()
        cacheCounts().then(setCounts).catch(() => undefined)
      }
    }
    map.on('moveend', tick)
    map.on('idle', tick)
    return () => {
      map.off('moveend', tick)
      map.off('idle', tick)
    }
  }, [map])

  const activeLayers = [
    layerById(s.baseLayer) ?? BASE_LAYERS[0],
    ...OVERLAY_LAYERS.filter((l) => s.overlays.includes(l.id)),
  ]
  const zmin = map ? Math.floor(map.getZoom()) : 0
  const zmax = zmin + s.downloadDepth
  const b = map?.getBounds()
  const urls = b
    ? areaUrls(activeLayers, { west: b.getWest(), south: b.getSouth(), east: b.getEast(), north: b.getNorth() }, zmin, zmax)
    : []
  void viewTick
  const tooMany = urls.length > MAX_DOWNLOAD_TILES

  const start = async () => {
    await requestPersistentStorage()
    abort.current = new AbortController()
    setRunning(true)
    setProgress({ done: 0, total: urls.length, failed: 0 })
    await downloadUrls(urls, setProgress, abort.current.signal)
    abort.current = null
    setRunning(false)
    refreshStorage()
  }
  const cancel = () => abort.current?.abort()
  const clear = async () => {
    await clearRuntimeCaches()
    setProgress(null)
    refreshStorage()
  }

  return (
    <div className="panel-body">
      <h2>Status</h2>
      <p>
        <span className={`dot ${online ? 'on' : 'off'}`} /> {online ? 'Online' : 'Offline – using cached data'}
      </p>
      {install.available && (
        <p>
          <button onClick={install.prompt}>Install app</button>
        </p>
      )}
      {storage && (
        <p className="muted">
          <Hint text={HINTS.storage}>
            Storage used {formatBytes(storage.usage)} of {formatBytes(storage.quota)}
            {storage.persisted ? ' · persistent' : ''}
          </Hint>
        </p>
      )}
      {counts && (
        <p className="muted">
          <Hint text={HINTS.cacheCounts}>
            Cached on this device: {counts.baseTiles.toLocaleString('en-GB')} base-map tiles, {counts.overlayImages.toLocaleString('en-GB')} overlay
            images, {counts.forecastImages.toLocaleString('en-GB')} forecast images
          </Hint>
        </p>
      )}

      <h2>Download this area</h2>
      <p className="muted">
        Caches base-map tiles and enabled overlays for the current view so they work without a network.
      </p>
      <label className="row">
        <span>Extra zoom levels</span>
        <select
          value={s.downloadDepth}
          onChange={(e) => updateSettings({ downloadDepth: Number(e.target.value) })}
        >
          {[0, 1, 2, 3, 4].map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
      </label>
      <p className="muted">
        <Hint text={HINTS.tileCount}>
          Zoom {zmin}–{zmax}, {activeLayers.length} layer{activeLayers.length === 1 ? '' : 's'}: {urls.length} tiles
        </Hint>
        {tooMany && <strong> – zoom in or reduce depth (max {MAX_DOWNLOAD_TILES})</strong>}
      </p>
      <p>
        {running ? (
          <button onClick={cancel}>Cancel</button>
        ) : (
          <button onClick={start} disabled={!map || !online || tooMany || urls.length === 0}>
            Download
          </button>
        )}{' '}
        <button onClick={clear} className="secondary">
          Clear cached tiles
        </button>
      </p>
      {progress && (
        <>
          <progress value={progress.done} max={progress.total} />
          <p className="muted">
            {progress.done}/{progress.total} tiles{progress.failed ? `, ${progress.failed} failed` : ''}
          </p>
        </>
      )}

      <h2>Bundled data</h2>
      {manifest ? (
        <ul className="plain">
          <li className="muted">
            <Hint text={HINTS.snapshot}>Snapshot {manifest.retrieved.slice(0, 10)}</Hint>
          </li>
          {manifest.sources.map((src) => (
            <li key={src.file}>
              {src.dataset}
              <small>
                {src.organisation} · {src.license} · {src.featureCount} features
              </small>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted">Manifest unavailable.</p>
      )}
    </div>
  )
}
