import type { KeyboardEvent as ReactKeyboardEvent, MouseEvent as ReactMouseEvent } from 'react'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

type InfoTipProps = {
  text: string
}

export function InfoTip({ text }: InfoTipProps) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLSpanElement | null>(null)
  const btnRef = useRef<HTMLSpanElement | null>(null)
  const [position, setPosition] = useState<{ top: number; left: number; width: number }>({
    top: 0,
    left: 0,
    width: 280
  })

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

  useLayoutEffect(() => {
    if (!open || !btnRef.current) return

    const updatePosition = () => {
      if (!btnRef.current) return
      const rect = btnRef.current.getBoundingClientRect()
      const viewportWidth = window.innerWidth
      const viewportHeight = window.innerHeight
      const preferredWidth = Math.min(320, Math.max(220, viewportWidth - 24))
      const estimatedHeight = 88
      const left = Math.min(
        Math.max(12, rect.left + rect.width / 2 - preferredWidth / 2),
        viewportWidth - preferredWidth - 12
      )
      const showAbove = rect.bottom + estimatedHeight + 18 > viewportHeight && rect.top - estimatedHeight - 12 > 0
      const top = showAbove ? rect.top - estimatedHeight - 10 : rect.bottom + 10
      setPosition({ top, left, width: preferredWidth })
    }

    updatePosition()
    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)
    return () => {
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
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
        ref={btnRef}
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
      {open && typeof document !== 'undefined'
        ? createPortal(
            <span
              className="info-tip-popover"
              style={{
                position: 'fixed',
                top: `${position.top}px`,
                left: `${position.left}px`,
                width: `${position.width}px`
              }}
              role="tooltip"
            >
              {text}
            </span>,
            document.body
          )
        : null}
    </span>
  )
}
