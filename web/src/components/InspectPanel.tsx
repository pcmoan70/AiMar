import { useState } from 'react'
import { neighbourhood, type Localities } from '../lib/localities'
import { licePressure, liceSeries, liceStatsIndex, operatorPressureSeries, summarise, type FishHealth } from '../lib/fishhealth'
import { caseKind, caseUrl, casesFor, type Cases } from '../lib/cases'
import { ALL_FARMS_COLOUR, paletteFor } from '../lib/operatorColours'
import { updateSettings, useSettings } from '../lib/settings'
import { activeFilterKeys, fieldValuesOf, valueLabel, type FieldFilters, type FilterKey, type FilterValue } from '../lib/filters'
import { numberLocale, useT } from '../lib/i18n'
import type { HintKey } from '../lib/hints'
import LiceChart from './LiceChart'
import Hint from './Hint'
import FieldPicker from './FieldPicker'
import type { Selection } from './MapView'

interface Props {
  selection: Selection | null
  localities: Localities | null
  fishhealth: FishHealth | null
  cases: Cases | null
}

const fmtDate = (ms: number | null) => (ms ? new Date(ms).toISOString().slice(0, 10) : '–')

export default function InspectPanel({ selection, localities, fishhealth, cases }: Props) {
  const t = useT()
  const { operatorFilter, fieldFilters } = useSettings()
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
    const stats = fishhealth ? liceStatsIndex(fishhealth) : undefined
    const series = fishhealth ? liceSeries(fishhealth, p.loknr) : null
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
            <Hint text={t(`hint.${h}`)}>{k}</Hint>
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
        <h2>{p.navn}</h2>
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
        <h3>{t('inspect.fishHealth')}</h3>
        {series && sum ? (
          <>
            <table className="kv">
              <tbody>
                <tr>
                  <th>
                    <Hint text={t('hint.latestLice')}>{t('inspect.latestLice')}</Hint>
                  </th>
                  <td>
                    {sum.latest ? `${sum.latest.lice} (${t('chart.week', { w: sum.latest.week })})` : t('inspect.notReported')}
                    {sum.fallowNow ? t('inspect.fallowNow') : ''}
                  </td>
                </tr>
                <tr>
                  <th>
                    <Hint text={t('hint.last52')}>{t('inspect.last52')}</Hint>
                  </th>
                  <td>{t('inspect.summary', { r: sum.weeksReported, a: sum.weeksAboveLimit, t: sum.treatments })}</td>
                </tr>
                {liceRows.map(fieldRow)}
              </tbody>
            </table>
            <Hint text={t(operatorFilter.length ? 'hint.liceChartOperators' : 'hint.liceChartAll')} block>
              <LiceChart series={series} extras={extras} />
            </Hint>
            {!operatorFilter.length && <p className="muted">{t('inspect.selectOps')}</p>}
            <p className="muted">{t('inspect.sourceBW', { date: fishhealth!.retrieved.slice(0, 10) })}</p>
          </>
        ) : (
          <p className="muted">{fishhealth ? t('inspect.noReports') : t('inspect.notLoaded')}</p>
        )}
        <h3>
          <Hint text={t('hint.cases')}>{t('inspect.cases')}</Hint>
        </h3>
        {cases ? (
          (() => {
            const list = casesFor(cases, p.loknr)
            return list.length ? (
              <ul className="cases">
                {list.map((e) => (
                  <li key={e.id} className={`case case-${caseKind(e)}`}>
                    <span className="case-date">{e.date ?? '–'}</span>
                    <span className="case-kind">{t(`case.${caseKind(e)}`)}</span>
                    <a href={caseUrl(e)} target="_blank" rel="noreferrer" className="case-title">
                      {e.title}
                    </a>
                    <small className="muted">
                      {e.entity} · {t(`case.${e.type ?? 'internal'}`)}
                    </small>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted">{t('inspect.noCases', { from: cases.from })}</p>
            )
          })()
        ) : (
          <p className="muted">{t('inspect.casesNotLoaded')}</p>
        )}
        <p className="muted">{cases ? t('inspect.sourceCases', { date: cases.retrieved.slice(0, 10) }) : ''}</p>
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
              <Hint text={t('hint.position')}>{t('inspect.position')}</Hint>
            </th>
            <td>
              {lat.toFixed(5)}°N, {lon.toFixed(5)}°E
            </td>
          </tr>
          {nb?.nearest && (
            <tr>
              <th>
                <Hint text={t('hint.nearestFarm')}>{t('inspect.nearest')}</Hint>
              </th>
              <td>{t('inspect.nearestValue', { name: nb.nearest.name, nr: nb.nearest.loknr, km: nb.nearest.km.toFixed(1) })}</td>
            </tr>
          )}
        </tbody>
      </table>
      {fishhealth && localities && (
        <>
          <h3>
            <Hint text={t('hint.licePressure')}>{t('inspect.licePressure')}</Hint>
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
            <Hint text={t('hint.neighbours')}>{t('inspect.neighbours')}</Hint>
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
