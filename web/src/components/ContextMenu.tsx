import { useEffect } from 'react'
import { operatorsOf, type LocalityProps } from '../lib/localities'
import { updateSettings, useSettings } from '../lib/settings'
import { useT } from '../lib/i18n'

export interface MenuState {
  x: number
  y: number
  locality: LocalityProps | null
}

interface Props {
  menu: MenuState | null
  onClose: () => void
}

/** Right-click menu on the map: select a locality's operator(s) or clear the selection. */
export default function ContextMenu({ menu, onClose }: Props) {
  const t = useT()
  const s = useSettings()
  useEffect(() => {
    if (!menu) return
    const close = () => onClose()
    const key = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('mousedown', close)
    window.addEventListener('keydown', key)
    return () => {
      window.removeEventListener('mousedown', close)
      window.removeEventListener('keydown', key)
    }
  }, [menu, onClose])
  if (!menu) return null
  const ops = menu.locality ? operatorsOf(menu.locality) : []
  const select = (op: string) => {
    if (!s.operatorFilter.includes(op)) updateSettings({ operatorFilter: [...s.operatorFilter, op] })
    onClose()
  }
  const items = [
    ...ops.map((op) => ({ label: s.operatorFilter.includes(op) ? t('ctx.selected', { op }) : t('ctx.select', { op }), run: () => select(op), disabled: s.operatorFilter.includes(op) })),
    { label: t('ctx.clear'), run: () => { updateSettings({ operatorFilter: [] }); onClose() }, disabled: s.operatorFilter.length === 0 },
  ]
  return (
    <div className="ctx-menu" style={{ left: menu.x, top: menu.y }} role="menu" onMouseDown={(e) => e.stopPropagation()}>
      {menu.locality && <div className="ctx-title">{menu.locality.navn} ({menu.locality.loknr})</div>}
      {items.map((it) => (
        <button key={it.label} role="menuitem" disabled={it.disabled} onClick={it.run}>
          {it.label}
        </button>
      ))}
    </div>
  )
}
