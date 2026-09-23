import type { ApplicationProps, Hearing } from './localities'
// Field filters set from the site panel: each register field can restrict the
// map to sites whose value (or, for composite fields, one of the comma-separated
// component values) is among the selected ones. Capacity uses fixed ranges.
import { operatorsOf, type Localities, type LocalityProps } from './localities'
import type { LiceStats } from './fishhealth'
import { numberLocale, t } from './i18n'

export interface CapacityRange {
  min: number
  /** null = open-ended */
  max: number | null
}

export interface FieldFilters {
  status?: string[]
  capacity?: CapacityRange[]
  species?: string[]
  purpose?: string[]
  productionForm?: string[]
  placement?: string[]
  municipality?: string[]
  prodArea?: string[]
  /** Fish-health statistics over the last 52 weeks (numeric ranges). */
  liceMean?: CapacityRange[]
  liceMax?: CapacityRange[]
  liceAbove?: CapacityRange[]
  liceTreat?: CapacityRange[]
}

/** Lice statistics per locality number, needed for the lice filters. */
export type LiceStatsMap = Map<number, LiceStats>

export type FilterKey = keyof FieldFilters
export type FilterValue = string | CapacityRange

export const FILTER_KEYS: FilterKey[] = ['status', 'capacity', 'species', 'purpose', 'productionForm', 'placement', 'municipality', 'prodArea', 'liceMean', 'liceMax', 'liceAbove', 'liceTreat']
export const LICE_KEYS: FilterKey[] = ['liceMean', 'liceMax', 'liceAbove', 'liceTreat']

/** Fields whose register value lists several components separated by commas. */
const COMPOSITE: FilterKey[] = ['species', 'purpose', 'productionForm']

export const filterLabel = (key: FilterKey) => t(`filter.${key}`)

/** Capacity ranges in multiples of the 780 t standard licence. */
export const CAPACITY_BUCKETS: CapacityRange[] = [
  { min: 0, max: 780 },
  { min: 780, max: 1560 },
  { min: 1560, max: 3120 },
  { min: 3120, max: 4680 },
  { min: 4680, max: 7800 },
  { min: 7800, max: null },
]

/** Ranges for the lice filters: values are lice per fish (mean, peak) or weeks (above limit, treatments). */
export const LICE_BUCKETS: Record<'liceMean' | 'liceMax' | 'liceAbove' | 'liceTreat', CapacityRange[]> = {
  liceMean: [{ min: 0, max: 0.1 }, { min: 0.1, max: 0.2 }, { min: 0.2, max: 0.5 }, { min: 0.5, max: null }],
  liceMax: [{ min: 0, max: 0.5 }, { min: 0.5, max: 1 }, { min: 1, max: 2 }, { min: 2, max: null }],
  liceAbove: [{ min: 0, max: 1 }, { min: 1, max: 3 }, { min: 3, max: 6 }, { min: 6, max: null }],
  liceTreat: [{ min: 0, max: 1 }, { min: 1, max: 3 }, { min: 3, max: 6 }, { min: 6, max: null }],
}

const fmt = (n: number, digits: number) => n.toLocaleString(numberLocale(), { maximumFractionDigits: digits })

export const capacityLabel = (r: CapacityRange) => (r.max === null ? `≥ ${fmt(r.min, 0)} t` : `${fmt(r.min, 0)}–${fmt(r.max, 0)} t`)

/** Label of a numeric range for a given key (capacity in tonnes, lice per fish, or whole weeks). */
export function rangeLabel(key: FilterKey, r: CapacityRange): string {
  if (key === 'capacity') return capacityLabel(r)
  if (key === 'liceAbove' || key === 'liceTreat') {
    const w = (n: number) => t(n === 1 ? 'filter.week' : 'filter.weeks', { n })
    if (r.max === null) return `≥ ${w(r.min)}`
    if (r.max - r.min === 1) return w(r.min)
    return `${r.min}–${w(r.max - 1)}`
  }
  return r.max === null ? `≥ ${fmt(r.min, 2)}` : `${fmt(r.min, 2)}–${fmt(r.max, 2)}`
}

const bucketIn = (buckets: CapacityRange[], v: number) => buckets.find((b) => v >= b.min && (b.max === null || v < b.max))!
const bucketOf = (tonnes: number) => bucketIn(CAPACITY_BUCKETS, tonnes)

const split = (s: string | null | undefined) => (s ?? '').split(',').map((x) => x.trim()).filter(Boolean)

/** The component values a site has for a field (several for composite fields), empty when the field is blank or, for lice keys, when the site has no reports. */
export function fieldValuesOf(key: FilterKey, p: LocalityProps, stats?: LiceStatsMap): FilterValue[] {
  if (LICE_KEYS.includes(key)) {
    const st = stats?.get(p.loknr)
    if (!st) return []
    const v = key === 'liceMean' ? st.mean : key === 'liceMax' ? st.max : key === 'liceAbove' ? st.weeksAbove : st.treatments
    return [bucketIn(LICE_BUCKETS[key as keyof typeof LICE_BUCKETS], v)]
  }
  switch (key) {
    case 'status':
      return p.status_lokalitet ? [p.status_lokalitet] : []
    case 'capacity':
      return p.kapasitet_unittype === 'TN' && p.kapasitet_lok != null ? [bucketOf(p.kapasitet_lok)] : []
    case 'species':
      return split(p.til_arter)
    case 'purpose':
      return split(p.til_formaal)
    case 'productionForm':
      return split(p.til_produksjonsform)
    case 'placement':
      return p.plassering ? [p.plassering] : []
    case 'municipality':
      return p.kommune ? [p.kommune] : []
    case 'prodArea':
      return p.prodareacode ? [p.prodareacode] : []
    default:
      return []
  }
}

export const sameValue = (a: FilterValue | undefined, b: FilterValue | undefined) =>
  a !== undefined && b !== undefined && (typeof a === 'string' || typeof b === 'string' ? a === b : a.min === b.min && a.max === b.max)

const selectedFor = (f: FieldFilters, key: FilterKey): FilterValue[] => (f[key] as FilterValue[] | undefined) ?? []

export function matchesFilters(p: LocalityProps, f: FieldFilters, stats?: LiceStatsMap): boolean {
  for (const key of FILTER_KEYS) {
    const sel = selectedFor(f, key)
    if (!sel.length) continue
    const mine = fieldValuesOf(key, p, stats)
    if (!mine.some((v) => sel.some((s) => sameValue(s, v)))) return false
  }
  return true
}

export const activeFilterKeys = (f: FieldFilters): FilterKey[] => FILTER_KEYS.filter((k) => selectedFor(f, k).length > 0)

export const valueLabel = (key: FilterKey, v: FilterValue) => (typeof v === 'string' ? v : rangeLabel(key, v))

export function describeFilter(key: FilterKey, f: FieldFilters): string {
  return `${filterLabel(key)}: ${selectedFor(f, key).map((v) => valueLabel(key, v)).join(', ')}`
}

export interface ValueOption {
  value: FilterValue
  label: string
  count: number
}

/** Every value a field takes across the localities with site counts: numeric keys in range order, text alphabetically. */
export function valueOptions(localities: Localities, key: FilterKey, stats?: LiceStatsMap): ValueOption[] {
  const buckets = key === 'capacity' ? CAPACITY_BUCKETS : LICE_KEYS.includes(key) ? LICE_BUCKETS[key as keyof typeof LICE_BUCKETS] : null
  if (buckets) {
    return buckets.map((b) => ({
      value: b,
      label: rangeLabel(key, b),
      count: localities.features.filter((x) => fieldValuesOf(key, x.properties, stats).some((v) => sameValue(v, b))).length,
    }))
  }
  const counts = new Map<string, number>()
  for (const x of localities.features) for (const v of fieldValuesOf(key, x.properties) as string[]) counts.set(v, (counts.get(v) ?? 0) + 1)
  const sortLocale = numberLocale()
  return [...counts]
    .map(([value, count]) => ({ value, label: value, count }))
    .sort((a, b) => a.label.localeCompare(b.label, sortLocale, { numeric: true, sensitivity: 'base' }))
}

/** Toggle one value inside a field's selection. */
export function toggleValue(f: FieldFilters, key: FilterKey, value: FilterValue): FieldFilters {
  const sel = selectedFor(f, key)
  const next = sel.some((s) => sameValue(s, value)) ? sel.filter((s) => !sameValue(s, value)) : [...sel, value]
  return { ...f, [key]: next.length ? next : undefined }
}

/** Select every option when some are unselected, otherwise clear the field. */
export function toggleAll(f: FieldFilters, key: FilterKey, options: ValueOption[]): FieldFilters {
  const sel = selectedFor(f, key)
  const allSelected = options.every((o) => sel.some((s) => sameValue(s, o.value)))
  return { ...f, [key]: allSelected ? undefined : options.map((o) => o.value) }
}

export const isComposite = (key: FilterKey) => COMPOSITE.includes(key)

/** Locality numbers passing the operator selection and the field filters; null when nothing is filtered. */
/** What the operator dropdown and the field filters keep on the map: localities, and the applications and notices that belong to them. */
export interface MapFilter {
  loknrs: number[] | null
  appNos: string[] | null
  hearingIds: string[] | null
}
const normName = (s?: string | null) => (s ?? '').trim().toUpperCase()
export function mapFilter(localities: Localities, applications: ApplicationProps[] | null, hearings: Hearing[] | null, operators: string[], f: FieldFilters, stats?: LiceStatsMap): MapFilter {
  const loknrs = filteredLoknrs(localities, operators, f, stats)
  if (!loknrs) return { loknrs: null, appNos: null, hearingIds: null }
  const sites = new Set(loknrs)
  // An application or notice without a registered site still belongs to an operator by its applicant name.
  const ops = new Set(operators.map(normName))
  const byOperator = (...names: (string | null | undefined)[]) => ops.size > 0 && names.some((n) => n && ops.has(normName(n)))
  return {
    loknrs,
    appNos: (applications ?? []).filter((a) => (a.loknr != null && sites.has(a.loknr)) || byOperator(a.applicant)).map((a) => a.appNo),
    hearingIds: (hearings ?? []).filter((h) => (h.loknr != null && sites.has(h.loknr)) || byOperator(h.applicant, h.publisher)).map((h) => h.id),
  }
}

export function filteredLoknrs(localities: Localities, operators: string[], f: FieldFilters, stats?: LiceStatsMap): number[] | null {
  if (!operators.length && !activeFilterKeys(f).length) return null
  const wanted = new Set(operators)
  return localities.features
    .filter((x) => (!wanted.size || operatorsOf(x.properties).some((o) => wanted.has(o))) && matchesFilters(x.properties, f, stats))
    .map((x) => x.properties.loknr)
}
