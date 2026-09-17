import { useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react'
import { CASE_KINDS, CASE_SORTS, caseFolderUrl, caseRows, caseUrl, groupRows, searchHaystack, searchRows, sortRows, type CaseKind, type CaseRow, type CaseSort, type Cases } from '../lib/cases'
import type { Localities } from '../lib/localities'
import { useT } from '../lib/i18n'
import Hint from './Hint'
import CaseDocs, { CaseDocsDot } from './CaseDocs'

interface Props {
  cases: Cases | null
  /** true when the case snapshot could not be loaded, as opposed to still loading */
  casesFailed: boolean
  localities: Localities | null
  /** Localities passing the map filters; null = no filter (all). */
  loknrs: number[] | null
  onPick: (loknr: number) => void
  /** Localities covered by the filtered list, for the rings on the map. */
  onSites: (loknrs: number[] | null) => void
}

const PAGE = 200

/** All case-history entries for the filtered localities with search, kind filter and sorting. */
export default function CasesPanel({ cases, casesFailed, localities, loknrs, onPick, onSites }: Props) {
  const t = useT()
  const [query, setQuery] = useState('')
  // 134 000 entries are too many to re-filter on every keystroke, so the list trails the input.
  const deferredQuery = useDeferredValue(query)
  const [sort, setSort] = useState<CaseSort>('date')
  const [desc, setDesc] = useState(true)
  const [kinds, setKinds] = useState<Set<CaseKind>>(() => new Set(CASE_KINDS))
  const [shown, setShown] = useState(PAGE)
  const [grouped, setGrouped] = useState(true)
  const [onlyText, setOnlyText] = useState(false)

  const names = useMemo(() => new Map(localities?.features.map((f) => [f.properties.loknr, f.properties.navn]) ?? []), [localities])
  const siteName = (nr: number) => names.get(nr) ?? String(nr)
  const all = useMemo(() => (cases ? caseRows(cases, loknrs) : []), [cases, loknrs])
  const counts = useMemo(() => {
    const c = new Map<CaseKind, number>()
    for (const r of all) c.set(r.kind, (c.get(r.kind) ?? 0) + 1)
    return c
  }, [all])
  const caseTitle = (sak: string) => cases?.cases?.[sak]?.title ?? ''
  const hasText = (id: string) => !!cases?.docs?.[id]?.some((d) => d.text)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const textCount = useMemo(() => all.filter((r) => hasText(r.entry.id)).length, [all, cases])
  // The filter counts journal entries; one entry can carry dozens of documents, so name both.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const textDocs = useMemo(() => all.reduce((n, r) => n + (cases?.docs?.[r.entry.id]?.filter((d) => d.text).length ?? 0), 0), [all, cases])
  // Built once per data change, not per keystroke; siteName and caseTitle follow names and cases.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const hays = useMemo(() => searchHaystack(all, siteName, caseTitle), [all, names, cases])
  const rows = useMemo(
    () => sortRows(searchRows(all, deferredQuery, siteName, caseTitle, hays).filter((r) => kinds.has(r.kind) && (!onlyText || hasText(r.entry.id))), sort, desc, siteName),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [all, deferredQuery, hays, kinds, sort, desc, names, onlyText, cases],
  )
  const siteCount = loknrs ? loknrs.length : (localities?.features.length ?? 0)
  // Ring the localities of the rows currently listed; clear the rings when the panel closes.
  const shownSites = useMemo(() => [...new Set(rows.flatMap((r) => r.loknrs))].sort((a, b) => a - b), [rows])
  const report = useCallback(onSites, [onSites])
  useEffect(() => {
    report(shownSites)
    return () => report(null)
  }, [shownSites, report])

  const toggleKind = (k: CaseKind) => {
    const next = new Set(kinds)
    if (next.has(k) && next.size > 1) next.delete(k)
    else next.add(k)
    setKinds(next)
    setShown(PAGE)
  }

  const groups = useMemo(() => (grouped ? groupRows(rows.slice(0, shown), cases?.cases) : []), [grouped, rows, shown, cases])

  const renderRow = (r: CaseRow) => (
    <li key={r.entry.id} className={`case case-${r.kind}`}>
      <span className="case-date">{r.entry.date ?? '–'}</span>
      <span className="case-kind">{t(`case.${r.kind}`)}</span>
      <CaseDocsDot docs={cases?.docs?.[r.entry.id]} />
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
      <CaseDocs entry={r.entry} docs={cases?.docs?.[r.entry.id]} />
    </li>
  )

  if (!cases) return <div className="panel-body">{t(casesFailed ? 'cases.failed' : 'cases.loading')}</div>
  return (
    <div className="panel-body cases-panel">
      <h2>
        <Hint id="casesPanel" text={t('hint.casesPanel')}>{t('cases.title')}</Hint>
      </h2>
      <p className="muted">{t(loknrs ? 'cases.countFiltered' : 'cases.countAll', { n: all.length, m: siteCount })}</p>
      <p className="muted cases-sites">
        <span className="case-site-key" /> {t('cases.onMap', { n: shownSites.length })}
      </p>
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
        {cases.cases && (
          <label>
            <input type="checkbox" checked={grouped} onChange={(e) => setGrouped(e.target.checked)} /> {t('cases.group')}
          </label>
        )}
        <label title={t('cases.onlyTextTitle', { n: textCount, d: textDocs })}>
          <input
            type="checkbox"
            checked={onlyText}
            onChange={(e) => {
              setOnlyText(e.target.checked)
              setShown(PAGE)
            }}
          />{' '}
          {t('cases.onlyText', { n: textCount })}
        </label>
      </div>
      <div className="case-kinds">
        {CASE_KINDS.map((k) => (
          <button key={k} type="button" className={`chip case-${k}${kinds.has(k) ? ' active' : ''}`} onClick={() => toggleKind(k)}>
            {t(`case.${k}`)} <span className="muted">{counts.get(k) ?? 0}</span>
          </button>
        ))}
      </div>
      {rows.length && grouped && cases.cases ? (
        <div className="case-groups">
          {groups.map((g) => (
            <section key={g.sak ?? 'none'} className="case-group">
              <h4>
                {g.sak ? (
                  <a href={caseFolderUrl(g.sak)} target="_blank" rel="noreferrer">
                    {g.nr && <span className="case-nr">{g.nr}</span>} {g.title || t('cases.untitledCase')}
                  </a>
                ) : (
                  t('cases.noCase')
                )}
                <span className="muted"> · {g.rows.length}</span>
              </h4>
              <ul className="cases">{g.rows.map(renderRow)}</ul>
            </section>
          ))}
        </div>
      ) : rows.length ? (
        <ul className="cases">{rows.slice(0, shown).map(renderRow)}</ul>
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
