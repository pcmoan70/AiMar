import { useEffect, useRef, useState } from 'react'
import { BASE_LAYERS } from '../lib/layers'
import { updateSettings, useSettings } from '../lib/settings'
import { LANGS, setLang, useLang, useT } from '../lib/i18n'

/** Header dropdown for app-wide settings: language, base map, cache limit, offline panel. */
export default function SettingsMenu() {
  const t = useT()
  const lang = useLang()
  const s = useSettings()
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const base = BASE_LAYERS.find((l) => l.id === s.baseLayer) ?? BASE_LAYERS[0]

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  return (
    <div className="settings-menu" ref={root}>
      <button className={open || s.panel === 'offline' ? 'active' : ''} onClick={() => setOpen(!open)} aria-haspopup="dialog" aria-expanded={open} title={t('settings.title')}>
        {t('header.settings')}
      </button>
      {open && (
        <div className="settings-pop" role="dialog" aria-label={t('settings.title')}>
          <label>
            {t('settings.language')}
            <div className="lang-switch">
              {LANGS.map((l) => (
                <button key={l.id} type="button" className={lang === l.id ? '' : 'secondary'} onClick={() => setLang(l.id)}>
                  {l.label}
                </button>
              ))}
            </div>
          </label>
          <label>
            {t('settings.basemap')}
            <select value={s.baseLayer} onChange={(e) => updateSettings({ baseLayer: e.target.value })}>
              {BASE_LAYERS.map((l) => (
                <option key={l.id} value={l.id}>
                  {t(`layer.${l.id}.title`)}
                </option>
              ))}
            </select>
            <small>
              {base.organisation} · {base.license}
            </small>
          </label>
          <label>
            {t('settings.cacheLimit')}
            <select value={s.cacheLimitGb} onChange={(e) => updateSettings({ cacheLimitGb: Number(e.target.value) })}>
              {[2, 5, 10, 20, 50, 100].map((gb) => (
                <option key={gb} value={gb}>
                  {gb} GB
                </option>
              ))}
            </select>
            <small>{t('settings.cacheNote')}</small>
          </label>
          <button
            type="button"
            className="secondary settings-offline"
            onClick={() => {
              updateSettings({ panel: 'offline' })
              setOpen(false)
            }}
          >
            {t('settings.offline')}
            <small>{t('settings.offlineNote')}</small>
          </button>
        </div>
      )}
    </div>
  )
}
