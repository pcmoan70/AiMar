import { useEffect, useRef } from 'react'
import { caseUrl, docUrl, mainText, textUrl, type CaseDoc, type CaseEntry } from '../lib/cases'
import { numberLocale, useT } from '../lib/i18n'

/** Marker on entries whose documents are published here; it pulses while those documents are in view. */
export function CaseDocsDot({ docs }: { docs?: CaseDoc[] }) {
  const t = useT()
  if (!docs?.length) return null
  const label = t(docs.length === 1 ? 'case.hasDoc' : 'case.hasDocs', { n: docs.length })
  const text = mainText(docs)
  return (
    <span className="case-marks">
      <span className="case-dot" role="img" title={label} aria-label={label} />
      {text && (
        // Opens the extracted text instead of the entry on eInnsyn.
        <a className="case-textlink" href={textUrl(text)} target="_blank" rel="noreferrer" title={t('case.openText')} aria-label={t('case.openText')}>
          <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true">
            <path d="M3.5 1.5h6l3 3v10h-9z" fill="#fff" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
            <path d="M9.5 1.5v3h3M5.5 7h5M5.5 9.5h5M5.5 12h3" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
          </svg>
        </a>
      )}
    </span>
  )
}

/** Documents published on eInnsyn for one journal entry: link to the file and the first lines of its text. */
export default function CaseDocs({ entry, docs }: { entry: CaseEntry; docs?: CaseDoc[] }) {
  const t = useT()
  const wrap = useRef<HTMLDivElement>(null)

  // The row's dot pulses only while these documents are actually on screen.
  useEffect(() => {
    const el = wrap.current
    const row = el?.closest('li')
    if (!el || !row || typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver(([e]) => row.classList.toggle('docs-in-view', e.isIntersecting), { threshold: 0.25 })
    io.observe(el)
    return () => {
      io.disconnect()
      row.classList.remove('docs-in-view')
    }
  }, [docs])

  // Most entries are metadata only: say so, and point at eInnsyn where the file can be requested.
  if (!docs?.length)
    return (
      <p className="case-nodoc muted">
        {t('case.noFile')}{' '}
        <a href={caseUrl(entry)} target="_blank" rel="noreferrer">
          {t('case.orderAccess')} ↗
        </a>
      </p>
    )
  return (
    <div className="case-docs" ref={wrap}>
      {docs.map((d) => (
        <div key={d.id} className="case-doc">
          <a href={docUrl(d)} target="_blank" rel="noreferrer">
            {d.role === 'attachment' ? t('case.attachment') : d.role === 'main' ? t('case.mainDoc') : d.format || t('case.document')} · {d.title || t('case.document')} ·{' '}
            {(d.bytes / 1024).toLocaleString(numberLocale(), { maximumFractionDigits: 0 })} kB {d.format ? `· ${d.format}` : ''}
          </a>
          {d.text && (
            <>
              {' '}
              <a className="case-textlink" href={textUrl(d)} target="_blank" rel="noreferrer" title={t('case.openText')}>
                {t('case.textLabel')}
              </a>
            </>
          )}
          {d.excerpt && (
            <p className="case-excerpt">
              {d.excerpt}…{d.method === 'ocr' || d.method === 'mixed' ? <span className="case-ocr" title={t('case.ocrTitle')}> {t('case.ocr')}</span> : null}
            </p>
          )}
        </div>
      ))}
    </div>
  )
}
