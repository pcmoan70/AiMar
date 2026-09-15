import { useMemo, useRef } from 'react'
import { limitsForWeek, type FishHealth } from '../lib/fishhealth'
import type { Localities } from '../lib/localities'
import { isoWeekStart, LICE_BINS, NOT_REPORTED_COLOUR, parseWeek, summariseWeek, weekShares } from '../lib/liceWeek'
import { updateSettings } from '../lib/settings'
import { useT, useLang } from '../lib/i18n'
import Hint from './Hint'

interface Props {
  fishhealth: FishHealth
  localities: Localities | null
  /** Current week index into fishhealth.weeks. */
  week: number
  values: Map<number, number | null>
}

const ABOVE_COLOUR = '#c9531f'
const TREAT_COLOUR = '#2a78d6'
const SH = 44 // scrubber height (SVG units = px)
const SW = 1000 // scrubber width in SVG units

/** Scrubber for the lice-per-week layers: sparklines over the whole period, a cursor for the chosen week, ◀ ▶ and arrow keys. */
export default function LiceWeekSlider({ fishhealth, localities, week, values }: Props) {
  const t = useT()
  const lang = useLang()
  const n = fishhealth.weeks.length
  const set = (i: number) => updateSettings({ liceWeek: Math.min(n - 1, Math.max(0, i)) })
  const fylkeOf = useMemo(() => new Map(localities?.features.map((f) => [f.properties.loknr, f.properties.fylke]) ?? []), [localities])
  const shares = useMemo(() => weekShares(fishhealth, (nr) => fylkeOf.get(nr)), [fishhealth, fylkeOf])
  const label = fishhealth.weeks[week]
  const { year, week: wk } = parseWeek(label)
  const start = isoWeekStart(year, wk)
  const end = new Date(start.getTime() + 6 * 86400e3)
  const fmt = (d: Date) => d.toLocaleDateString(lang === 'nb' ? 'nb-NO' : 'en-GB', { day: '2-digit', month: 'short', timeZone: 'UTC' })
  const sum = summariseWeek(values, label, (nr) => fylkeOf.get(nr))
  const lim = limitsForWeek(label)
  const treatedNow = Math.round(shares.treated[week] * sum.reporting)
  const binLabel = (i: number) => (i === 0 ? `< ${LICE_BINS[0].max}` : i === LICE_BINS.length - 1 ? `≥ ${LICE_BINS[i - 1].max}` : `${LICE_BINS[i - 1].max}–${LICE_BINS[i].max}`)

  // Sparklines: shared y scale from the larger of the two series.
  const ymax = Math.max(0.05, ...shares.above, ...shares.treated)
  const x = (i: number) => (n > 1 ? (i / (n - 1)) * SW : 0)
  const y = (v: number) => SH - 2 - (v / ymax) * (SH - 6)
  const path = (vals: number[]) => vals.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ')
  const years = fishhealth.weeks.map((w, i) => (w.endsWith('-01') ? i : -1)).filter((i) => i >= 0)

  const svg = useRef<SVGSVGElement>(null)
  const dragging = useRef(false)
  const weekAt = (clientX: number) => {
    const r = svg.current!.getBoundingClientRect()
    return Math.round(((clientX - r.left) / r.width) * (n - 1))
  }
  const onKey = (e: React.KeyboardEvent) => {
    const step = e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1 : e.key === 'PageDown' ? -52 : e.key === 'PageUp' ? 52 : e.key === 'Home' ? -n : e.key === 'End' ? n : 0
    if (!step) return
    e.preventDefault()
    set(week + step)
  }

  return (
    <div className="lice-slider" role="group" aria-label={t('liceWeek.aria')}>
      <div className="lice-scrub-row">
        <button type="button" className="secondary" onClick={() => set(week - 1)} disabled={week <= 0} aria-label={t('liceWeek.prev')}>
          ◀
        </button>
        <svg
          ref={svg}
          className="lice-scrub"
          viewBox={`0 0 ${SW} ${SH}`}
          preserveAspectRatio="none"
          role="slider"
          tabIndex={0}
          aria-valuemin={0}
          aria-valuemax={n - 1}
          aria-valuenow={week}
          aria-valuetext={t('liceWeek.label', { year, week: wk })}
          aria-label={t('liceWeek.scrubAria')}
          onKeyDown={onKey}
          onPointerDown={(e) => {
            dragging.current = true
            e.currentTarget.setPointerCapture(e.pointerId)
            e.currentTarget.focus()
            set(weekAt(e.clientX))
          }}
          onPointerMove={(e) => dragging.current && set(weekAt(e.clientX))}
          onPointerUp={() => (dragging.current = false)}
          onPointerCancel={() => (dragging.current = false)}
        >
          {years.map((i) => (
            <line key={i} x1={x(i)} x2={x(i)} y1={0} y2={SH} className="lice-scrub-year" />
          ))}
          <path d={path(shares.above)} fill="none" stroke={ABOVE_COLOUR} strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
          <path d={path(shares.treated)} fill="none" stroke={TREAT_COLOUR} strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
          <line x1={x(week)} x2={x(week)} y1={0} y2={SH} className="lice-scrub-cursor" vectorEffect="non-scaling-stroke" />
        </svg>
        <button type="button" className="secondary" onClick={() => set(week + 1)} disabled={week >= n - 1} aria-label={t('liceWeek.next')}>
          ▶
        </button>
      </div>
      <div className="lice-readout">
        <span className="lice-readout-week">
          <Hint id="liceWeek" text={t('hint.liceWeek')}>
            <strong>{t('liceWeek.label', { year, week: String(wk).padStart(2, '0') })}</strong>
          </Hint>
        </span>
        <span className="lice-readout-dates muted">
          {fmt(start)} – {fmt(end)}
        </span>
        <span className="lice-readout-n muted">{t('liceWeek.reporting', { n: sum.reporting })}</span>
        <span className="lice-readout-n" style={{ color: ABOVE_COLOUR }}>
          {t('liceWeek.above', { m: sum.aboveLimit, p: sum.reporting ? Math.round((100 * sum.aboveLimit) / sum.reporting) : 0 })}
        </span>
        <span className="lice-readout-n" style={{ color: TREAT_COLOUR }}>
          {t('liceWeek.treated', { k: treatedNow, p: Math.round(100 * shares.treated[week]) })}
        </span>
        <span className="lice-readout-limit muted">{lim.south === lim.north ? t('liceWeek.limitOne', { l: lim.south }) : t('liceWeek.limitTwo', { s: lim.south, n: lim.north })}</span>
      </div>
      <div className="lice-key">
        {LICE_BINS.map((b, i) => (
          <span key={i} className="lice-bin">
            <i style={{ background: b.colour }} />
            <span className="lice-bin-label">{binLabel(i)}</span>
            <span className="lice-bin-count muted">{sum.bins[i]}</span>
          </span>
        ))}
        <span className="lice-bin">
          <i style={{ background: NOT_REPORTED_COLOUR }} />
          <span className="lice-bin-label">{t('liceWeek.notReported')}</span>
          <span className="lice-bin-count muted">{values.size - sum.reporting}</span>
        </span>
        <span className="lice-spark-key muted">
          <i style={{ background: ABOVE_COLOUR }} /> {t('liceWeek.sparkAbove')} <i style={{ background: TREAT_COLOUR }} /> {t('liceWeek.sparkTreat')} · {t('liceWeek.sparkMax', { p: Math.round(ymax * 100) })}
        </span>
      </div>
    </div>
  )
}
