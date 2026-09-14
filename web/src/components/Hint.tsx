import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

interface Props {
  text: string
  children: ReactNode
  /** Render as a block element (e.g. around a chart) instead of inline. */
  block?: boolean
}

/** Wraps a label or value; hovering, focusing or tapping shows an explanation of source and method. */
export default function Hint({ text, children, block }: Props) {
  const [anchor, setAnchor] = useState<DOMRect | null>(null)
  const pop = useRef<HTMLDivElement>(null)
  const [style, setStyle] = useState<{ left: number; top: number }>({ left: 0, top: 0 })

  useLayoutEffect(() => {
    if (!anchor || !pop.current) return
    const r = pop.current.getBoundingClientRect()
    const left = Math.min(Math.max(anchor.left + anchor.width / 2 - r.width / 2, 8), window.innerWidth - r.width - 8)
    const above = anchor.top - r.height - 6
    const top = above >= 8 ? above : Math.min(anchor.bottom + 6, window.innerHeight - r.height - 8)
    setStyle({ left, top })
  }, [anchor])

  const show = (el: HTMLElement) => setAnchor(el.getBoundingClientRect())
  const hide = () => setAnchor(null)
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
        onTouchStart={(e) => (anchor ? hide() : show(e.currentTarget))}
        aria-label={text}
      >
        {children}
      </Tag>
      {anchor &&
        createPortal(
          <div ref={pop} className="hint-pop" style={style} role="tooltip">
            {text}
          </div>,
          document.body,
        )}
    </>
  )
}
