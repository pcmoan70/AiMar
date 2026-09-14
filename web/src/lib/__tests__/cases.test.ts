import { describe, expect, it } from 'vitest'
import { caseKind, caseUrl, casesFor, type Cases } from '../cases'

const data: Cases = {
  retrieved: '2026-09-14T00:00:00Z',
  from: '2023-09-01',
  entries: [
    { id: 'jp_a', date: '2026-06-18', entity: 'Nordland fylkeskommune', type: 'out', title: 'Vedtak - tillatelse - akvakultur - Herøy - Helgeland Laks AS - lokalitet Skipbåten' },
    { id: 'jp_b', date: '2026-01-10', entity: 'Nordland fylkeskommune', type: 'in', title: 'Søknad om ny lokalitet Skipbåten' },
    { id: 'jp_c', date: '2026-02-01', entity: 'Statsforvalteren', type: 'out', title: 'Uttalelse - Skipbåten' },
  ],
  localities: { '12345': [0, 2, 1] },
}

describe('cases', () => {
  it('lists entries per locality in stored order and builds eInnsyn links', () => {
    const list = casesFor(data, 12345)
    expect(list.map((e) => e.id)).toEqual(['jp_a', 'jp_c', 'jp_b'])
    expect(casesFor(data, 1)).toEqual([])
    expect(caseUrl(list[0])).toBe('https://einnsyn.no/journalpost/jp_a')
  })
  it('classifies titles', () => {
    expect(caseKind(data.entries[0])).toBe('decision')
    expect(caseKind(data.entries[1])).toBe('application')
    expect(caseKind(data.entries[2])).toBe('statement')
    expect(caseKind({ ...data.entries[0], title: 'Vedtak - avslag på søknad' })).toBe('refusal')
    expect(caseKind({ ...data.entries[0], title: 'Foreløpig svar - klage på vedtak' })).toBe('complaint')
  })
})
