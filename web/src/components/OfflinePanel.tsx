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
import { lastJanitorResult, runJanitor } from '../lib/cacheJanitor'
import { numberLocale, useT } from '../lib/i18n'

interface Props {
  map: MlMap | null
}

export default function OfflinePanel({ map }: Props) {
  const t = useT()
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
  const [janitorMsg, setJanitorMsg] = useState<string | null>(null)
  const purge = async () => {
    const r = await runJanitor(s.cacheLimitGb * 1024 ** 3)
    const n = Object.values(r.evicted).reduce((a, b) => a + b, 0)
    setJanitorMsg(n ? t('offline.purged', { n: n.toLocaleString(numberLocale()), b: formatBytes(r.before - r.after) }) : t('offline.underLimit'))
    refreshStorage()
  }

  return (
    <div className="panel-body">
      <h2>{t('offline.status')}</h2>
      <p>
        <span className={`dot ${online ? 'on' : 'off'}`} /> {t(online ? 'offline.online' : 'offline.offline')}
      </p>
      {install.available && (
        <p>
          <button onClick={install.prompt}>{t('offline.install')}</button>
        </p>
      )}
      {storage && (
        <p className="muted">
          <Hint text={t('hint.storage')}>
            {t('offline.storage', { u: formatBytes(storage.usage), q: formatBytes(storage.quota) })}
            {storage.persisted ? t('offline.persistent') : ''}
          </Hint>
        </p>
      )}
      {counts && (
        <p className="muted">
          <Hint text={t('hint.cacheCounts')}>
            {t('offline.cached', { b: counts.baseTiles.toLocaleString(numberLocale()), o: counts.overlayImages.toLocaleString(numberLocale()), f: counts.forecastImages.toLocaleString(numberLocale()) })}
          </Hint>
        </p>
      )}

      <h2>{t('offline.download')}</h2>
      <p className="muted">{t('offline.downloadNote')}</p>
      <label className="row">
        <span>{t('offline.depth')}</span>
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
        <Hint text={t('hint.tileCount')}>{t('offline.tiles', { a: zmin, b: zmax, n: activeLayers.length, t: urls.length })}</Hint>
        {tooMany && <strong>{t('offline.tooMany', { m: MAX_DOWNLOAD_TILES })}</strong>}
      </p>
      <p>
        {running ? (
          <button onClick={cancel}>{t('offline.cancel')}</button>
        ) : (
          <button onClick={start} disabled={!map || !online || tooMany || urls.length === 0}>
            {t('offline.downloadBtn')}
          </button>
        )}{' '}
        <button onClick={clear} className="secondary">
          {t('offline.clear')}
        </button>{' '}
        <button onClick={purge} className="secondary">
          {t('offline.purge')}
        </button>
      </p>
      <p className="muted">
        <Hint text={t('hint.cacheLimit')}>
          {t('offline.limit', { gb: s.cacheLimitGb })}
          {(() => {
            const r = lastJanitorResult()
            const n = r ? Object.values(r.evicted).reduce((a, b) => a + b, 0) : 0
            return n ? t('offline.lastPurge', { n: n.toLocaleString(numberLocale()) }) : ''
          })()}
        </Hint>
        {janitorMsg && <> · {janitorMsg}</>}
      </p>
      {progress && (
        <>
          <progress value={progress.done} max={progress.total} />
          <p className="muted">
            {t('offline.progress', { d: progress.done, t: progress.total })}
            {progress.failed ? t('offline.failed', { f: progress.failed }) : ''}
          </p>
        </>
      )}

      <h2>{t('offline.bundled')}</h2>
      {manifest ? (
        <ul className="plain">
          <li className="muted">
            <Hint text={t('hint.snapshot')}>{t('offline.snapshot', { date: manifest.retrieved.slice(0, 10) })}</Hint>
          </li>
          {manifest.sources.map((src) => (
            <li key={src.file}>
              {src.dataset}
              <small>{t('offline.sourceLine', { org: src.organisation, lic: src.license, n: src.featureCount })}</small>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted">{t('offline.noManifest')}</p>
      )}
    </div>
  )
}
