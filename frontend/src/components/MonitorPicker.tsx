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
      if (selected.length < 10) onChange([...selected, id])
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
          <span>Datasets · up to 10</span>
          <button type="button" onClick={() => onChange(available.slice(0, 10).map((monitor) => monitor.id))}>{available.length > 10 ? 'Select first 10' : 'Select all'}</button>
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
                disabled={!checked && selected.length >= 10}
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
