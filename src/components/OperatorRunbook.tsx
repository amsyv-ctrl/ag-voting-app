import { useEffect, useMemo, useState } from 'react'

type RunbookContext = 'event' | 'ballot'

type OperatorRunbookProps = {
  context: RunbookContext
  eventId?: string
  ballotId?: string
  round?: number
}

type RunbookItem = {
  id: string
  label: string
}

type RunbookSection = {
  title: string
  items: RunbookItem[]
}

const EVENT_SECTIONS: RunbookSection[] = [
  {
    title: 'BEFORE SESSION',
    items: [
      { id: 'admin_logged_in', label: 'Admin logged in' },
      { id: 'display_open', label: 'Display page opened on projector' },
      { id: 'qr_visible', label: 'QR code visible to delegates' },
      { id: 'pins_distributed', label: 'PIN sheets distributed (if using PINs)' },
      { id: 'smoke_test', label: 'Quick smoke test completed' }
    ]
  }
]

const BALLOT_SECTIONS: RunbookSection[] = [
  {
    title: 'DURING VOTE',
    items: [
      { id: 'announce_open', label: 'Announce vote is open' },
      { id: 'monitor_participation', label: 'Monitor participation counter' },
      { id: 'closing_warning', label: 'Give a "closing soon" warning' }
    ]
  },
  {
    title: 'AFTER CLOSE',
    items: [
      { id: 'confirm_outcome', label: 'Confirm threshold met / runoff required' },
      { id: 'announce_outcome', label: 'Announce outcome' },
      { id: 'export_results', label: 'Export results (if needed)' }
    ]
  }
]

function getStorageKey(props: OperatorRunbookProps): string {
  if (props.context === 'event') {
    return `agv:runbook:event:${props.eventId ?? 'unknown'}`
  }
  return `agv:runbook:ballot:${props.ballotId ?? 'unknown'}:round:${props.round ?? 1}`
}

function getDefaultOpen() {
  if (typeof window === 'undefined') return true
  return window.innerWidth > 640
}

export function OperatorRunbook(props: OperatorRunbookProps) {
  const [checked, setChecked] = useState<Record<string, boolean>>({})
  const [isOpen, setIsOpen] = useState(getDefaultOpen)
  const storageKey = useMemo(() => getStorageKey(props), [props.context, props.eventId, props.ballotId, props.round])

  const sections = props.context === 'event' ? EVENT_SECTIONS : BALLOT_SECTIONS
  const title = props.context === 'event' ? 'Operator Runbook (Event)' : 'Operator Runbook (Ballot)'

  useEffect(() => {
    if (typeof window === 'undefined') return
    const raw = localStorage.getItem(storageKey)
    if (!raw) {
      setChecked({})
      return
    }
    try {
      const parsed = JSON.parse(raw) as Record<string, boolean>
      setChecked(parsed)
    } catch {
      setChecked({})
    }
  }, [storageKey])

  useEffect(() => {
    if (typeof window === 'undefined') return
    localStorage.setItem(storageKey, JSON.stringify(checked))
  }, [checked, storageKey])

  function toggleItem(itemId: string) {
    setChecked((prev) => ({ ...prev, [itemId]: !prev[itemId] }))
  }

  function resetChecklist() {
    setChecked({})
    if (typeof window !== 'undefined') {
      localStorage.removeItem(storageKey)
    }
  }

  return (
    <section className="operator-runbook">
      <details open={isOpen} onToggle={(event) => setIsOpen((event.currentTarget as HTMLDetailsElement).open)}>
        <summary>
          <span>{title}</span>
        </summary>
        <div className="operator-runbook-content">
          {sections.map((section) => (
            <div key={section.title}>
              <p className="operator-runbook-heading">{section.title}</p>
              <ul>
                {section.items.map((item) => (
                  <li key={item.id}>
                    <label>
                      <input
                        type="checkbox"
                        checked={!!checked[item.id]}
                        onChange={() => toggleItem(item.id)}
                      />
                      <span>{item.label}</span>
                    </label>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          <button type="button" className="secondary" onClick={resetChecklist}>
            Reset checklist
          </button>
        </div>
      </details>
    </section>
  )
}
