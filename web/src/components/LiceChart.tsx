import { useState } from 'react'
import { FLAG, LICE_LIMIT, type WeekPoint } from '../lib/fishhealth'
import { SITE_COLOUR } from '../lib/operatorColours'
import { useT } from '../lib/i18n'

export interface ExtraSeries {
  name: string
  values: (number | null)[]
  colour: string
}

interface Props {
  series: WeekPoint[]
  /** Additional lines aligned with `series` (same weeks), e.g. operator pressure. */
  extras?: ExtraSeries[]
  /** Farm-reported sea temperature (°C) aligned with `series`; adds a panel below the lice chart. */
  temp?: (number | null)[]
}



const W = 320
const H = 150
const PAD = { l: 30, r: 8, t: 8, b: 30 }
/** Height and padding of the temperature panel. */
const HT = 70
const PT = { t: 6, b: 4 }

const eventLabel = (t: (k: string) => string, flags: number) =>
  [
    flags & FLAG.mechanical ? t('event.mechanical') : '',
    flags & FLAG.substance ? t('event.medicinal') : '',
    flags & FLAG.fallow ? t('event.fallow') : '',
    flags & FLAG.pd ? t('event.pd') : '',
    flags & FLAG.ila ? t('event.ila') : '',
  ]
    .filter(Boolean)
    .join(', ')

const RANGES: { key: string; weeks: number | null }[] = [
  { key: 'chart.range.1y', weeks: 52 },
  { key: 'chart.range.4y', weeks: 4 * 52 },
  { key: 'chart.range.8y', weeks: 8 * 52 },
  { key: 'chart.range.all', weeks: null },
]

export default function LiceChart({ series: full, extras = [], temp }: Props) {
  const t = useT()
  const [hover, setHover] = useState<number | null>(null)
  const [range, setRange] = useState(1)
  const [view, setView] = useState<'history' | 'scatter'>('history')
  const weeks = RANGES[range].weeks
  const offset = weeks === null ? 0 : Math.max(0, full.length - weeks)
  const series = full.slice(offset)
  const extraVals = extras.map((x) => x.values.slice(offset))
  const tempVals = temp?.slice(offset)
  const hasTemp = !!tempVals?.some((v) => v != null)
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
      <div className="chart-range">
        <button
          type="button"
          className="secondary chart-toggle"
          onClick={() => { setView(view === 'history' ? 'scatter' : 'history'); setHover(null) }}
          disabled={!extras.length}
          title={t(view === 'history' ? 'chart.showScatterTitle' : 'chart.showHistoryTitle')}
        >
          {t(view === 'history' ? 'chart.showScatter' : 'chart.showHistory')}
        </button>
        <label>
          <select value={range} onChange={(e) => { setRange(Number(e.target.value)); setHover(null) }} aria-label={t('chart.periodAria')}>
            {RANGES.map((r, i) => (
              <option key={r.key} value={i} disabled={r.weeks !== null && r.weeks > full.length && i > 0}>
                {t(r.key)}
              </option>
            ))}
          </select>
        </label>
      </div>
      {view === 'scatter' ? (
        <ScatterView series={series} extras={extras} extraVals={extraVals} hover={hover} setHover={setHover} t={t} />
      ) : (
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={t('chart.aria')}
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
        <path d={series.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(p.limit).toFixed(1)}`).join(' ')} className="chart-limit" />
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
      )}
      {view === 'history' && hasTemp && tempVals && (() => {
        const tmax = Math.max(10, ...tempVals.map((v) => v ?? 0)) + 1
        const tmin = Math.min(0, ...tempVals.map((v) => v ?? 0))
        const innerT = HT - PT.t - PT.b
        const ty = (v: number) => PT.t + innerT - ((v - tmin) / (tmax - tmin)) * innerT
        let d = ''
        let pen = false
        tempVals.forEach((v, i) => {
          if (v == null) {
            pen = false
            return
          }
          d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)} ${ty(v).toFixed(1)} `
          pen = true
        })
        const tticks = [0, 5, 10, 15, 20].filter((v) => v >= tmin && v <= tmax)
        const onMoveT = (e: React.MouseEvent<SVGSVGElement>) => {
          const rect = e.currentTarget.getBoundingClientRect()
          const px = ((e.clientX - rect.left) / rect.width) * W
          const i = Math.round(((px - PAD.l) / innerW) * (n - 1))
          setHover(Math.min(Math.max(i, 0), n - 1))
        }
        return (
          <svg viewBox={`0 0 ${W} ${HT}`} role="img" aria-label={t('chart.tempAria')} className="chart-temp" onMouseMove={onMoveT} onMouseLeave={() => setHover(null)}>
            {tticks.map((v) => (
              <g key={v}>
                <line x1={PAD.l} x2={W - PAD.r} y1={ty(v)} y2={ty(v)} className="chart-grid" />
                <text x={PAD.l - 4} y={ty(v) + 3} className="chart-tick" textAnchor="end">{v}°</text>
              </g>
            ))}
            <path d={d} className="chart-line temp" />
            {h && (
              <g>
                <line x1={x(hover!)} x2={x(hover!)} y1={PT.t} y2={HT - PT.b} className="chart-crosshair" />
                {tempVals[hover!] != null && <circle cx={x(hover!)} cy={ty(tempVals[hover!]!)} r={4} className="chart-marker temp" />}
              </g>
            )}
          </svg>
        )
      })()}
      {extras.length > 0 && (
        <div className="chart-legend">
          <span><i style={{ background: SITE_COLOUR }} /> {t('chart.thisSite')}</span>
          {extras.map((x) => (
            <span key={x.name}><i style={{ background: x.colour }} /> {x.name}</span>
          ))}
        </div>
      )}
      <div className="chart-readout">
        {h && view === 'scatter' ? (
          <>
            {t('chart.week', { w: h.week })}: <strong>{h.lice != null ? h.lice.toFixed(2) : '–'}</strong> {t('chart.hereVs')}{' '}
            {extras.map((x, k) => (
              <span key={x.name} className="chart-readout-extra">
                <i style={{ background: x.colour }} /> {extraVals[k][hover!] != null ? extraVals[k][hover!]!.toFixed(2) : '–'}
              </span>
            ))}
          </>
        ) : h ? (
          <>
            <strong>{h.lice != null ? h.lice.toFixed(2) : t('chart.notReported')}</strong> {t('chart.week', { w: h.week })}
            {eventLabel(t, h.flags) ? ` · ${eventLabel(t, h.flags)}` : ''}
            {tempVals?.[hover!] != null ? ` · ${tempVals[hover!]!.toFixed(1)} °C` : ''}
            {extras.map((x, k) => (
              <span key={x.name} className="chart-readout-extra">
                <i style={{ background: x.colour }} /> {extraVals[k][hover!] != null ? extraVals[k][hover!]!.toFixed(2) : '–'}
              </span>
            ))}
          </>
        ) : view === 'scatter' ? (
          <span className="muted">
            {t('chart.scatterHint')}
            {extraVals[0] && (() => {
              const pairs = series.map((p, i) => [p.lice, extraVals[0][i]] as const).filter(([a, b]) => a != null && b != null) as [number, number][]
              const above = pairs.filter(([a, b]) => a > b).length
              return pairs.length ? t('chart.aboveShare', { name: extras[0].name.split(' (')[0], p: Math.round((100 * above) / pairs.length), n: pairs.length }) : ''
            })()}
          </span>
        ) : (
          <span className="muted">{t('chart.legend')}{hasTemp ? ` ${t('chart.tempLegend')}` : ''}</span>
        )}
      </div>
      <details>
        <summary className="muted">{t('chart.table')}</summary>
        <table className="kv">
          <thead>
            <tr>
              <th>{t('chart.colWeek')}</th>
              <th>{t('chart.colLice')}</th>
              {extras.map((x) => (
                <th key={x.name}>{x.name.split(' ')[0]}</th>
              ))}
              {hasTemp && <th>°C</th>}
              <th>{t('chart.colEvents')}</th>
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
                  {hasTemp && <td>{tempVals?.[i] != null ? tempVals[i]!.toFixed(1) : '–'}</td>}
                  <td>{eventLabel(t, p.flags) || '–'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </details>
    </div>
  )
}


interface ScatterProps {
  series: WeekPoint[]
  extras: ExtraSeries[]
  extraVals: (number | null)[][]
  hover: number | null
  setHover: (i: number | null) => void
  t: (k: string) => string
}

const SP = { l: 30, r: 8, t: 8, b: 26 }

function ScatterView({ series, extras, extraVals, hover, setHover, t }: ScatterProps) {
  const innerW = W - SP.l - SP.r
  const innerH = H - SP.t - SP.b
  const maxVal = Math.max(LICE_LIMIT * 1.4, ...series.map((p) => p.lice ?? 0), ...extraVals.flat().map((v) => v ?? 0)) * 1.05
  const sx = (v: number) => SP.l + (v / maxVal) * innerW
  const sy = (v: number) => SP.t + innerH - (v / maxVal) * innerH
  const step = maxVal > 2 ? 1 : 0.5
  const ticks: number[] = []
  for (let v = 0; v <= maxVal; v += step) ticks.push(v)
  const points = extraVals.flatMap((vals, k) =>
    series.map((p, i) => (p.lice != null && vals[i] != null ? { i, k, x: sx(vals[i]!), y: sy(p.lice) } : null)).filter(Boolean) as { i: number; k: number; x: number; y: number }[],
  )
  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const px = ((e.clientX - rect.left) / rect.width) * W
    const py = ((e.clientY - rect.top) / rect.height) * H
    let best: { i: number; d: number } | null = null
    for (const pt of points) {
      const d = Math.hypot(pt.x - px, pt.y - py)
      if (d < 12 && (!best || d < best.d)) best = { i: pt.i, d }
    }
    setHover(best ? best.i : null)
  }
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={t('chart.scatterAria')} onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
      {ticks.map((v) => (
        <g key={v}>
          <line x1={SP.l} x2={W - SP.r} y1={sy(v)} y2={sy(v)} className="chart-grid" />
          <line y1={SP.t} y2={H - SP.b} x1={sx(v)} x2={sx(v)} className="chart-grid" />
          <text x={SP.l - 4} y={sy(v) + 3} className="chart-tick" textAnchor="end">{v}</text>
          <text x={sx(v)} y={H - SP.b + 11} className="chart-tick" textAnchor="middle">{v}</text>
        </g>
      ))}
      <line x1={sx(0)} y1={sy(0)} x2={sx(maxVal)} y2={sy(maxVal)} className="chart-diagonal" />
      <line x1={SP.l} x2={W - SP.r} y1={sy(LICE_LIMIT)} y2={sy(LICE_LIMIT)} className="chart-limit" />
      <text x={W - SP.r} y={H - 3} className="chart-tick" textAnchor="end">{t('chart.axisOther')}</text>
      <text x={SP.l + 4} y={SP.t + 9} className="chart-tick">{t('chart.axisSite')}</text>
      {points.map((pt) => (
        <circle key={`${pt.k}-${pt.i}`} cx={pt.x} cy={pt.y} r={hover === pt.i ? 5 : 3} className="chart-dot" style={{ fill: extras[pt.k].colour, opacity: hover === null || hover === pt.i ? 0.85 : 0.3 }} />
      ))}
    </svg>
  )
}
