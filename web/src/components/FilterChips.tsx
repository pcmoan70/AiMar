import { activeFilterKeys, describeFilter } from '../lib/filters'
import { updateSettings, useSettings } from '../lib/settings'
import { useT } from '../lib/i18n'

/** Active field filters under the operator dropdown, each with its own clear cross. */
export default function FilterChips() {
  const t = useT()
  const s = useSettings()
  const keys = activeFilterKeys(s.fieldFilters)
  if (!keys.length) return null
  return (
    <div className="filter-chips">
      {keys.map((k) => (
        <span key={k} className="chip">
          {describeFilter(k, s.fieldFilters)}
          <button
            type="button"
            className="chip-x"
            aria-label={t('filter.clearOne', { f: describeFilter(k, s.fieldFilters) })}
            onClick={() => updateSettings({ fieldFilters: { ...s.fieldFilters, [k]: undefined } })}
          >
            ✕
          </button>
        </span>
      ))}
      {keys.length > 1 && (
        <button type="button" className="chip chip-clear" onClick={() => updateSettings({ fieldFilters: {} })}>
          {t('filter.clearAll')}
        </button>
      )}
    </div>
  )
}
