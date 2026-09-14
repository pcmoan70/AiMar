import { CATEGORIES, overlaysIn } from '../lib/layers'
import { HEAT_MAX, HEAT_RADII_KM, HEAT_RAMP } from '../lib/heatmap'
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
      <h2>{t('layers.overlays')}</h2>
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
        return (
          <label key={l.id} className="row">
            <input type="checkbox" checked={on} onChange={() => toggle(l.id)} />
            <span>
              {l.id === 'treatment-heat' ? <Hint text={t('hint.treatmentHeat')}>{t(`layer.${l.id}.title`)}</Hint> : t(`layer.${l.id}.title`)}
              <small>
                {l.description ? `${t(`layer.${l.id}.desc`)} ` : ''}
                {l.organisation} · {l.license} · {t(`layers.cache.${l.cache}`)}
              </small>
              {on && l.legend && <img className="legend-img" src={l.legend} alt={t('layers.legendAlt', { l: t(`layer.${l.id}.title`) })} />}
              {on && l.id === 'treatment-heat' && (
                <span className="heat-controls" onClick={(e) => e.preventDefault()}>
                  <label className="heat-radius">
                    <Hint text={t('hint.heatRadius')}>{t('heat.radius')}</Hint>
                    <select value={s.heatRadiusKm} onChange={(e) => updateSettings({ heatRadiusKm: Number(e.target.value) })}>
                      {HEAT_RADII_KM.map((r) => (
                        <option key={r} value={r}>
                          {r} km
                        </option>
                      ))}
                    </select>
                  </label>
                  <span className="heat-legend" aria-label={t('heat.legend')}>
                    <span className="heat-bar" style={{ background: `linear-gradient(to right, ${HEAT_RAMP.join(', ')})` }} />
                    <span className="heat-ticks">
                      <span>0 %</span>
                      <span>{Math.round((HEAT_MAX * 100) / 2)} %</span>
                      <span>≥ {Math.round(HEAT_MAX * 100)} %</span>
                    </span>
                    <small>{t('heat.legend')}</small>
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
