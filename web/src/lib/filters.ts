// Field filters set from the site panel: each register field can restrict the
// map to sites sharing the clicked value (capacity: at least the value).
import { operatorsOf, type Localities, type LocalityProps } from './localities'

export interface FieldFilters {
  status?: string
  capacityMin?: number
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
  capacityMin: 'Capacity ≥',
  species: 'Species',
  purpose: 'Purpose',
  productionForm: 'Production form',
  placement: 'Placement',
  municipality: 'Municipality',
  prodArea: 'Production area',
}

/** Filter value a site's field would set, or undefined when the field is empty. */
export function filterValueOf(key: FilterKey, p: LocalityProps): string | number | undefined {
  switch (key) {
    case 'status':
      return p.status_lokalitet || undefined
    case 'capacityMin':
      return p.kapasitet_unittype === 'TN' && p.kapasitet_lok != null ? p.kapasitet_lok : undefined
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
  if (f.capacityMin != null && !(p.kapasitet_unittype === 'TN' && (p.kapasitet_lok ?? 0) >= f.capacityMin)) return false
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
  const v = f[key]
  return key === 'capacityMin' ? `${FILTER_LABELS[key]} ${Number(v).toLocaleString('en-GB')} t` : `${FILTER_LABELS[key]}: ${v}`
}

/** Locality numbers passing the operator selection and the field filters; null when nothing is filtered. */
export function filteredLoknrs(localities: Localities, operators: string[], f: FieldFilters): number[] | null {
  if (!operators.length && !activeFilterKeys(f).length) return null
  const wanted = new Set(operators)
  return localities.features
    .filter((x) => (!wanted.size || operatorsOf(x.properties).some((o) => wanted.has(o))) && matchesFilters(x.properties, f))
    .map((x) => x.properties.loknr)
}
