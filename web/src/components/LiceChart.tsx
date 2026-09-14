import { useState } from 'react'
import { FLAG, LICE_LIMIT, type WeekPoint } from '../lib/fishhealth'

interface Props {
  series: WeekPoint[]
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

export default function LiceChart({ series }: Props) {
  const [hover, setHover] = useState<number | null>(null)
  const n = series.length
  const innerW = W - PAD.l - PAD.r
  const innerH = H - PAD.t - PAD.b
  const x = (i: number) => PAD.l + (n > 1 ? (i / (n - 1)) * innerW : 0)
  const maxVal = Math.max(LICE_LIMIT * 1.4, ...series.map((p) => p.lice ?? 0)) * 1.05
  const y = (v: number) => PAD.t + innerH - (v / maxVal) * innerH

  // Line path with gaps where nothing was reported.
  let path = ''
  let pen = false
  series.forEach((p, i) => {
    if (p.lice == null) {
      pen = false
      return
    }
    path += `${pen ? 'L' : 'M'}${x(i).toFixed(1)} ${y(p.lice).toFixed(1)} `
    pen = true
  })

  const ticks: number[] = []
  const step = maxVal > 2 ? 1 : 0.5
  for (let v = 0; v <= maxVal; v += step) ticks.push(v)

  const yearStarts = series.map((p, i) => (p.week.endsWith('-01') ? i : -1)).filter((i) => i >= 0)

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
        {yearStarts.map((i) => (
          <text key={i} x={x(i)} y={H - PAD.b + 12} className="chart-tick" textAnchor="start">{series[i].week.slice(0, 4)}</text>
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
          </g>
        )}
      </svg>
      <div className="chart-readout">
        {h ? (
          <>
            <strong>{h.lice != null ? h.lice.toFixed(2) : 'not reported'}</strong> week {h.week}
            {eventLabel(h.flags) ? ` · ${eventLabel(h.flags)}` : ''}
          </>
        ) : (
          <span className="muted">Adult female lice per fish · red line = {LICE_LIMIT} limit · ▲ mechanical ◆ medicinal · grey = fallow</span>
        )}
      </div>
      <details>
        <summary className="muted">Last 12 weeks as table</summary>
        <table className="kv">
          <thead><tr><th>Week</th><th>Lice</th><th>Events</th></tr></thead>
          <tbody>
            {series.slice(-12).reverse().map((p) => (
              <tr key={p.week}><th>{p.week}</th><td>{p.lice ?? '–'}</td><td>{eventLabel(p.flags) || '–'}</td></tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  )
}
