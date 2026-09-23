import { useState, type ReactNode } from 'react'
import type { Map as MlMap } from 'maplibre-gl'
import SiteOverlays from './SiteOverlays'
import { hearingsFor, hearingsForApplication, isNewApplication, isOpenHearing, type Hearing } from '../lib/localities'
import Hearings from './Hearings'
import Sym from './Sym'
import { neighbourhood, type Localities } from '../lib/localities'
import { licePressure, liceSeries, liceStatsIndex, operatorPressureSeries, summarise, type FishHealth } from '../lib/fishhealth'
import type { ApplicationProps } from '../lib/localities'
import { caseFolderUrl, caseKind, caseRows, caseUrl, casesFor, groupRows, type CaseEntry, type Cases } from '../lib/cases'
import { ALL_FARMS_COLOUR, paletteFor } from '../lib/operatorColours'
import { updateSettings, useSettings } from '../lib/settings'
import { activeFilterKeys, fieldValuesOf, valueLabel, type FieldFilters, type FilterKey, type FilterValue } from '../lib/filters'
import { numberLocale, useT } from '../lib/i18n'
import type { HintKey } from '../lib/hints'
import LiceChart from './LiceChart'
import Hint from './Hint'
import CaseDocs, { CaseDocsDot } from './CaseDocs'
import { tempSeries, type SeaTemp, type Tides } from '../lib/siteData'
import FieldPicker from './FieldPicker'
import type { Selection } from './MapView'

interface Props {
  selection: Selection | null
  localities: Localities | null
  fishhealth: FishHealth | null
  cases: Cases | null
  /** true when the case snapshot could not be loaded, as opposed to still loading */
  casesFailed: boolean
  seatemp: SeaTemp | null
  tides: Tides | null
  applications: ApplicationProps[] | null
  hearings: Hearing[] | null
  onSelectApplication: (props: ApplicationProps) => void
  map: MlMap | null
}

const fmtDate = (ms: number | null) => (ms ? new Date(ms).toISOString().slice(0, 10) : '–')
const fmt = (n: number) => n.toLocaleString(numberLocale(), { maximumFractionDigits: 0 })

export default function InspectPanel({ selection, localities, fishhealth, cases, casesFailed, seatemp, tides, applications, hearings, onSelectApplication, map }: Props) {
  const t = useT()
  const { operatorFilter, fieldFilters, casesOnlyText: onlyText, casesGrouped: groupCases } = useSettings()
  const [picker, setPicker] = useState<{ key: FilterKey; anchor: DOMRect } | null>(null)
  const fmtNum = (n: number) => n.toLocaleString(numberLocale(), { maximumFractionDigits: 0 })
  if (!selection) return <div className="panel-body muted">{t('inspect.empty')}</div>

  if (selection.type === 'farm') {
    const p = selection.props
    const rows: [string, string, HintKey, FilterKey | null][] = [
      [t('inspect.loknr'), String(p.loknr), 'loknr', null],
      [t('inspect.status'), p.status_lokalitet, 'status', 'status'],
      [t('inspect.capacity'), p.kapasitet_lok != null ? `${fmtNum(p.kapasitet_lok)} ${p.kapasitet_unittype ?? ''}` : '–', 'capacity', 'capacity'],
      [t('inspect.species'), p.til_arter ?? '–', 'species', 'species'],
      [t('inspect.operators'), p.til_innehavere ?? '–', 'operators', null],
      [t('inspect.purpose'), p.til_formaal ?? '–', 'purpose', 'purpose'],
      [t('inspect.productionForm'), p.til_produksjonsform ?? '–', 'productionForm', 'productionForm'],
      [t('inspect.placement'), `${p.plassering} · ${p.vannmiljo}`, 'placement', 'placement'],
      [t('inspect.municipality'), `${p.kommune}, ${p.fylke}`, 'municipality', 'municipality'],
      [t('inspect.prodArea'), p.prodareacode ?? '–', 'prodArea', 'prodArea'],
      [t('inspect.clearance'), fmtDate(p.klareringsdato), 'clearance', null],
    ]
    const clearFilter = (key: FilterKey) => updateSettings({ fieldFilters: { ...fieldFilters, [key]: undefined } })
    const setFilters = (next: FieldFilters) => updateSettings({ fieldFilters: next })
    const active = new Set(activeFilterKeys(fieldFilters))
    const stats = fishhealth ? liceStatsIndex(fishhealth, localities) : undefined
    const series = fishhealth ? liceSeries(fishhealth, p.loknr, p.fylke) : null
    const sum = series ? summarise(series) : null
    const my = stats?.get(p.loknr)
    const liceRows: [string, string, HintKey, FilterKey][] = my
      ? [
          [t('inspect.liceMean'), my.mean.toFixed(2), 'liceMean', 'liceMean'],
          [t('inspect.liceMax'), my.max.toFixed(2), 'liceMax', 'liceMax'],
          [t('inspect.liceAbove'), String(my.weeksAbove), 'liceAbove', 'liceAbove'],
          [t('inspect.liceTreat'), String(my.treatments), 'liceTreat', 'liceTreat'],
        ]
      : []
    const fieldRow = ([k, v, h, fk]: [string, string, HintKey, FilterKey | null]) => {
      const isActive = fk !== null && active.has(fk)
      const filterable = fk !== null && localities !== null
      const sel = fk ? ((fieldFilters[fk] as FilterValue[] | undefined) ?? []) : []
      return (
        <tr key={h} className={isActive ? 'filtered' : ''}>
          <th>
            <Hint id={h} text={t(`hint.${h}`)}>{k}</Hint>
          </th>
          <td>
            {filterable ? (
              <button
                type="button"
                className="field-filter"
                title={t('filter.choose', { f: k.toLowerCase() })}
                onClick={(e) => setPicker({ key: fk!, anchor: e.currentTarget.getBoundingClientRect() })}
              >
                {v}
                {isActive && <small className="filter-note">{t('filter.note', { v: sel.map((x) => valueLabel(fk!, x)).join(', ') })}</small>}
              </button>
            ) : (
              v
            )}
            {isActive && (
              <button type="button" className="field-clear" title={t('filter.clearField')} aria-label={t('filter.clearFieldAria', { f: k })} onClick={() => clearFilter(fk!)}>
                ✕
              </button>
            )}
          </td>
        </tr>
      )
    }
    const site = localities?.features.find((f) => f.properties.loknr === p.loknr)
    const at = site?.geometry.coordinates as [number, number] | undefined
    const extras =
      fishhealth && localities && at
        ? operatorFilter.length
          ? operatorFilter.slice(0, 8).map((op) => {
              const s = operatorPressureSeries(fishhealth, localities, op, at, p.loknr)
              return { name: t('inspect.opFarms', { op, n: s.farms }), values: s.values, colour: paletteFor(operatorFilter).get(op)! }
            })
          : [(() => {
              const s = operatorPressureSeries(fishhealth, localities, undefined, at, p.loknr)
              return { name: t('inspect.allFarms', { n: s.farms }), values: s.values, colour: ALL_FARMS_COLOUR }
            })()]
        : []
    return (
      <div className="panel-body">
        <h2>
          {p.navn}
          {p.status_lokalitet === 'TRUKKET' && <span className="badge-deleted">{t('inspect.withdrawn')}</span>}
        </h2>
        {(() => {
          // Everything about this locality, one click away: sections below, and the outside pages.
          const apps = applications?.filter((a) => a.loknr === p.loknr) ?? []
          const hear = hearingsFor(hearings, p.loknr, p.navn, p.kommune)
          const nCases = cases ? casesFor(cases, p.loknr).length : 0
          const go = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
          const links: [string, string, ReactNode?][] = []
          if (apps.length) links.push(['sec-application', t('inspect.nav.application', { n: apps.length }), apps.some(isNewApplication) ? <Sym key="new" kind="newApplication" /> : undefined])
          if (hear.length) links.push(['sec-hearings', t('inspect.nav.hearings', { n: hear.length }), <Sym key="hearing" kind={hear.some((h) => isOpenHearing(h)) ? 'hearing' : 'hearingPast'} />])
          links.push(['sec-overlays', t('inspect.nav.overlays')])
          links.push(['sec-fishhealth', t('inspect.nav.fishHealth')])
          links.push(['sec-cases', t('inspect.nav.cases', { n: nCases })])
          if (tides?.localities[String(p.loknr)]) links.push(['sec-tides', t('inspect.nav.tides')])
          return (
            <nav className="site-nav" aria-label={t('inspect.nav.aria')}>
              {links.map(([id, label, sym]) => (
                <button key={id} type="button" className="chip" onClick={() => go(id)}>
                  {sym}
                  {sym ? ' ' : ''}
                  {label}
                </button>
              ))}
              <a className="chip" href={`https://einnsyn.no/sok?query=${encodeURIComponent(String(p.loknr))}`} target="_blank" rel="noreferrer">
                {t('inspect.nav.einnsyn')} ↗
              </a>
            </nav>
          )
        })()}
        <table className="kv">
          <tbody>
            {rows.map(fieldRow)}
          </tbody>
        </table>
        {picker && localities && (
          <FieldPicker
            fieldKey={picker.key}
            localities={localities}
            anchor={picker.anchor}
            filters={fieldFilters}
            siteValues={fieldValuesOf(picker.key, p, stats)}
            stats={stats}
            onChange={setFilters}
            onClose={() => setPicker(null)}
          />
        )}
        {p.lokalitet_url && (
          <p>
            <a href={p.lokalitet_url} target="_blank" rel="noreferrer">
              {t('inspect.openRegister')}
            </a>
          </p>
        )}
        <p className="muted">{t('inspect.sourceRegister')}</p>
        {applications?.some((a) => a.loknr === p.loknr) && (
          <p className="app-pending" id="sec-application">
            {applications.filter((a) => a.loknr === p.loknr).some(isNewApplication) && <Sym kind="newApplication" title={t('app.new')} />} {t('app.pending')}{' '}
            {applications
              .filter((a) => a.loknr === p.loknr)
              .map((a, i) => (
                <span key={a.appNo}>
                  {i > 0 && ', '}
                  <button type="button" className="case-site" onClick={() => onSelectApplication(a)}>
                    {a.appNo}
                  </button>
                </span>
              ))}
          </p>
        )}
        <Hearings id="sec-hearings" items={hearingsFor(hearings, p.loknr, p.navn, p.kommune)} />
        {tides?.localities[String(p.loknr)] && (() => {
          const td = tides.localities[String(p.loknr)]
          return (
            <p id="sec-tides">
              <Hint id="tides" text={t('hint.tides', { gauge: td.gauge ?? '–', factor: td.factor ?? 1, year: tides.year })}>{t('inspect.tides')}</Hint>: {t('inspect.tidesValue', { mean: td.meanRange, max: td.maxRange, high: td.meanHigh, low: td.meanLow })}
            </p>
          )
        })()}
        {(() => {
          const f = localities?.features.find((x) => x.properties.loknr === p.loknr)
          return f ? (
            <div id="sec-overlays">
              <SiteOverlays map={map} loknr={p.loknr} lngLat={f.geometry.coordinates as [number, number]} />
            </div>
          ) : null
        })()}
        <h3 id="sec-fishhealth">{t('inspect.fishHealth')}</h3>
        {series && sum ? (
          <>
            <table className="kv">
              <tbody>
                <tr>
                  <th>
                    <Hint id="latestLice" text={t('hint.latestLice')}>{t('inspect.latestLice')}</Hint>
                  </th>
                  <td>
                    {sum.latest ? `${sum.latest.lice} (${t('chart.week', { w: sum.latest.week })})` : t('inspect.notReported')}
                    {sum.fallowNow ? t('inspect.fallowNow') : ''}
                  </td>
                </tr>
                <tr>
                  <th>
                    <Hint id="last52" text={t('hint.last52')}>{t('inspect.last52')}</Hint>
                  </th>
                  <td>{t('inspect.summary', { r: sum.weeksReported, a: sum.weeksAboveLimit, t: sum.treatments })}</td>
                </tr>
                {liceRows.map(fieldRow)}
              </tbody>
            </table>
            <Hint id={operatorFilter.length ? 'liceChartOperators' : 'liceChartAll'} text={t(operatorFilter.length ? 'hint.liceChartOperators' : 'hint.liceChartAll')} block>
              <LiceChart series={series} extras={extras} temp={seatemp && fishhealth ? (tempSeries(seatemp, p.loknr, fishhealth.weeks) ?? undefined) : undefined} />
            </Hint>
            {!operatorFilter.length && <p className="muted">{t('inspect.selectOps')}</p>}
            <p className="muted">{t('inspect.sourceBW', { date: fishhealth!.retrieved.slice(0, 10) })}</p>
          </>
        ) : (
          <p className="muted">{fishhealth ? t('inspect.noReports') : t('inspect.notLoaded')}</p>
        )}
        <h3 id="sec-cases">
          <Hint id="cases" text={t('hint.cases')}>{t('inspect.cases')}</Hint>
        </h3>
        {cases ? (
          (() => {
            const all = casesFor(cases, p.loknr)
            const withText = all.filter((e) => cases.docs?.[e.id]?.some((d) => d.text))
            const textDocs = all.reduce((n, e) => n + (cases.docs?.[e.id]?.filter((d) => d.text).length ?? 0), 0)
            const list = onlyText ? withText : all
            const keep = new Set(list.map((e) => e.id))
            // Grouped by case file: cases with the most recent activity first, and inside each case the
            // entries in the order the matter progressed, oldest first.
            const groups = groupCases
              ? groupRows(
                  caseRows(cases, [p.loknr]).filter((r) => keep.has(r.entry.id)),
                  cases.cases,
                ).map((g) => ({ ...g, rows: [...g.rows].reverse() }))
              : null
            const row = (e: CaseEntry) => (
              <li key={e.id} className={`case case-${caseKind(e)}`}>
                <span className="case-date">{e.date ?? '–'}</span>
                <span className="case-kind">{t(`case.${caseKind(e)}`)}</span>
                <CaseDocsDot docs={cases.docs?.[e.id]} />
                <a href={caseUrl(e)} target="_blank" rel="noreferrer" className="case-title">
                  {e.title}
                </a>
                <small className="muted">
                  {e.entity} · {t(`case.${e.type ?? 'internal'}`)}
                </small>
                <CaseDocs entry={e} docs={cases.docs?.[e.id]} />
              </li>
            )
            return all.length ? (
              <>
                <div className="cases-boxes">
                  <label className="cases-onlytext" title={t('cases.onlyTextTitle', { n: withText.length, d: textDocs })}>
                    <input type="checkbox" checked={onlyText} onChange={(e) => updateSettings({ casesOnlyText: e.target.checked })} disabled={!withText.length} />{' '}
                    {t('cases.onlyText', { n: withText.length })}
                  </label>
                  {cases.cases && (
                    <label className="cases-onlytext" title={t('inspect.groupOrder')}>
                      <input type="checkbox" checked={groupCases} onChange={(e) => updateSettings({ casesGrouped: e.target.checked })} /> {t('cases.group')}
                    </label>
                  )}
                </div>
                {groups ? (
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
                        <ul className="cases">{g.rows.map((r) => row(r.entry))}</ul>
                      </section>
                    ))}
                  </div>
                ) : (
                  <ul className="cases">{list.map(row)}</ul>
                )}
              </>
            ) : (
              <p className="muted">{t('inspect.noCases', { from: cases.from })}</p>
            )
          })()
        ) : (
          <p className="muted">{t(casesFailed ? 'inspect.casesFailed' : 'inspect.casesLoading')}</p>
        )}
        <p className="muted">{cases ? t('inspect.sourceCases', { date: cases.retrieved.slice(0, 10) }) : ''}</p>
      </div>
    )
  }

  if (selection.type === 'hearing') {
    const h = selection.props
    return (
      <div className="panel-body">
        <h2>
          {h.navn ? `${h.navn}${h.loknr ? ` (${h.loknr})` : ''}` : h.title}
          <span className="badge-application">{t('hearings.badge')}</span>
        </h2>
        <Hearings items={[h]} />
        {h.text && <p className="hearing-text muted">{h.text}</p>}
        {h.placed === 'register' && <p className="muted">{t('hearings.placedRegister')}</p>}
      </div>
    )
  }

  if (selection.type === 'application') {
    const a = selection.props
    // An application is a form, not a register entry: show what was applied for, and where to follow the case.
    const rows: [string, string | number | undefined][] = [
      ['app.no', a.appNo],
      ['app.applicant', a.applicant],
      ['app.kind', a.kind],
      ['app.status', a.status ? t(`app.status.${a.status}`) : undefined],
      ['app.submitted', a.submitted],
      ['app.site', a.navn ? `${a.navn}${a.loknr ? ` (${a.loknr})` : ''}` : undefined],
      ['app.where', [a.kommune, a.fylke].filter(Boolean).join(', ') || undefined],
      ['app.prodArea', a.prodArea],
      ['app.species', a.species],
      ['app.biomass', a.biomass ? `${fmt(a.biomass)} t` : undefined],
      ['app.plannedProd', a.plannedProd ? `${fmt(a.plannedProd)} t` : undefined],
      ['app.feed', a.feed ? `${fmt(a.feed)} t` : undefined],
      ['app.cycle', a.cycleMonths ? t('app.months', { n: a.cycleMonths }) : undefined],
      ['app.net', [a.netType, a.netDepth ? `${fmt(a.netDepth / 100)} m` : null].filter(Boolean).join(' · ') || undefined],
      ['app.netTreatment', a.netTreatment],
      ['app.licences', a.licences],
    ]
    return (
      <div className="panel-body">
        <h2>
          {a.navn ?? a.appNo}
          <span className="badge-application">{t('app.badge')}</span>
          {isNewApplication(a) && <span className="badge-new">{t('app.new')}</span>}
        </h2>
        <table className="kv">
          <tbody>
            {rows
              .filter(([, v]) => v != null && v !== '')
              .map(([k, v]) => (
                <tr key={k}>
                  <th>
                    <Hint id="application" text={t('hint.application')}>
                      {t(k)}
                    </Hint>
                  </th>
                  <td>{v}</td>
                </tr>
              ))}
          </tbody>
        </table>
        <Hearings items={hearingsForApplication(hearings, a)} />
        {a.url && (
          <p>
            <a href={a.url} target="_blank" rel="noreferrer">
              {t('app.openList')} ↗
            </a>
          </p>
        )}
        <p>
          <a href={`https://einnsyn.no/sok?query=${encodeURIComponent(a.appNo)}`} target="_blank" rel="noreferrer">
            {t('app.searchCase')} ↗
          </a>
        </p>
        <p className="muted">{t('app.source')}</p>
      </div>
    )
  }

  const [lon, lat] = selection.lngLat
  const nb = localities ? neighbourhood(localities, selection.lngLat) : null
  return (
    <div className="panel-body">
      <h2>{t('inspect.hypothetical')}</h2>
      <table className="kv">
        <tbody>
          <tr>
            <th>
              <Hint id="position" text={t('hint.position')}>{t('inspect.position')}</Hint>
            </th>
            <td>
              {lat.toFixed(5)}°N, {lon.toFixed(5)}°E
            </td>
          </tr>
          {nb?.nearest && (
            <tr>
              <th>
                <Hint id="nearestFarm" text={t('hint.nearestFarm')}>{t('inspect.nearest')}</Hint>
              </th>
              <td>{t('inspect.nearestValue', { name: nb.nearest.name, nr: nb.nearest.loknr, km: nb.nearest.km.toFixed(1) })}</td>
            </tr>
          )}
        </tbody>
      </table>
      {fishhealth && localities && (
        <>
          <h3>
            <Hint id="licePressure" text={t('hint.licePressure')}>{t('inspect.licePressure')}</Hint>
          </h3>
          <table className="kv">
            <thead>
              <tr>
                <th>{t('inspect.radius')}</th>
                <th>{t('inspect.farms')}</th>
                <th>{t('inspect.meanLice')}</th>
                <th>{t('inspect.weeksAbove')}</th>
              </tr>
            </thead>
            <tbody>
              {licePressure(fishhealth, localities, selection.lngLat).map((r) => (
                <tr key={r.km}>
                  <th>{r.km} km</th>
                  <td>{r.farmsReporting}</td>
                  <td>{r.meanLice != null ? r.meanLice.toFixed(2) : '–'}</td>
                  <td>{r.shareAboveLimit != null ? `${Math.round(r.shareAboveLimit * 100)}%` : '–'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
      {nb && (
        <>
          <h3>
            <Hint id="neighbours" text={t('hint.neighbours')}>{t('inspect.neighbours')}</Hint>
          </h3>
          <table className="kv">
            <thead>
              <tr>
                <th>{t('inspect.radius')}</th>
                <th>{t('inspect.farms')}</th>
                <th>{t('inspect.capacityT')}</th>
              </tr>
            </thead>
            <tbody>
              {nb.within.map((w) => (
                <tr key={w.km}>
                  <th>{w.km} km</th>
                  <td>{w.count}</td>
                  <td>{fmtNum(w.capacityTn)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
      <p className="muted">{t('inspect.laterPhases')}</p>
    </div>
  )
}
