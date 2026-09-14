import { useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

interface Props {
  text: string
  children: ReactNode
  /** Render as a block element (e.g. around a heading) instead of inline. */
  block?: boolean
}

/** Wraps a label or value; hovering, focusing or tapping shows an explanation of source and method. */
export default function Hint({ text, children, block }: Props) {
  const [pos, setPos] = useState<{ x: number; y: number; below: boolean } | null>(null)
  const show = (el: HTMLElement) => {
    const r = el.getBoundingClientRect()
    const below = r.top < 120
    setPos({ x: Math.min(Math.max(r.left + r.width / 2, 150), window.innerWidth - 150), y: below ? r.bottom + 6 : r.top - 6, below })
  }
  const hide = () => setPos(null)
  const Tag = block ? 'div' : 'span'
  return (
    <>
      <Tag
        className="hint"
        tabIndex={0}
        onMouseEnter={(e) => show(e.currentTarget)}
        onMouseLeave={hide}
        onFocus={(e) => show(e.currentTarget)}
        onBlur={hide}
        onTouchStart={(e) => (pos ? hide() : show(e.currentTarget))}
        aria-label={text}
      >
        {children}
      </Tag>
      {pos &&
        createPortal(
          <div className={`hint-pop${pos.below ? ' below' : ''}`} style={{ left: pos.x, top: pos.y }} role="tooltip">
            {text}
          </div>,
          document.body,
        )}
    </>
  )
}
