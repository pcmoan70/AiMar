import { BASE_LAYERS, LEGEND, OVERLAY_LAYERS } from '../lib/layers'
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
      <h2>Base map</h2>
      {BASE_LAYERS.map((l) => (
        <label key={l.id} className="row">
          <input
            type="radio"
            name="base"
            checked={s.baseLayer === l.id}
            onChange={() => updateSettings({ baseLayer: l.id })}
          />
          <span>
            {l.title}
            <small>
              {l.organisation} · {l.license}
            </small>
          </span>
        </label>
      ))}
      <h2>Overlays</h2>
      {OVERLAY_LAYERS.map((l) => {
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
      <h2>Legend</h2>
      {LEGEND.map((e) => (
        <div key={e.label} className="row legend">
          <span className="swatch" style={{ background: e.colour }} />
          <span>{e.label}</span>
        </div>
      ))}
    </div>
  )
}
