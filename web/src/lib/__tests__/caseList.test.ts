import { describe, expect, it } from 'vitest'
import { caseRows, searchRows, sortRows, type Cases } from '../cases'

const data: Cases = {
  retrieved: '2026-09-14T00:00:00Z',
  from: '2023-09-01',
  entries: [
    { id: 'a', date: '2026-06-18', entity: 'Nordland fylkeskommune', type: 'out', title: 'Vedtak - tillatelse - lokalitet Skipbåten' },
    { id: 'b', date: '2026-01-10', entity: 'Mattilsynet', type: 'in', title: 'Søknad om ny lokalitet Skipbåten og Fornes' },
    { id: 'c', date: '2026-02-01', entity: 'Statsforvalteren', type: 'out', title: 'Uttalelse - Fornes' },
  ],
  localities: { '1': [0, 1], '2': [1, 2] },
}
const name = (nr: number) => ({ 1: 'SKIPBÅTEN', 2: 'FORNES' })[nr] ?? String(nr)

describe('case list', () => {
  it('collects one row per entry for the given localities', () => {
    const all = caseRows(data, null)
    expect(all.map((r) => r.entry.id)).toEqual(['a', 'b', 'c'])
    expect(all[1].loknrs).toEqual([1, 2])
    expect(caseRows(data, [2]).map((r) => r.entry.id)).toEqual(['b', 'c'])
    expect(caseRows(data, [])).toEqual([])
  })
  it('sorts by date, site, authority and kind with date as tie-break', () => {
    const all = caseRows(data, null)
    expect(sortRows(all, 'date', true, name).map((r) => r.entry.id)).toEqual(['a', 'c', 'b'])
    expect(sortRows(all, 'date', false, name).map((r) => r.entry.id)).toEqual(['b', 'c', 'a'])
    expect(sortRows(all, 'authority', false, name).map((r) => r.entry.id)).toEqual(['b', 'a', 'c'])
    expect(sortRows(all, 'site', false, name).map((r) => r.entry.id)).toEqual(['c', 'a', 'b'])
    expect(sortRows(all, 'kind', false, name).map((r) => r.kind)).toEqual(['application', 'statement', 'decision'])
  })
  it('searches every word across title, authority and site names', () => {
    const all = caseRows(data, null)
    expect(searchRows(all, 'fornes', name).map((r) => r.entry.id)).toEqual(['b', 'c'])
    expect(searchRows(all, 'fornes mattilsynet', name).map((r) => r.entry.id)).toEqual(['b'])
    expect(searchRows(all, '  ', name)).toBe(all)
  })
})

describe('case grouping', () => {
  it('groups rows by case in first-appearance order, loose entries last', async () => {
    const { groupRows } = await import('../cases')
    const withCases: Cases = {
      ...data,
      entries: data.entries.map((e, i) => ({ ...e, sak: i < 2 ? 'http://sak/1' : null })),
      cases: { 'http://sak/1': { nr: '2026/1', title: 'Akvakultur - Skipbåten' } },
    }
    const rows = caseRows(withCases, null)
    const groups = groupRows([rows[2], rows[0], rows[1]], withCases.cases)
    expect(groups.map((g) => [g.nr, g.rows.length])).toEqual([['2026/1', 2], ['', 1]])
    expect(groups[0].title).toBe('Akvakultur - Skipbåten')
    expect(searchRows(rows, 'akvakultur', name, (s) => withCases.cases![s]?.title ?? '').map((r) => r.entry.id)).toEqual(['a', 'b'])
  })
})
