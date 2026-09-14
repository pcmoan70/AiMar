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

export interface Cases {
  retrieved: string
  from: string
  entries: CaseEntry[]
  /** locality number -> indexes into entries, newest first */
  localities: Record<string, number[]>
}

export async function loadCases(): Promise<Cases> {
  const res = await fetch(dataUrl('cases.json'))
  if (!res.ok) throw new Error(`cases: HTTP ${res.status}`)
  return res.json()
}

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
