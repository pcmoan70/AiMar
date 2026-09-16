import { CLIM_FIELDS, MONTHS, type ClimManifest } from '../lib/climatology'
import { numberLocale, useT } from '../lib/i18n'
import { updateSettings, useSettings } from '../lib/settings'

/** Month picker on the map itself, shown while a climatology overlay is on. */
export default function ClimMonthControl({ manifest }: { manifest: ClimManifest | null }) {
  const t = useT()
  const s = useSettings()
  const on = Object.keys(CLIM_FIELDS).filter((id) => s.overlays.includes(id))
  if (!on.length || !manifest) return null
  const names = on.map((id) => t(`layer.${id}.title`).replace(/\s*\([^)]*\)\s*$/, '')).join(' · ')
  return (
    <div className="clim-control">
      <label>
        {t('clim.month')}
        <select value={s.climMonth} onChange={(e) => updateSettings({ climMonth: Number(e.target.value) })} aria-label={t('clim.month')}>
          {MONTHS.map((m) => (
            <option key={m} value={m}>
              {new Date(Date.UTC(2024, m - 1, 1)).toLocaleDateString(numberLocale(), { month: 'long', timeZone: 'UTC' })}
            </option>
          ))}
        </select>
      </label>
      <small className="muted">{names}</small>
    </div>
  )
}
