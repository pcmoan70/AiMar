import { neighbourhood, type Localities } from '../lib/localities'
import { licePressure, liceSeries, operatorPressureSeries, summarise, type FishHealth } from '../lib/fishhealth'
import { ALL_FARMS_COLOUR, paletteFor } from '../lib/operatorColours'
import { useSettings } from '../lib/settings'
import LiceChart from './LiceChart'
import Hint from './Hint'
import { HINTS, type HintKey } from '../lib/hints'
import type { Selection } from './MapView'

interface Props {
  selection: Selection | null
  localities: Localities | null
  fishhealth: FishHealth | null
}

const fmtDate = (ms: number | null) => (ms ? new Date(ms).toISOString().slice(0, 10) : '–')
const fmtNum = (n: number) => n.toLocaleString('en-GB', { maximumFractionDigits: 0 })

export default function InspectPanel({ selection, localities, fishhealth }: Props) {
  const { operatorFilter } = useSettings()
  if (!selection) return <div className="panel-body muted">Click a locality or any point in the sea.</div>

  if (selection.type === 'farm') {
    const p = selection.props
    const rows: [string, string, HintKey][] = [
      ['Locality no.', String(p.loknr), 'loknr'],
      ['Status', p.status_lokalitet, 'status'],
      ['Capacity', p.kapasitet_lok != null ? `${fmtNum(p.kapasitet_lok)} ${p.kapasitet_unittype ?? ''}` : '–', 'capacity'],
      ['Species', p.til_arter ?? '–', 'species'],
      ['Operators', p.til_innehavere ?? '–', 'operators'],
      ['Purpose', p.til_formaal ?? '–', 'purpose'],
      ['Production form', p.til_produksjonsform ?? '–', 'productionForm'],
      ['Placement', `${p.plassering} · ${p.vannmiljo}`, 'placement'],
      ['Municipality', `${p.kommune}, ${p.fylke}`, 'municipality'],
      ['Production area', p.prodareacode ?? '–', 'prodArea'],
      ['First clearance', fmtDate(p.klareringsdato), 'clearance'],
    ]
    const series = fishhealth ? liceSeries(fishhealth, p.loknr) : null
    const sum = series ? summarise(series) : null
    const site = localities?.features.find((f) => f.properties.loknr === p.loknr)
    const at = site?.geometry.coordinates as [number, number] | undefined
    const extras =
      fishhealth && localities && at
        ? operatorFilter.length
          ? operatorFilter.slice(0, 8).map((op) => {
              const s = operatorPressureSeries(fishhealth, localities, op, at, p.loknr)
              return { name: `${op} (${s.farms} farms)`, values: s.values, colour: paletteFor(operatorFilter).get(op)! }
            })
          : [(() => {
              const s = operatorPressureSeries(fishhealth, localities, undefined, at, p.loknr)
              return { name: `All farms within 150 km (${s.farms})`, values: s.values, colour: ALL_FARMS_COLOUR }
            })()]
        : []
    return (
      <div className="panel-body">
        <h2>{p.navn}</h2>
        <table className="kv">
          <tbody>
            {rows.map(([k, v, h]) => (
              <tr key={k}>
                <th>
                  <Hint text={HINTS[h]}>{k}</Hint>
                </th>
                <td>{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <h3>Fish health</h3>
        {series && sum ? (
          <>
            <table className="kv">
              <tbody>
                <tr>
                  <th>
                    <Hint text={HINTS.latestLice}>Latest lice</Hint>
                  </th>
                  <td>{sum.latest ? `${sum.latest.lice} (week ${sum.latest.week})` : 'not reported'}{sum.fallowNow ? ' · fallow now' : ''}</td>
                </tr>
                <tr>
                  <th>
                    <Hint text={HINTS.last52}>Last 52 weeks</Hint>
                  </th>
                  <td>
                    {sum.weeksReported} weeks reported, {sum.weeksAboveLimit} above limit, {sum.treatments} with treatment
                  </td>
                </tr>
              </tbody>
            </table>
            <Hint text={operatorFilter.length ? HINTS.liceChartOperators : HINTS.liceChartAll} block>
              <LiceChart series={series} extras={extras} />
            </Hint>
            {!operatorFilter.length && <p className="muted">Select operators in the map dropdown to compare with their farms instead of all farms.</p>}
            <p className="muted">Source: BarentsWatch fish health (NLOD 2.0), snapshot {fishhealth!.retrieved.slice(0, 10)}.</p>
          </>
        ) : (
          <p className="muted">{fishhealth ? 'No fish-health reports for this locality.' : 'Fish-health data not loaded.'}</p>
        )}
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
            <th>
              <Hint text={HINTS.position}>Position</Hint>
            </th>
            <td>
              {lat.toFixed(5)}°N, {lon.toFixed(5)}°E
            </td>
          </tr>
          {nb?.nearest && (
            <tr>
              <th>
                <Hint text={HINTS.nearestFarm}>Nearest farm</Hint>
              </th>
              <td>
                {nb.nearest.name} ({nb.nearest.loknr}), {nb.nearest.km.toFixed(1)} km
              </td>
            </tr>
          )}
        </tbody>
      </table>
      {fishhealth && localities && (
        <>
          <h3>
            <Hint text={HINTS.licePressure}>Lice pressure, last 52 weeks</Hint>
          </h3>
          <table className="kv">
            <thead>
              <tr>
                <th>Radius</th>
                <th>Farms</th>
                <th>Mean lice</th>
                <th>Weeks &gt; limit</th>
              </tr>
            </thead>
            <tbody>
              {licePressure(fishhealth, localities, selection.lngLat).map((r) => (
                <tr key={r.km}>
                  <th>{r.km} km</th>
                  <td>{r.farmsReporting}</td>
                  <td>{r.meanLice != null ? r.meanLice.toFixed(2) : '–'}</td>
                  <td>{r.shareAboveLimit != null ? `${Math.round(r.shareAboveLimit * 100)}%` : '–'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
      {nb && (
        <>
          <h3>
            <Hint text={HINTS.neighbours}>Neighbouring farms</Hint>
          </h3>
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
