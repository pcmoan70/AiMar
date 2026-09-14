import { useMemo, useState } from 'react'
import { CASE_KINDS, CASE_SORTS, caseRows, caseUrl, searchRows, sortRows, type CaseKind, type CaseSort, type Cases } from '../lib/cases'
import type { Localities } from '../lib/localities'
import { useT } from '../lib/i18n'
import Hint from './Hint'

interface Props {
  cases: Cases | null
  localities: Localities | null
  /** Localities passing the map filters; null = no filter (all). */
  loknrs: number[] | null
  onPick: (loknr: number) => void
}

const PAGE = 200

/** All case-history entries for the filtered localities with search, kind filter and sorting. */
export default function CasesPanel({ cases, localities, loknrs, onPick }: Props) {
  const t = useT()
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<CaseSort>('date')
  const [desc, setDesc] = useState(true)
  const [kinds, setKinds] = useState<Set<CaseKind>>(() => new Set(CASE_KINDS))
  const [shown, setShown] = useState(PAGE)

  const names = useMemo(() => new Map(localities?.features.map((f) => [f.properties.loknr, f.properties.navn]) ?? []), [localities])
  const siteName = (nr: number) => names.get(nr) ?? String(nr)
  const all = useMemo(() => (cases ? caseRows(cases, loknrs) : []), [cases, loknrs])
  const counts = useMemo(() => {
    const c = new Map<CaseKind, number>()
    for (const r of all) c.set(r.kind, (c.get(r.kind) ?? 0) + 1)
    return c
  }, [all])
  const rows = useMemo(
    () => sortRows(searchRows(all, query, siteName).filter((r) => kinds.has(r.kind)), sort, desc, siteName),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [all, query, kinds, sort, desc, names],
  )
  const siteCount = loknrs ? loknrs.length : (localities?.features.length ?? 0)

  const toggleKind = (k: CaseKind) => {
    const next = new Set(kinds)
    if (next.has(k) && next.size > 1) next.delete(k)
    else next.add(k)
    setKinds(next)
    setShown(PAGE)
  }

  if (!cases) return <div className="panel-body">{t('cases.notLoaded')}</div>
  return (
    <div className="panel-body cases-panel">
      <h2>
        <Hint text={t('hint.casesPanel')}>{t('cases.title')}</Hint>
      </h2>
      <p className="muted">{t(loknrs ? 'cases.countFiltered' : 'cases.countAll', { n: all.length, m: siteCount })}</p>
      <input
        type="search"
        placeholder={t('cases.search')}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value)
          setShown(PAGE)
        }}
      />
      <div className="cases-controls">
        <label>
          {t('cases.sort')}
          <select value={sort} onChange={(e) => setSort(e.target.value as CaseSort)}>
            {CASE_SORTS.map((k) => (
              <option key={k} value={k}>
                {t(`cases.sort.${k}`)}
              </option>
            ))}
          </select>
        </label>
        <button type="button" className="secondary" onClick={() => setDesc(!desc)} title={t(desc ? 'cases.desc' : 'cases.asc')}>
          {desc ? '↓' : '↑'} {t(desc ? 'cases.desc' : 'cases.asc')}
        </button>
      </div>
      <div className="case-kinds">
        {CASE_KINDS.map((k) => (
          <button key={k} type="button" className={`chip case-${k}${kinds.has(k) ? ' active' : ''}`} onClick={() => toggleKind(k)}>
            {t(`case.${k}`)} <span className="muted">{counts.get(k) ?? 0}</span>
          </button>
        ))}
      </div>
      {rows.length ? (
        <ul className="cases">
          {rows.slice(0, shown).map((r) => (
            <li key={r.entry.id} className={`case case-${r.kind}`}>
              <span className="case-date">{r.entry.date ?? '–'}</span>
              <span className="case-kind">{t(`case.${r.kind}`)}</span>
              <a href={caseUrl(r.entry)} target="_blank" rel="noreferrer" className="case-title">
                {r.entry.title}
              </a>
              <small className="muted">
                {r.loknrs.map((nr, i) => (
                  <span key={nr}>
                    {i > 0 && ', '}
                    <button type="button" className="case-site" onClick={() => onPick(nr)}>
                      {siteName(nr)}
                    </button>
                  </span>
                ))}
                {' · '}
                {r.entry.entity} · {t(`case.${r.entry.type ?? 'internal'}`)}
              </small>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted">{t('cases.none')}</p>
      )}
      {rows.length > shown && (
        <button type="button" className="secondary" onClick={() => setShown(shown + PAGE)}>
          {t('cases.more', { n: rows.length - shown })}
        </button>
      )}
      <p className="muted">{t('inspect.sourceCases', { date: cases.retrieved.slice(0, 10) })}</p>
    </div>
  )
}
