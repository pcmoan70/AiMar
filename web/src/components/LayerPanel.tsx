import { CATEGORIES, LEGEND, overlaysIn } from '../lib/layers'
import { updateSettings, useSettings } from '../lib/settings'

const CACHE_LABEL = { precache: 'bundled', 'cache-first': 'cached on view', forecast: 'forecast, cached 1 day' }

export default function LayerPanel() {
  const s = useSettings()
  const toggle = (id: string) =>
    updateSettings({
      overlays: s.overlays.includes(id) ? s.overlays.filter((o) => o !== id) : [...s.overlays, id],
    })

  return (
    <div className="panel-body">
      <h2>Overlays</h2>
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
                {c.title}
              </button>
              <button
                className={`badge${on.length ? ' on' : ''}`}
                onClick={toggleGroup}
                title={on.length ? `Switch off all ${c.title} layers` : `Switch on ${c.title} layers`}
                aria-label={`${on.length ? 'Switch off' : 'Switch on'} ${c.title} overlays`}
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
              {l.title}
              <small>
                {l.description ? `${l.description} ` : ''}
                {l.organisation} · {l.license} · {CACHE_LABEL[l.cache]}
              </small>
              {on && l.legend && <img className="legend-img" src={l.legend} alt={`${l.title} legend`} />}
            </span>
          </label>
        )
      })}
      {s.layerTab === 'aquaculture' && (
        <>
          <h3>Legend</h3>
          {LEGEND.map((e) => (
            <div key={e.label} className="row legend">
              <span className="swatch" style={{ background: e.colour }} />
              <span>{e.label}</span>
            </div>
          ))}
        </>
      )}
    </div>
  )
}
