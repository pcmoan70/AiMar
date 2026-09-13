import { neighbourhood, type Localities } from '../lib/localities'
import type { Selection } from './MapView'

interface Props {
  selection: Selection | null
  localities: Localities | null
}

const fmtDate = (ms: number | null) => (ms ? new Date(ms).toISOString().slice(0, 10) : '–')
const fmtNum = (n: number) => n.toLocaleString('en-GB', { maximumFractionDigits: 0 })

export default function InspectPanel({ selection, localities }: Props) {
  if (!selection) return <div className="panel-body muted">Click a locality or any point in the sea.</div>

  if (selection.type === 'farm') {
    const p = selection.props
    const rows: [string, string][] = [
      ['Locality no.', String(p.loknr)],
      ['Status', p.status_lokalitet],
      ['Capacity', p.kapasitet_lok != null ? `${fmtNum(p.kapasitet_lok)} ${p.kapasitet_unittype ?? ''}` : '–'],
      ['Species', p.til_arter ?? '–'],
      ['Operators', p.til_innehavere ?? '–'],
      ['Purpose', p.til_formaal ?? '–'],
      ['Production form', p.til_produksjonsform ?? '–'],
      ['Placement', `${p.plassering} · ${p.vannmiljo}`],
      ['Municipality', `${p.kommune}, ${p.fylke}`],
      ['Production area', p.prodareacode ?? '–'],
      ['First clearance', fmtDate(p.klareringsdato)],
    ]
    return (
      <div className="panel-body">
        <h2>{p.navn}</h2>
        <table className="kv">
          <tbody>
            {rows.map(([k, v]) => (
              <tr key={k}>
                <th>{k}</th>
                <td>{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {p.lokalitet_url && (
          <p>
            <a href={p.lokalitet_url} target="_blank" rel="noreferrer">
              Open in Akvakulturregisteret ↗
            </a>
          </p>
        )}
        <p className="muted">Source: Fiskeridirektoratet, Akvakulturregisteret (NLOD 2.0), bundled snapshot.</p>
      </div>
    )
  }

  const [lon, lat] = selection.lngLat
  const nb = localities ? neighbourhood(localities, selection.lngLat) : null
  return (
    <div className="panel-body">
      <h2>Hypothetical site</h2>
      <table className="kv">
        <tbody>
          <tr>
            <th>Position</th>
            <td>
              {lat.toFixed(5)}°N, {lon.toFixed(5)}°E
            </td>
          </tr>
          {nb?.nearest && (
            <tr>
              <th>Nearest farm</th>
              <td>
                {nb.nearest.name} ({nb.nearest.loknr}), {nb.nearest.km.toFixed(1)} km
              </td>
            </tr>
          )}
        </tbody>
      </table>
      {nb && (
        <>
          <h3>Neighbouring farms</h3>
          <table className="kv">
            <thead>
              <tr>
                <th>Radius</th>
                <th>Farms</th>
                <th>Capacity (t)</th>
              </tr>
            </thead>
            <tbody>
              {nb.within.map((w) => (
                <tr key={w.km}>
                  <th>{w.km} km</th>
                  <td>{w.count}</td>
                  <td>{fmtNum(w.capacityTn)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
      <p className="muted">
        Physical, regulatory and connectivity features for hypothetical sites arrive in later phases.
      </p>
    </div>
  )
}
