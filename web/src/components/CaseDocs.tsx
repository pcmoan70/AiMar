import { useEffect, useRef } from 'react'
import { docUrl, type CaseDoc } from '../lib/cases'
import { numberLocale, useT } from '../lib/i18n'

/** Marker on entries whose documents are published here; it pulses while those documents are in view. */
export function CaseDocsDot({ docs }: { docs?: CaseDoc[] }) {
  const t = useT()
  if (!docs?.length) return null
  const label = t(docs.length === 1 ? 'case.hasDoc' : 'case.hasDocs', { n: docs.length })
  return <span className="case-dot" role="img" title={label} aria-label={label} />
}

/** Documents published on eInnsyn for one journal entry: link to the file and the first lines of its text. */
export default function CaseDocs({ docs }: { docs?: CaseDoc[] }) {
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

  if (!docs?.length) return null
  return (
    <div className="case-docs" ref={wrap}>
      {docs.map((d) => (
        <div key={d.id} className="case-doc">
          <a href={docUrl(d)} target="_blank" rel="noreferrer">
            {d.format || t('case.document')} · {d.title || t('case.document')} · {(d.bytes / 1024).toLocaleString(numberLocale(), { maximumFractionDigits: 0 })} kB
          </a>
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
