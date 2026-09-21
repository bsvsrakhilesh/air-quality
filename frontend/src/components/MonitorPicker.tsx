import { Check, ChevronDown } from 'lucide-react'
import type { Monitor } from '../types'

interface Props {
  monitors: Monitor[]
  selected: string[]
  metric: string
  onChange: (ids: string[]) => void
}

export function MonitorPicker({ monitors, selected, metric, onChange }: Props) {
  const available = monitors.filter((monitor) => monitor.metrics.includes(metric))
  const label = selected.length === 0
    ? 'Choose datasets'
    : selected.length === 1
      ? monitors.find((monitor) => monitor.id === selected[0])?.name ?? '1 monitor'
      : `${selected.length} datasets`

  const toggle = (id: string) => {
    if (selected.includes(id)) {
      if (selected.length > 1) onChange(selected.filter((item) => item !== id))
    } else {
      onChange([...selected, id])
    }
  }

  return (
    <details className="picker">
      <summary className="control monitor-control">
        <span>{label}</span>
        <ChevronDown size={15} aria-hidden="true" />
      </summary>
      <div className="picker-menu">
        <div className="picker-heading">
          <span>Datasets</span>
          <button type="button" onClick={() => onChange(available.map((monitor) => monitor.id))}>Select all</button>
        </div>
        <div className="picker-options">
          {available.map((monitor) => {
            const checked = selected.includes(monitor.id)
            return (
              <button
                className="picker-option"
                type="button"
                key={monitor.id}
                onClick={() => toggle(monitor.id)}
                aria-pressed={checked}
              >
                <span className={`checkbox ${checked ? 'checked' : ''}`}>
                  {checked && <Check size={12} strokeWidth={2.5} />}
                </span>
                <span className="picker-option-copy">
                  <strong>{monitor.name}</strong>
                  <small>{monitor.rows.toLocaleString()} readings</small>
                </span>
              </button>
            )
          })}
        </div>
      </div>
    </details>
  )
}
