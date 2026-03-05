import { useEffect, useRef, useState } from 'react'

type InfoTipProps = {
  text: string
}

export function InfoTip({ text }: InfoTipProps) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLSpanElement | null>(null)

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
      <button
        type="button"
        className="info-tip-btn"
        aria-label="Info"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        i
      </button>
      {open && <span className="info-tip-popover">{text}</span>}
    </span>
  )
}
