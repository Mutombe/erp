import { useState, type ReactNode } from 'react'
import { CaretDown, ChartBar } from '@phosphor-icons/react'

interface ReportChartProps {
  title: string
  /** True when there is nothing to plot — shows a placeholder sized to `height`. */
  isEmpty?: boolean
  emptyLabel?: string
  /** Chart body height in px (the placeholder matches it so nothing jumps). */
  height?: number
  /** Hint shown on the right of the header, e.g. "Click a bar to drill in". */
  hint?: string
  children: ReactNode
}

/**
 * Compact, collapsible frame that sits above a report's table. Keeps the
 * chart from crowding the numbers and reserves its height whether it's
 * expanded, empty or loading so the table below never shifts.
 */
/** Compact legend for charts whose identity is carried by cell colour. */
export function ChartLegend({ items }: { items: { label: string; color: string }[] }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-2 pb-2 text-xs text-gray-500 dark:text-gray-400">
      {items.map((it) => (
        <span key={it.label} className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: it.color }} />
          {it.label}
        </span>
      ))}
    </div>
  )
}

export default function ReportChart({
  title,
  isEmpty = false,
  emptyLabel = 'Nothing to chart for this selection.',
  height = 240,
  hint,
  children,
}: ReportChartProps) {
  const [open, setOpen] = useState(true)
  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between gap-2 px-4 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800/60 transition-colors"
        aria-expanded={open}
      >
        <span className="flex items-center gap-2">
          <ChartBar className="w-4 h-4 text-gray-400" />
          {title}
        </span>
        <span className="flex items-center gap-2">
          {hint && <span className="hidden sm:inline text-xs font-normal text-gray-400">{hint}</span>}
          <CaretDown className={`w-4 h-4 text-gray-400 transition-transform ${open ? '' : '-rotate-90'}`} />
        </span>
      </button>
      {open && (
        <div className="px-2 pb-3 pt-1">
          {isEmpty ? (
            <div style={{ height }} className="flex items-center justify-center text-gray-400 text-sm">
              {emptyLabel}
            </div>
          ) : (
            <div style={{ height }}>{children}</div>
          )}
        </div>
      )}
    </div>
  )
}
