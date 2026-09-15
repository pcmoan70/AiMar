import { useMemo, useRef } from 'react'
import { limitsForWeek, type FishHealth } from '../lib/fishhealth'
import type { Localities } from '../lib/localities'
import { isoWeekStart, LICE_BINS, NOT_REPORTED_COLOUR, parseWeek, SEASON_WEEKS, seasonShares, summariseWeek, weekShares, WEEK_HEAT_MODES } from '../lib/liceWeek'
import { updateSettings, useSettings } from '../lib/settings'
import { useT, useLang } from '../lib/i18n'
import Hint from './Hint'

interface Props {
  fishhealth: FishHealth
  localities: Localities | null
  /** Current week index into fishhealth.weeks (timeline axis). */
  week: number
  values: Map<number, number | null>
}

const ABOVE_COLOUR = '#c9531f'
const TREAT_COLOUR = '#2a78d6'
const SPIKE_COLOUR = { lice: '#7f2c0c', treatment: '#14407a' }
const SH = 44 // scrubber height (SVG units = px)
const SW = 1000 // scrubber width in SVG units

/**
 * Scrubber for the weekly lice layers. Two axes: every week since 2012, or the average per ISO week
 * number over all years, where the last year is drawn on top as spikes. ◀ ▶, click/drag and arrow keys.
 */
export default function LiceWeekSlider({ fishhealth, localities, week, values }: Props) {
  const t = useT()
  const lang = useLang()
  const s = useSettings()
  const season = s.weekAxis === 'season'
  const fylkeOf = useMemo(() => new Map(localities?.features.map((f) => [f.properties.loknr, f.properties.fylke]) ?? []), [localities])
  const shares = useMemo(() => weekShares(fishhealth, (nr) => fylkeOf.get(nr)), [fishhealth, fylkeOf])
  const sea = useMemo(() => seasonShares(fishhealth.weeks, shares), [fishhealth.weeks, shares])

  const seasonWeek = Math.min(SEASON_WEEKS, Math.max(1, s.seasonWeek))
  const n = season ? SEASON_WEEKS : fishhealth.weeks.length
  const cursor = season ? seasonWeek - 1 : week
  const set = (i: number) => {
    const c = Math.min(n - 1, Math.max(0, i))
    updateSettings(season ? { seasonWeek: c + 1 } : { liceWeek: c })
  }

  // Labels and the week's summary, for whichever axis is in use.
  const lastYear = Number(fishhealth.weeks[fishhealth.weeks.length - 1].slice(0, 4))
  const label = season ? `${lastYear}-${String(seasonWeek).padStart(2, '0')}` : fishhealth.weeks[week]
  const { year, week: wk } = parseWeek(label)
  const start = isoWeekStart(year, wk)
  const end = new Date(start.getTime() + 6 * 86400e3)
  const fmt = (d: Date) => d.toLocaleDateString(lang === 'nb' ? 'nb-NO' : 'en-GB', { day: '2-digit', month: 'short', timeZone: 'UTC' })
  const sum = summariseWeek(values, label, (nr) => fylkeOf.get(nr))
  const lim = limitsForWeek(label)
  const treatShare = season ? sea.treated[cursor] : shares.treated[week]
  const treatedNow = Math.round(treatShare * sum.reporting)

  // Sparklines: the two shares on a shared scale, plus the last year as spikes in season mode.
  const above = season ? sea.above : shares.above
  const treated = season ? sea.treated : shares.treated
  const spikes = season ? (s.weekHeatMode === 'treatment' ? sea.lastTreated : sea.lastAbove) : null
  const ymax = Math.max(0.05, ...above, ...treated, ...(spikes?.map((v) => v ?? 0) ?? []))
  const x = (i: number) => (n > 1 ? (i / (n - 1)) * SW : 0)
  const y = (v: number) => SH - 2 - (v / ymax) * (SH - 6)
  const path = (vals: number[]) => vals.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ')
  const spikePath = (vals: (number | null)[]) =>
    vals.map((v, i) => (v == null ? '' : `M${x(i).toFixed(1)} ${y(0).toFixed(1)} L${x(i).toFixed(1)} ${y(v).toFixed(1)}`)).join(' ')
  // Timeline: a line per year. Season: quarter marks. Both: a band over the spring-limit weeks 16–26
  // (0.2 applies in 16–21 from Trøndelag south and in 21–26 from Nordland north).
  const marks = season ? [0, 13, 26, 39] : fishhealth.weeks.map((w, i) => (w.endsWith('-01') ? i : -1)).filter((i) => i >= 0)
  const springBands: [number, number][] = useMemo(() => {
    if (season) return [[15, 25]]
    const out: [number, number][] = []
    fishhealth.weeks.forEach((w, i) => {
      const num = Number(w.slice(5))
      if (num < 16 || num > 26) return
      const last = out[out.length - 1]
      if (last && last[1] === i - 1) last[1] = i
      else out.push([i, i])
    })
    return out
  }, [season, fishhealth.weeks])

  const svg = useRef<SVGSVGElement>(null)
  const dragging = useRef(false)
  const weekAt = (clientX: number) => {
    const r = svg.current!.getBoundingClientRect()
    return Math.round(((clientX - r.left) / r.width) * (n - 1))
  }
  const onKey = (e: React.KeyboardEvent) => {
    const big = season ? 4 : 52
    const step = e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1 : e.key === 'PageDown' ? -big : e.key === 'PageUp' ? big : e.key === 'Home' ? -n : e.key === 'End' ? n : 0
    if (!step) return
    e.preventDefault()
    set(cursor + step)
  }

  const binLabel = (i: number) => (i === 0 ? `< ${LICE_BINS[0].max}` : i === LICE_BINS.length - 1 ? `≥ ${LICE_BINS[i - 1].max}` : `${LICE_BINS[i - 1].max}–${LICE_BINS[i].max}`)

  return (
    <div className="lice-slider" role="group" aria-label={t('liceWeek.aria')}>
      <div className="lice-scrub-row">
        <button type="button" className="secondary" onClick={() => set(cursor - 1)} disabled={cursor <= 0} aria-label={t('liceWeek.prev')}>
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
          aria-valuenow={cursor}
          aria-valuetext={season ? t('liceWeek.weekOf', { week: wk }) : t('liceWeek.label', { year, week: wk })}
          aria-label={t(season ? 'liceWeek.scrubSeasonAria' : 'liceWeek.scrubAria')}
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
          {springBands.map(([a, b]) => (
            <rect key={a} x={x(a)} width={Math.max(x(b) - x(a), 1)} y={0} height={SH} className="lice-scrub-spring" />
          ))}
          {marks.map((i) => (
            <line key={i} x1={x(i)} x2={x(i)} y1={0} y2={SH} className="lice-scrub-year" />
          ))}
          {spikes && <path d={spikePath(spikes)} fill="none" stroke={SPIKE_COLOUR[s.weekHeatMode]} strokeWidth={1} vectorEffect="non-scaling-stroke" opacity={0.75} />}
          <path d={path(above)} fill="none" stroke={ABOVE_COLOUR} strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
          <path d={path(treated)} fill="none" stroke={TREAT_COLOUR} strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
          <line x1={x(cursor)} x2={x(cursor)} y1={0} y2={SH} className="lice-scrub-cursor" vectorEffect="non-scaling-stroke" />
        </svg>
        <button type="button" className="secondary" onClick={() => set(cursor + 1)} disabled={cursor >= n - 1} aria-label={t('liceWeek.next')}>
          ▶
        </button>
        <span className="lice-mode" role="group" aria-label={t('liceWeek.axis')}>
          {(['timeline', 'season'] as const).map((a) => (
            <button
              key={a}
              type="button"
              className={`secondary${s.weekAxis === a ? ' active' : ''}`}
              aria-pressed={s.weekAxis === a}
              title={t(`liceWeek.axis.${a}.title`)}
              onClick={() => updateSettings({ weekAxis: a })}
            >
              {t(`liceWeek.axis.${a}`)}
            </button>
          ))}
        </span>
        {(season || s.overlays.includes('lice-heat')) && (
          <span className="lice-mode" role="group" aria-label={t('weekHeat.mode')}>
            {WEEK_HEAT_MODES.map((m) => (
              <button
                key={m}
                type="button"
                className={`secondary${s.weekHeatMode === m ? ' active' : ''}`}
                aria-pressed={s.weekHeatMode === m}
                title={t(`weekHeat.title.${m}`)}
                onClick={() => updateSettings({ weekHeatMode: m })}
              >
                {t(`weekHeat.short.${m}`)}
              </button>
            ))}
          </span>
        )}
      </div>
      <div className="lice-readout">
        <span className="lice-readout-week">
          <Hint id="liceWeek" text={t(season ? 'hint.seasonWeek' : 'hint.liceWeek')}>
            <strong>{season ? t('liceWeek.weekOf', { week: String(wk).padStart(2, '0') }) : t('liceWeek.label', { year, week: String(wk).padStart(2, '0') })}</strong>
          </Hint>
        </span>
        <span className="lice-readout-dates muted">
          {season ? '≈ ' : ''}
          {fmt(start)} – {fmt(end)}
        </span>
        <span className="lice-readout-n muted">{t(season ? 'liceWeek.reportingMean' : 'liceWeek.reporting', { n: sum.reporting })}</span>
        <span className="lice-readout-n" style={{ color: ABOVE_COLOUR }}>
          {t('liceWeek.above', { m: sum.aboveLimit, p: sum.reporting ? Math.round((100 * sum.aboveLimit) / sum.reporting) : 0 })}
        </span>
        <span className="lice-readout-n" style={{ color: TREAT_COLOUR }}>
          {t('liceWeek.treated', { k: treatedNow, p: Math.round(100 * treatShare) })}
        </span>
        <span className="lice-readout-limit muted">
          {season ? `${t('liceWeek.years', { a: sea.years[0], b: sea.years[1] })} · ` : ''}
          {lim.south === lim.north ? t('liceWeek.limitOne', { l: lim.south }) : t('liceWeek.limitTwo', { s: lim.south, n: lim.north })}
        </span>
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
          <i className="spring-key" /> {t('liceWeek.springKey')} <i style={{ background: ABOVE_COLOUR }} /> {t('liceWeek.sparkAbove')} <i style={{ background: TREAT_COLOUR }} /> {t('liceWeek.sparkTreat')}
          {spikes && (
            <>
              {' '}
              <i style={{ background: SPIKE_COLOUR[s.weekHeatMode] }} /> {t('liceWeek.sparkLast', { year: lastYear })}
            </>
          )}{' '}
          · {t('liceWeek.sparkMax', { p: Math.round(ymax * 100) })}
        </span>
      </div>
    </div>
  )
}
