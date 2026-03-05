import type { KeyboardEvent as ReactKeyboardEvent, MouseEvent as ReactMouseEvent } from 'react'
import { useEffect, useRef, useState } from 'react'

type InfoTipProps = {
  text: string
}

export function InfoTip({ text }: InfoTipProps) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLSpanElement | null>(null)

  function toggle(ev: ReactMouseEvent | ReactKeyboardEvent) {
    ev.preventDefault()
    ev.stopPropagation()
    setOpen((v) => !v)
  }

  useEffect(() => {
    if (!open) return

    const onDoc = (ev: MouseEvent) => {
      if (!wrapRef.current) return
      if (!wrapRef.current.contains(ev.target as Node)) setOpen(false)
    }
    const onEsc = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') setOpen(false)
    }

    window.addEventListener('mousedown', onDoc)
    window.addEventListener('keydown', onEsc)
    return () => {
      window.removeEventListener('mousedown', onDoc)
      window.removeEventListener('keydown', onEsc)
    }
  }, [open])

  return (
    <span className="info-tip" ref={wrapRef}>
      <span
        role="button"
        tabIndex={0}
        className="info-tip-btn"
        aria-label="Info"
        aria-expanded={open}
        onMouseDown={(ev) => {
          ev.preventDefault()
          ev.stopPropagation()
        }}
        onClick={toggle}
        onKeyDown={(ev) => {
          if (ev.key === 'Enter' || ev.key === ' ') {
            toggle(ev)
          }
        }}
      >
        i
      </span>
      {open && <span className="info-tip-popover">{text}</span>}
    </span>
  )
}
