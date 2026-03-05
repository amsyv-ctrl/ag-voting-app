import { useEffect, useState } from 'react'

type StripeModalProps = {
  isOpen: boolean
  url: string | null
  onClose: () => void
}

export function StripeModal({ isOpen, url, onClose }: StripeModalProps) {
  const [loaded, setLoaded] = useState(false)
  const [showFallback, setShowFallback] = useState(false)

  useEffect(() => {
    if (!isOpen) return

    setLoaded(false)
    setShowFallback(false)

    const onEsc = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') onClose()
    }

    const timeout = window.setTimeout(() => {
      if (!loaded) setShowFallback(true)
    }, 4500)

    window.addEventListener('keydown', onEsc)
    return () => {
      window.removeEventListener('keydown', onEsc)
      window.clearTimeout(timeout)
    }
  }, [isOpen, loaded, onClose])

  if (!isOpen || !url) return null

  return (
    <div className="stripe-modal-backdrop" onClick={onClose} role="presentation">
      <div
        className="stripe-modal"
        onClick={(ev) => ev.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Stripe checkout"
      >
        <button type="button" className="stripe-modal-close" onClick={onClose} aria-label="Close">
          ×
        </button>
        {!loaded && (
          <div className="stripe-modal-loading">
            <span className="spinner" aria-hidden="true" />
            <p>Loading secure Stripe window...</p>
          </div>
        )}
        <iframe
          title="Stripe"
          src={url}
          className="stripe-modal-frame"
          allow="payment *"
          onLoad={() => setLoaded(true)}
        />
        {showFallback && (
          <div className="stripe-modal-fallback">
            <p>Stripe blocked embedded mode in this browser.</p>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => window.open(url, '_blank', 'noopener,noreferrer')}
            >
              Open in new tab
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
