import { docUrl, type CaseDoc } from '../lib/cases'
import { numberLocale, useT } from '../lib/i18n'

/** Documents published on eInnsyn for one journal entry: link to the file and the first lines of its text. */
export default function CaseDocs({ docs }: { docs?: CaseDoc[] }) {
  const t = useT()
  if (!docs?.length) return null
  return (
    <>
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
    </>
  )
}
