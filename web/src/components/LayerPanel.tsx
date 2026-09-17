import { CATEGORIES, legendUrls, overlaysIn } from '../lib/layers'
import { HEAT_MAX, HEAT_RADII_KM, HEAT_RAMP } from '../lib/heatmap'
import { WEEK_HEAT_MAX } from '../lib/liceWeek'
import { CLIM_FIELDS, CLIM_RAMP, MONTHS } from '../lib/climatology'
import { numberLocale } from '../lib/i18n'
import Hint from './Hint'
import { useT } from '../lib/i18n'
import { updateSettings, useSettings } from '../lib/settings'

export default function LayerPanel() {
  const t = useT()
  const s = useSettings()
  const toggle = (id: string) =>
    updateSettings({
      overlays: s.overlays.includes(id) ? s.overlays.filter((o) => o !== id) : [...s.overlays, id],
    })

  return (
    <div className="panel-body">
      <div className="panel-head">
        <h2>{t('layers.overlays')}</h2>
        <label className="panel-switch">
          <input type="checkbox" checked={s.layerDetails} onChange={(e) => updateSettings({ layerDetails: e.target.checked })} /> {t('layers.details')}
        </label>
      </div>
      <div className="tabs" role="tablist">
        {CATEGORIES.map((c) => {
          const ids = overlaysIn(c.id).map((l) => l.id)
          const on = ids.filter((id) => s.overlays.includes(id))
          const toggleGroup = () => {
            if (on.length) {
              updateSettings({
                overlays: s.overlays.filter((id) => !ids.includes(id)),
                groupMemory: { ...s.groupMemory, [c.id]: on },
              })
            } else {
              const restore = (s.groupMemory[c.id] ?? []).filter((id) => ids.includes(id))
              updateSettings({ overlays: [...s.overlays, ...(restore.length ? restore : ids)] })
            }
          }
          return (
            <div key={c.id} className={`tab${s.layerTab === c.id ? ' active' : ''}`}>
              <button role="tab" aria-selected={s.layerTab === c.id} onClick={() => updateSettings({ layerTab: c.id })}>
                {t(`cat.${c.id}`)}
              </button>
              <button
                className={`badge${on.length ? ' on' : ''}`}
                onClick={toggleGroup}
                title={t(on.length ? 'layers.groupOff' : 'layers.groupOn', { g: t(`cat.${c.id}`) })}
                aria-label={t(on.length ? 'layers.groupOffAria' : 'layers.groupOnAria', { g: t(`cat.${c.id}`) })}
              >
                {on.length || ids.length}
              </button>
            </div>
          )
        })}
      </div>
      {overlaysIn(s.layerTab).map((l) => {
        const on = s.overlays.includes(l.id)
        // The source line names the organisation, so a title ending in the same name drops it.
        const title = t(`layer.${l.id}.title`).replace(/\s*\(([^()]+)\)$/, (m, org) => (org === l.organisation ? '' : m))
        return (
          <label key={l.id} className="row">
            <input type="checkbox" checked={on} onChange={() => toggle(l.id)} />
            <span>
              {l.id === 'treatment-heat' ? (
                <Hint id="treatmentHeat" text={t('hint.treatmentHeat')}>{t(`layer.${l.id}.title`)}</Hint>
              ) : l.id === 'lice-week' ? (
                <Hint id="liceWeek" text={t('hint.liceWeek')}>{t(`layer.${l.id}.title`)}</Hint>
              ) : l.id === 'lice-heat' ? (
                <Hint id="liceHeat" text={t(`hint.weekHeat.${s.weekHeatMode}`)}>{t(`weekHeat.title.${s.weekHeatMode}`)}</Hint>
              ) : (
                title
              )}
              {s.layerDetails && l.description && <small>{t(`layer.${l.id}.desc`)}</small>}
              <small className="layer-meta">
                {l.organisation} · {l.license}
                {s.layerDetails ? ` · ${t(`layers.cache.${l.cache}`)}` : ''}
              </small>
              {on &&
                legendUrls(l).map((u) => (
                  // A service without GetLegendGraphic simply yields no image.
                  <img key={u} className="legend-img" src={u} alt={t('layers.legendAlt', { l: t(`layer.${l.id}.title`) })} loading="lazy" onError={(e) => (e.currentTarget.hidden = true)} />
                ))}
              {on && CLIM_FIELDS[l.id] && (
                <span className="heat-controls" onClick={(e) => e.preventDefault()}>
                  <label className="heat-radius">
                    <Hint id="climMonth" text={t('hint.climMonth')}>{t('clim.month')}</Hint>
                    <select value={s.climMonth} onChange={(e) => updateSettings({ climMonth: Number(e.target.value) })}>
                      {MONTHS.map((m) => (
                        <option key={m} value={m}>
                          {new Date(Date.UTC(2024, m - 1, 1)).toLocaleDateString(numberLocale(), { month: 'long', timeZone: 'UTC' })}
                        </option>
                      ))}
                    </select>
                  </label>
                  <span className="heat-legend">
                    <span className="heat-bar" style={{ background: `linear-gradient(to right, ${CLIM_RAMP.join(', ')})` }} />
                    <span className="heat-ticks">
                      <span>0</span>
                      <span>{l.id === 'clim-waves' ? '4 m' : '15 m/s'}</span>
                      <span>{l.id === 'clim-waves' ? '≥ 8 m' : '≥ 30 m/s'}</span>
                    </span>
                    <small>{t(`clim.legend.${l.id === 'clim-waves' ? 'waves' : 'wind'}`)}</small>
                  </span>
                </span>
              )}
              {on && (l.id === 'treatment-heat' || l.id === 'lice-heat') && (
                <span className="heat-controls" onClick={(e) => e.preventDefault()}>
                  <label className="heat-radius">
                    <Hint id="heatRadius" text={t('hint.heatRadius')}>{t('heat.radius')}</Hint>
                    <select value={s.heatRadiusKm} onChange={(e) => updateSettings({ heatRadiusKm: Number(e.target.value) })}>
                      {HEAT_RADII_KM.map((r) => (
                        <option key={r} value={r}>
                          {r} km
                        </option>
                      ))}
                    </select>
                  </label>
                  <span className="heat-legend" aria-label={t(l.id === 'lice-heat' ? `weekHeat.legend.${s.weekHeatMode}` : 'heat.legend')}>
                    <span className="heat-bar" style={{ background: `linear-gradient(to right, ${HEAT_RAMP.join(', ')})` }} />
                    {l.id === 'lice-heat' ? (
                      <span className="heat-ticks">
                        {(s.weekHeatMode === 'treatment' ? ['0 %', `${(WEEK_HEAT_MAX.treatment * 100) / 2} %`, `≥ ${WEEK_HEAT_MAX.treatment * 100} %`] : ['0', String(WEEK_HEAT_MAX.lice / 2), `≥ ${WEEK_HEAT_MAX.lice}`]).map((x, i) => (
                          <span key={i}>{x}</span>
                        ))}
                      </span>
                    ) : (
                      <span className="heat-ticks">
                        <span>0 %</span>
                        <span>{Math.round((HEAT_MAX * 100) / 2)} %</span>
                        <span>≥ {Math.round(HEAT_MAX * 100)} %</span>
                      </span>
                    )}
                    <small>{t(l.id === 'lice-heat' ? `weekHeat.legend.${s.weekHeatMode}` : 'heat.legend')}</small>
                  </span>
                </span>
              )}
            </span>
          </label>
        )
      })}
    </div>
  )
}
