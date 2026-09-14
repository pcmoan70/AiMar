// Public-record journal entries (eInnsyn) matched to localities; see scripts/fetch-cases.mjs.
import { dataUrl } from './localities'

export interface CaseEntry {
  id: string
  /** archive identifiers used by einnsyn.no's page URLs (absent in harvests before 2026-09-14) */
  ext?: string | null
  sak?: string | null
  date: string | null
  entity: string
  /** in = received by the authority, out = sent, internal */
  type: 'in' | 'out' | 'internal' | null
  title: string
}

export interface CaseDoc {
  id: string
  title: string
  format: string
  bytes: number
  /** first characters of the document text (pdftotext), empty when not extractable */
  excerpt: string
}

export interface Cases {
  retrieved: string
  from: string
  entries: CaseEntry[]
  /** entry id -> documents published on eInnsyn (from docs.json, when present) */
  docs?: Record<string, CaseDoc[]>
  docsRetrieved?: string
  /** case externalId -> case number and title (harvests from 2026-09-14 on) */
  cases?: Record<string, { nr: string; title: string }>
  /** locality number -> indexes into entries, newest first */
  localities: Record<string, number[]>
}

export async function loadCases(): Promise<Cases> {
  const res = await fetch(dataUrl('cases.json'))
  if (!res.ok) throw new Error(`cases: HTTP ${res.status}`)
  const data: Cases = await res.json()
  try {
    const d = await fetch(dataUrl('docs.json'))
    if (d.ok) {
      const j = await d.json()
      data.docs = j.docs
      data.docsRetrieved = j.retrieved
    }
  } catch {
    /* documents are optional */
  }
  return data
}

/** The file itself, served by the eInnsyn API. */
export const docUrl = (d: CaseDoc) => `https://api.einnsyn.no/dokumentobjekt/${d.id}/download`

export const casesFor = (data: Cases, loknr: number): CaseEntry[] => (data.localities[String(loknr)] ?? []).map((i) => data.entries[i])

/** Entry page on einnsyn.no; without archive identifiers, fall back to a title search there. */
export const caseUrl = (e: CaseEntry) =>
  e.sak && e.ext
    ? `https://einnsyn.no/saksmappe?id=${encodeURIComponent(e.sak)}&jid=${encodeURIComponent(e.ext)}`
    : `https://einnsyn.no/sok?query=${encodeURIComponent(e.title)}`

/** Coarse classification from the title, for the timeline badge. */
export function caseKind(e: CaseEntry): 'decision' | 'refusal' | 'application' | 'statement' | 'complaint' | 'other' {
  const t = e.title.toLowerCase()
  if (/avslag|avvis/.test(t)) return 'refusal'
  if (/klage/.test(t)) return 'complaint'
  if (/vedtak|tillatelse|godkjenn/.test(t)) return 'decision'
  if (/søknad|soknad/.test(t)) return 'application'
  if (/uttalelse|høring|horing|innspill/.test(t)) return 'statement'
  return 'other'
}

export type CaseKind = ReturnType<typeof caseKind>
export const CASE_KINDS: CaseKind[] = ['application', 'statement', 'decision', 'refusal', 'complaint', 'other']

export interface CaseRow {
  entry: CaseEntry
  kind: CaseKind
  /** localities this entry was matched to */
  loknrs: number[]
}

/** One row per entry matched to any of `loknrs` (null = every locality), newest first as stored. */
export function caseRows(data: Cases, loknrs: Iterable<number> | null): CaseRow[] {
  const rows = new Map<number, CaseRow>()
  const keys = loknrs === null ? Object.keys(data.localities) : [...loknrs].map(String)
  for (const k of keys) {
    for (const i of data.localities[k] ?? []) {
      const r = rows.get(i)
      if (r) r.loknrs.push(Number(k))
      else rows.set(i, { entry: data.entries[i], kind: caseKind(data.entries[i]), loknrs: [Number(k)] })
    }
  }
  return [...rows.entries()].sort((a, b) => a[0] - b[0]).map(([, r]) => r)
}

export type CaseSort = 'date' | 'site' | 'authority' | 'kind'
export const CASE_SORTS: CaseSort[] = ['date', 'site', 'authority', 'kind']

/** Sort a copy of `rows`; ties fall back to date (newest first). `siteName` labels a row by its first locality. */
export function sortRows(rows: CaseRow[], sort: CaseSort, desc: boolean, siteName: (loknr: number) => string): CaseRow[] {
  const key = (r: CaseRow): string =>
    sort === 'date' ? r.entry.date ?? '' : sort === 'site' ? siteName(r.loknrs[0]) : sort === 'authority' ? r.entry.entity : String(CASE_KINDS.indexOf(r.kind))
  const byDate = (a: CaseRow, b: CaseRow) => (b.entry.date ?? '').localeCompare(a.entry.date ?? '')
  return [...rows].sort((a, b) => {
    const c = key(a).localeCompare(key(b), 'nb')
    return (desc ? -c : c) || byDate(a, b)
  })
}

/** Case-insensitive substring match on title, case title, authority and site names; every word must match. */
export function searchRows(rows: CaseRow[], query: string, siteName: (loknr: number) => string, caseTitle: (sak: string) => string = () => ''): CaseRow[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  if (!words.length) return rows
  return rows.filter((r) => {
    const hay = `${r.entry.title} ${r.entry.sak ? caseTitle(r.entry.sak) : ''} ${r.entry.entity} ${r.loknrs.map(siteName).join(' ')}`.toLowerCase()
    return words.every((w) => hay.includes(w))
  })
}

export interface CaseGroup {
  sak: string | null
  nr: string
  title: string
  rows: CaseRow[]
}

/** Group sorted rows by case, in order of each case's first row; entries without a case form one trailing group. */
export function groupRows(rows: CaseRow[], info: Cases['cases'] = {}): CaseGroup[] {
  const groups = new Map<string | null, CaseGroup>()
  for (const r of rows) {
    const sak = r.entry.sak ?? null
    let g = groups.get(sak)
    if (!g) {
      const c = sak ? info?.[sak] : undefined
      g = { sak, nr: c?.nr ?? '', title: c?.title ?? '', rows: [] }
      groups.set(sak, g)
    }
    g.rows.push(r)
  }
  const out = [...groups.values()]
  const loose = groups.get(null)
  return loose ? [...out.filter((g) => g !== loose), loose] : out
}

export const caseFolderUrl = (sak: string) => `https://einnsyn.no/saksmappe?id=${encodeURIComponent(sak)}`
