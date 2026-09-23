import type { Hearing } from '../lib/localities'
import { useT } from '../lib/i18n'
import Hint from './Hint'

/** Public-inspection notices for a site or application: what is applied for, where remarks go, and by when. */
export default function Hearings({ items }: { items: Hearing[] }) {
  const t = useT()
  if (!items.length) return null
  const today = new Date().toISOString().slice(0, 10)
  return (
    <div className="hearings">
      <Hint id="hearings" text={t('hint.hearings')}>{t('hearings.title')}</Hint>
      <ul className="plain">
        {items.map((h) => {
          const open = !!h.deadline && h.deadline >= today
          return (
            <li key={h.id} className={`hearing${open ? ' open' : ''}`}>
              <a href={h.url} target="_blank" rel="noreferrer">
                {h.subject || h.title}
              </a>
              <small className="muted">
                {[h.applicant || h.publisher, h.kommune ? t('hearings.at', { k: h.kommune }) : null, h.published ? t('hearings.published', { d: h.published }) : null].filter(Boolean).join(' · ')}
              </small>
              <small className={open ? 'hearing-deadline' : 'muted'}>
                {h.deadline ? t(open ? 'hearings.deadlineOpen' : 'hearings.deadlinePast', { d: h.deadline }) : t('hearings.noDeadline')}
                {h.email && open ? (
                  <>
                    {' · '}
                    <a href={`mailto:${h.email}${h.caseNo ? `?subject=${encodeURIComponent(h.caseNo)}` : ''}`}>{t('hearings.remarks')}</a>
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
