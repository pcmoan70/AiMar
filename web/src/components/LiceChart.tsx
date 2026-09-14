import { useState } from 'react'
import { FLAG, LICE_LIMIT, SERIES_COLOURS, type WeekPoint } from '../lib/fishhealth'

export interface ExtraSeries {
  name: string
  values: (number | null)[]
  colour: string
}

interface Props {
  series: WeekPoint[]
  /** Additional lines aligned with `series` (same weeks), e.g. operator pressure. */
  extras?: ExtraSeries[]
}



const W = 320
const H = 150
const PAD = { l: 30, r: 8, t: 8, b: 30 }

const eventLabel = (flags: number) =>
  [
    flags & FLAG.mechanical ? 'mechanical removal' : '',
    flags & FLAG.substance ? 'medicinal treatment' : '',
    flags & FLAG.fallow ? 'fallow' : '',
    flags & FLAG.pd ? 'PD' : '',
    flags & FLAG.ila ? 'ILA' : '',
  ]
    .filter(Boolean)
    .join(', ')

const RECENT_WEEKS = 4 * 52

export default function LiceChart({ series: full, extras = [] }: Props) {
  const [hover, setHover] = useState<number | null>(null)
  const [all, setAll] = useState(false)
  const hasMore = full.length > RECENT_WEEKS
  const offset = all || !hasMore ? 0 : Math.max(0, full.length - RECENT_WEEKS)
  const series = full.slice(offset)
  const extraVals = extras.map((x) => x.values.slice(offset))
  const n = series.length
  const innerW = W - PAD.l - PAD.r
  const innerH = H - PAD.t - PAD.b
  const x = (i: number) => PAD.l + (n > 1 ? (i / (n - 1)) * innerW : 0)
  const maxVal = Math.max(LICE_LIMIT * 1.4, ...series.map((p) => p.lice ?? 0), ...extraVals.flat().map((v) => v ?? 0)) * 1.05
  const y = (v: number) => PAD.t + innerH - (v / maxVal) * innerH

  // Line paths with gaps where nothing was reported.
  const pathOf = (vals: (number | null)[]) => {
    let d = ''
    let pen = false
    vals.forEach((v, i) => {
      if (v == null) {
        pen = false
        return
      }
      d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)} `
      pen = true
    })
    return d
  }
  const path = pathOf(series.map((p) => p.lice))

  const ticks: number[] = []
  const step = maxVal > 2 ? 1 : 0.5
  for (let v = 0; v <= maxVal; v += step) ticks.push(v)

  const yearStarts = series.map((p, i) => (p.week.endsWith('-01') ? i : -1)).filter((i) => i >= 0)
  const labelEvery = yearStarts.length > 7 ? 2 : 1

  // Fallow periods as a light wash behind the line.
  const fallow: [number, number][] = []
  series.forEach((p, i) => {
    if (!(p.flags & FLAG.fallow)) return
    const last = fallow[fallow.length - 1]
    if (last && last[1] === i - 1) last[1] = i
    else fallow.push([i, i])
  })

  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const px = ((e.clientX - rect.left) / rect.width) * W
    const i = Math.round(((px - PAD.l) / innerW) * (n - 1))
    setHover(Math.min(Math.max(i, 0), n - 1))
  }
  const h = hover != null ? series[hover] : null

  return (
    <div className="chart">
      {hasMore && (
        <div className="chart-range">
          <button type="button" className={all ? 'secondary' : ''} onClick={() => setAll(false)}>Last 4 years</button>
          <button type="button" className={all ? '' : 'secondary'} onClick={() => setAll(true)}>
            Since {full[0].week.slice(0, 4)}
          </button>
        </div>
      )}
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Adult female lice per fish by week"
        onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
        {fallow.map(([a, b]) => (
          <rect key={a} x={x(a)} y={PAD.t} width={Math.max(x(b) - x(a), 1)} height={innerH} className="chart-fallow" />
        ))}
        {ticks.map((v) => (
          <g key={v}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)} className="chart-grid" />
            <text x={PAD.l - 4} y={y(v) + 3} className="chart-tick" textAnchor="end">{v}</text>
          </g>
        ))}
        <line x1={PAD.l} x2={W - PAD.r} y1={y(LICE_LIMIT)} y2={y(LICE_LIMIT)} className="chart-limit" />
        {yearStarts.map((i, k) =>
          k % labelEvery === 0 ? (
            <text key={i} x={x(i)} y={H - PAD.b + 12} className="chart-tick" textAnchor="start">{series[i].week.slice(0, 4)}</text>
          ) : null,
        )}
        {extraVals.map((vals, k) => (
          <path key={k} d={pathOf(vals)} className="chart-line extra" style={{ stroke: extras[k].colour }} />
        ))}
        <path d={path} className="chart-line" />
        {series.map((p, i) =>
          p.flags & (FLAG.mechanical | FLAG.substance) ? (
            <path key={i} className="chart-event"
              d={p.flags & FLAG.mechanical
                ? `M${x(i)} ${H - PAD.b + 17} l3 5 h-6 z`
                : `M${x(i)} ${H - PAD.b + 16} l3 3 l-3 3 l-3 -3 z`} />
          ) : null,
        )}
        {h && (
          <g>
            <line x1={x(hover!)} x2={x(hover!)} y1={PAD.t} y2={H - PAD.b} className="chart-crosshair" />
            {h.lice != null && <circle cx={x(hover!)} cy={y(h.lice)} r={4} className="chart-marker" />}
            {extraVals.map((vals, k) =>
              vals[hover!] != null ? <circle key={k} cx={x(hover!)} cy={y(vals[hover!]!)} r={4} className="chart-marker" style={{ fill: extras[k].colour }} /> : null,
            )}
          </g>
        )}
      </svg>
      {extras.length > 0 && (
        <div className="chart-legend">
          <span><i style={{ background: SERIES_COLOURS[0] }} /> This site</span>
          {extras.map((x) => (
            <span key={x.name}><i style={{ background: x.colour }} /> {x.name}</span>
          ))}
        </div>
      )}
      <div className="chart-readout">
        {h ? (
          <>
            <strong>{h.lice != null ? h.lice.toFixed(2) : 'not reported'}</strong> week {h.week}
            {eventLabel(h.flags) ? ` · ${eventLabel(h.flags)}` : ''}
            {extras.map((x, k) => (
              <span key={x.name} className="chart-readout-extra">
                <i style={{ background: x.colour }} /> {extraVals[k][hover!] != null ? extraVals[k][hover!]!.toFixed(2) : '–'}
              </span>
            ))}
          </>
        ) : (
          <span className="muted">Adult female lice per fish · red line = {LICE_LIMIT} limit · ▲ mechanical ◆ medicinal · grey = fallow</span>
        )}
      </div>
      <details>
        <summary className="muted">Last 12 weeks as table</summary>
        <table className="kv">
          <thead>
            <tr>
              <th>Week</th>
              <th>Lice</th>
              {extras.map((x) => (
                <th key={x.name}>{x.name.split(' ')[0]}</th>
              ))}
              <th>Events</th>
            </tr>
          </thead>
          <tbody>
            {series.slice(-12).reverse().map((p, r) => {
              const i = series.length - 1 - r
              return (
                <tr key={p.week}>
                  <th>{p.week}</th>
                  <td>{p.lice ?? '–'}</td>
                  {extraVals.map((vals, k) => (
                    <td key={k}>{vals[i] != null ? vals[i]!.toFixed(2) : '–'}</td>
                  ))}
                  <td>{eventLabel(p.flags) || '–'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </details>
    </div>
  )
}
