import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useT } from '../lib/i18n'

interface Props {
  text: string
  children: ReactNode
  /** Render as a block element (e.g. around a chart) instead of inline. */
  block?: boolean
}

/**
 * Wraps a label or value; hovering, focusing or tapping shows an explanation of source and method.
 * The popup stays while the pointer is on the label or the popup itself and closes with its ✕, Escape, or leaving both.
 */
export default function Hint({ text, children, block }: Props) {
  const t = useT()
  const [anchor, setAnchor] = useState<DOMRect | null>(null)
  const pop = useRef<HTMLDivElement>(null)
  const timer = useRef<number | undefined>(undefined)
  const [style, setStyle] = useState<{ left: number; top: number }>({ left: 0, top: 0 })

  useLayoutEffect(() => {
    if (!anchor || !pop.current) return
    const r = pop.current.getBoundingClientRect()
    const left = Math.min(Math.max(anchor.left + anchor.width / 2 - r.width / 2, 8), window.innerWidth - r.width - 8)
    const above = anchor.top - r.height - 6
    const top = above >= 8 ? above : Math.min(anchor.bottom + 6, window.innerHeight - r.height - 8)
    setStyle({ left, top })
  }, [anchor])

  const stay = () => window.clearTimeout(timer.current)
  const show = (el: HTMLElement) => {
    stay()
    setAnchor(el.getBoundingClientRect())
  }
  const hide = () => {
    stay()
    setAnchor(null)
  }
  /** Grace period so the pointer can travel from the label into the popup (to its ✕ or a link). */
  const leave = () => {
    stay()
    timer.current = window.setTimeout(() => setAnchor(null), 250)
  }
  useEffect(() => {
    if (!anchor) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && hide()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [anchor])
  const Tag = block ? 'div' : 'span'
  return (
    <>
      <Tag
        className="hint"
        tabIndex={0}
        onMouseEnter={(e) => show(e.currentTarget)}
        onMouseLeave={leave}
        onFocus={(e) => show(e.currentTarget)}
        onBlur={hide}
        onTouchStart={(e) => (anchor ? hide() : show(e.currentTarget))}
        aria-label={text}
      >
        {children}
      </Tag>
      {anchor &&
        createPortal(
          <div ref={pop} className="hint-pop" style={style} role="tooltip" onMouseEnter={stay} onMouseLeave={leave}>
            {text}
            <button type="button" className="hint-close" onClick={hide} aria-label={t('hint.close')} title={t('hint.close')}>
              ✕
            </button>
          </div>,
          document.body,
        )}
    </>
  )
}
