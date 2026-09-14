// Field filters set from the site panel: each register field can restrict the
// map to sites sharing the clicked value (capacity: at least the value).
import { operatorsOf, type Localities, type LocalityProps } from './localities'

export interface CapacityRange {
  min: number
  /** null = open-ended */
  max: number | null
}

export interface FieldFilters {
  status?: string
  capacity?: CapacityRange
  species?: string
  purpose?: string
  productionForm?: string
  placement?: string
  municipality?: string
  prodArea?: string
}

export type FilterKey = keyof FieldFilters

export const FILTER_LABELS: Record<FilterKey, string> = {
  status: 'Status',
  capacity: 'Capacity',
  species: 'Species',
  purpose: 'Purpose',
  productionForm: 'Production form',
  placement: 'Placement',
  municipality: 'Municipality',
  prodArea: 'Production area',
}

/** Capacity ranges in multiples of the 780 t standard licence. */
export const CAPACITY_BUCKETS: CapacityRange[] = [
  { min: 0, max: 780 },
  { min: 780, max: 1560 },
  { min: 1560, max: 3120 },
  { min: 3120, max: 4680 },
  { min: 4680, max: 7800 },
  { min: 7800, max: null },
]

export const capacityLabel = (r: CapacityRange) =>
  r.max === null ? `≥ ${r.min.toLocaleString('en-GB')} t` : `${r.min.toLocaleString('en-GB')}–${r.max.toLocaleString('en-GB')} t`

const bucketOf = (tonnes: number) => CAPACITY_BUCKETS.find((b) => tonnes >= b.min && (b.max === null || tonnes < b.max))!

/** Filter value a site's field would set, or undefined when the field is empty. */
export function filterValueOf(key: FilterKey, p: LocalityProps): string | CapacityRange | undefined {
  switch (key) {
    case 'status':
      return p.status_lokalitet || undefined
    case 'capacity':
      return p.kapasitet_unittype === 'TN' && p.kapasitet_lok != null ? bucketOf(p.kapasitet_lok) : undefined
    case 'species':
      return p.til_arter?.split(',')[0]?.trim() || undefined
    case 'purpose':
      return p.til_formaal || undefined
    case 'productionForm':
      return p.til_produksjonsform || undefined
    case 'placement':
      return p.plassering || undefined
    case 'municipality':
      return p.kommune || undefined
    case 'prodArea':
      return p.prodareacode || undefined
  }
}

export function matchesFilters(p: LocalityProps, f: FieldFilters): boolean {
  if (f.status && p.status_lokalitet !== f.status) return false
  if (f.capacity && !(p.kapasitet_unittype === 'TN' && p.kapasitet_lok != null && p.kapasitet_lok >= f.capacity.min && (f.capacity.max === null || p.kapasitet_lok < f.capacity.max))) return false
  if (f.species && !(p.til_arter ?? '').split(',').map((s) => s.trim()).includes(f.species)) return false
  if (f.purpose && p.til_formaal !== f.purpose) return false
  if (f.productionForm && p.til_produksjonsform !== f.productionForm) return false
  if (f.placement && p.plassering !== f.placement) return false
  if (f.municipality && p.kommune !== f.municipality) return false
  if (f.prodArea && p.prodareacode !== f.prodArea) return false
  return true
}

export const activeFilterKeys = (f: FieldFilters): FilterKey[] =>
  (Object.keys(f) as FilterKey[]).filter((k) => f[k] !== undefined && f[k] !== '')

export function describeFilter(key: FilterKey, f: FieldFilters): string {
  if (key === 'capacity') return `${FILTER_LABELS.capacity} ${capacityLabel(f.capacity!)}`
  return `${FILTER_LABELS[key]}: ${f[key]}`
}

export interface ValueOption {
  value: string | CapacityRange
  label: string
  count: number
}

/** Every value a field takes across the localities, with site counts (capacity: the fixed ranges). */
export function valueOptions(localities: Localities, key: FilterKey): ValueOption[] {
  if (key === 'capacity') {
    return CAPACITY_BUCKETS.map((b) => ({
      value: b,
      label: capacityLabel(b),
      count: localities.features.filter((x) => matchesFilters(x.properties, { capacity: b })).length,
    }))
  }
  const counts = new Map<string, number>()
  for (const x of localities.features) {
    const vals = key === 'species' ? (x.properties.til_arter ?? '').split(',').map((s) => s.trim()).filter(Boolean) : [filterValueOf(key, x.properties) as string | undefined]
    for (const v of vals) if (v) counts.set(v, (counts.get(v) ?? 0) + 1)
  }
  return [...counts].map(([value, count]) => ({ value, label: value, count })).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
}

export const sameValue = (a: string | CapacityRange | undefined, b: string | CapacityRange | undefined) =>
  a !== undefined && b !== undefined && (typeof a === 'string' || typeof b === 'string' ? a === b : a.min === b.min && a.max === b.max)

/** Locality numbers passing the operator selection and the field filters; null when nothing is filtered. */
export function filteredLoknrs(localities: Localities, operators: string[], f: FieldFilters): number[] | null {
  if (!operators.length && !activeFilterKeys(f).length) return null
  const wanted = new Set(operators)
  return localities.features
    .filter((x) => (!wanted.size || operatorsOf(x.properties).some((o) => wanted.has(o))) && matchesFilters(x.properties, f))
    .map((x) => x.properties.loknr)
}
