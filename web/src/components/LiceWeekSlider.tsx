import { limitsForWeek, type FishHealth } from '../lib/fishhealth'
import type { Localities } from '../lib/localities'
import { isoWeekStart, LICE_BINS, NOT_REPORTED_COLOUR, parseWeek, summariseWeek } from '../lib/liceWeek'
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

/** Year/week slider for the lice-per-week layers, with the week's summary and colour key. */
export default function LiceWeekSlider({ fishhealth, localities, week, values }: Props) {
  const t = useT()
  const lang = useLang()
  const n = fishhealth.weeks.length
  const set = (i: number) => updateSettings({ liceWeek: Math.min(n - 1, Math.max(0, i)) })
  const { year, week: wk } = parseWeek(fishhealth.weeks[week])
  const start = isoWeekStart(year, wk)
  const end = new Date(start.getTime() + 6 * 86400e3)
  const fmt = (d: Date) => d.toLocaleDateString(lang === 'nb' ? 'nb-NO' : 'en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })
  const fylkeOf = new Map(localities?.features.map((f) => [f.properties.loknr, f.properties.fylke]) ?? [])
  const label = fishhealth.weeks[week]
  const sum = summariseWeek(values, label, (nr) => fylkeOf.get(nr))
  const lim = limitsForWeek(label)
  const binLabel = (i: number) => (i === 0 ? `< ${LICE_BINS[0].max}` : i === LICE_BINS.length - 1 ? `≥ ${LICE_BINS[i - 1].max}` : `${LICE_BINS[i - 1].max}–${LICE_BINS[i].max}`)
  return (
    <div className="lice-slider" role="group" aria-label={t('liceWeek.aria')}>
      <div className="lice-slider-row">
        <button type="button" className="secondary" onClick={() => set(week - 1)} disabled={week <= 0} aria-label={t('liceWeek.prev')}>
          ◀
        </button>
        <input type="range" min={0} max={n - 1} value={week} onChange={(e) => set(Number(e.target.value))} aria-label={t('liceWeek.aria')} />
        <button type="button" className="secondary" onClick={() => set(week + 1)} disabled={week >= n - 1} aria-label={t('liceWeek.next')}>
          ▶
        </button>
        <span className="lice-week-label">
          <Hint id="liceWeek" text={t('hint.liceWeek')}>
            <strong>{t('liceWeek.label', { year, week: wk })}</strong>
          </Hint>
          <small className="muted">
            {fmt(start)} – {fmt(end)} · {t('liceWeek.summary', { n: sum.reporting, m: sum.aboveLimit })} · {lim.south === lim.north ? t('liceWeek.limitOne', { l: lim.south }) : t('liceWeek.limitTwo', { s: lim.south, n: lim.north })}
          </small>
        </span>
      </div>
      <div className="lice-key">
        {LICE_BINS.map((b, i) => (
          <span key={i}>
            <i style={{ background: b.colour }} /> {binLabel(i)} <small className="muted">{sum.bins[i]}</small>
          </span>
        ))}
        <span>
          <i style={{ background: NOT_REPORTED_COLOUR }} /> {t('liceWeek.notReported')}
        </span>
      </div>
    </div>
  )
}
