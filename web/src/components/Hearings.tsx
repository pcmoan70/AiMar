import { isOpenHearing, type Hearing } from '../lib/localities'
import { useT } from '../lib/i18n'
import Hint from './Hint'

interface Props {
  items: Hearing[]
  /** Fly the map to a notice that has a position. */
  onLocate?: (h: Hearing) => void
  /** Leave out the heading (the panel already has one). */
  bare?: boolean
}

/** Public-inspection notices: what is applied for, where remarks go, and by when. */
export default function Hearings({ items, onLocate, bare }: Props) {
  const t = useT()
  if (!items.length) return null
  return (
    <div className="hearings">
      {!bare && <Hint id="hearings" text={t('hint.hearings')}>{t('hearings.title')}</Hint>}
      <ul className="plain">
        {items.map((h) => {
          const open = isOpenHearing(h)
          return (
            <li key={h.id} className={`hearing${open ? ' open' : ''}`}>
              <a href={h.url} target="_blank" rel="noreferrer">
                {h.subject || h.title}
              </a>
              <small className="muted">
                {[h.navn ? `${h.navn}${h.loknr ? ` (${h.loknr})` : ''}` : null, h.applicant || h.publisher, h.kommune ? t('hearings.at', { k: h.kommune }) : null, h.published ? t('hearings.published', { d: h.published }) : null]
                  .filter(Boolean)
                  .join(' · ')}
              </small>
              <small className={open ? 'hearing-deadline' : 'muted'}>
                {h.deadline ? t(open ? 'hearings.deadlineOpen' : 'hearings.deadlinePast', { d: h.deadline }) : t('hearings.noDeadline')}
                {h.doc ? (
                  <>
                    {' · '}
                    <a href={h.doc} target="_blank" rel="noreferrer">
                      {t('hearings.doc')} ↗
                    </a>
                  </>
                ) : null}
                {h.email && open ? (
                  <>
                    {' · '}
                    <a href={`mailto:${h.email}${h.caseNo ? `?subject=${encodeURIComponent(h.caseNo)}` : ''}`}>{t('hearings.remarks')}</a>
                  </>
                ) : null}
                {onLocate && h.coords ? (
                  <>
                    {' · '}
                    <button type="button" className="case-site" onClick={() => onLocate(h)}>
                      {t('hearings.locate')}
                    </button>
                  </>
                ) : null}
              </small>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
