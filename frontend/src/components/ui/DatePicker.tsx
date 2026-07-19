import { useState, useEffect, useMemo, useRef, useId, useCallback, useLayoutEffect } from 'react'
import { createPortal } from 'react-dom'
import { CaretLeft, CaretRight, Calendar as CalendarIcon, X } from '@phosphor-icons/react'
import { AnimatePresence, motion } from 'framer-motion'
import { cn } from '../../lib/utils'

const WEEKDAY_LABELS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']
const MONTH_LABELS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

interface DatePickerProps {
  value?: string
  onChange?: (value: string) => void
  min?: string
  max?: string
  label?: string
  error?: string
  hint?: string
  required?: boolean
  disabled?: boolean
  placeholder?: string
  name?: string
  id?: string
  className?: string
  clearable?: boolean
}

function parseYmd(value?: string): Date | null {
  if (!value) return null
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value)
  if (!m) return null
  const y = Number(m[1]), mo = Number(m[2]) - 1, d = Number(m[3])
  const dt = new Date(y, mo, d)
  if (dt.getFullYear() !== y || dt.getMonth() !== mo || dt.getDate() !== d) return null
  return dt
}

function toYmd(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function formatDisplay(d: Date): string {
  return `${MONTH_LABELS[d.getMonth()].slice(0, 3)} ${d.getDate()}, ${d.getFullYear()}`
}

function sameDay(a: Date | null, b: Date | null): boolean {
  return !!a && !!b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

export function DatePicker({
  value,
  onChange,
  min,
  max,
  label,
  error,
  hint,
  required,
  disabled,
  placeholder = 'Select date',
  name,
  id,
  className,
  clearable = true,
}: DatePickerProps) {
  const autoId = useId()
  const inputId = id || autoId
  const containerRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [panelStyle, setPanelStyle] = useState<{ top: number; left: number; width: number } | null>(null)

  const selected = useMemo(() => parseYmd(value), [value])
  const minDate = useMemo(() => parseYmd(min), [min])
  const maxDate = useMemo(() => parseYmd(max), [max])
  const today = useMemo(() => {
    const t = new Date()
    return new Date(t.getFullYear(), t.getMonth(), t.getDate())
  }, [])

  const [view, setView] = useState<Date>(() => {
    const seed = selected ?? today
    return new Date(seed.getFullYear(), seed.getMonth(), 1)
  })

  useEffect(() => {
    if (open) {
      const seed = selected ?? today
      setView(new Date(seed.getFullYear(), seed.getMonth(), 1))
    }
  }, [open, selected, today])

  const positionPanel = useCallback(() => {
    if (!triggerRef.current) return
    const r = triggerRef.current.getBoundingClientRect()
    const width = Math.max(r.width, 280)
    const top = r.bottom + 6
    let left = r.left
    const viewportWidth = window.innerWidth
    if (left + width > viewportWidth - 8) left = viewportWidth - width - 8
    if (left < 8) left = 8
    setPanelStyle({ top, left, width })
  }, [])

  useLayoutEffect(() => {
    if (!open) return
    positionPanel()
  }, [open, positionPanel])

  useEffect(() => {
    if (!open) return
    const handle = () => positionPanel()
    window.addEventListener('scroll', handle, true)
    window.addEventListener('resize', handle)
    return () => {
      window.removeEventListener('scroll', handle, true)
      window.removeEventListener('resize', handle)
    }
  }, [open, positionPanel])

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node
      if (containerRef.current?.contains(t)) return
      if (panelRef.current?.contains(t)) return
      setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const daysGrid = useMemo(() => {
    const year = view.getFullYear()
    const month = view.getMonth()
    const firstWeekday = new Date(year, month, 1).getDay()
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    const cells: Array<{ date: Date; inMonth: boolean }> = []
    for (let i = 0; i < firstWeekday; i++) {
      const d = new Date(year, month, -firstWeekday + i + 1)
      cells.push({ date: d, inMonth: false })
    }
    for (let d = 1; d <= daysInMonth; d++) {
      cells.push({ date: new Date(year, month, d), inMonth: true })
    }
    while (cells.length % 7 !== 0) {
      const last = cells[cells.length - 1].date
      cells.push({ date: new Date(last.getFullYear(), last.getMonth(), last.getDate() + 1), inMonth: false })
    }
    while (cells.length < 42) {
      const last = cells[cells.length - 1].date
      cells.push({ date: new Date(last.getFullYear(), last.getMonth(), last.getDate() + 1), inMonth: false })
    }
    return cells
  }, [view])

  const inRange = useCallback((d: Date) => {
    if (minDate && d < minDate) return false
    if (maxDate && d > maxDate) return false
    return true
  }, [minDate, maxDate])

  const pick = (d: Date) => {
    if (!inRange(d)) return
    onChange?.(toYmd(d))
    setOpen(false)
  }

  const stepMonth = (delta: number) => {
    setView(prev => new Date(prev.getFullYear(), prev.getMonth() + delta, 1))
  }
  const stepYear = (delta: number) => {
    setView(prev => new Date(prev.getFullYear() + delta, prev.getMonth(), 1))
  }

  const clear = (e: React.MouseEvent) => {
    e.stopPropagation()
    onChange?.('')
  }

  const wrapped = !!(label || error || hint)

  return (
    <div className={cn(wrapped ? 'space-y-1.5' : 'inline-block', wrapped && className)} ref={containerRef}>
      {label && (
        <label htmlFor={inputId} className="block text-sm font-medium text-gray-700">
          {label}
          {required && <span className="text-red-500 ml-1">*</span>}
        </label>
      )}
      {name && <input type="hidden" name={name} value={value ?? ''} />}
      <button
        ref={triggerRef}
        id={inputId}
        type="button"
        onClick={() => !disabled && setOpen(o => !o)}
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={open}
        className={cn(
          'w-full flex items-center justify-between gap-2 px-4 py-2.5 text-left text-sm bg-white border rounded-xl transition-all duration-200',
          open ? 'border-primary-500 ring-2 ring-primary-100' : 'border-gray-200 hover:border-gray-300',
          disabled && 'opacity-50 cursor-not-allowed bg-gray-50',
          error && 'border-red-300 focus:ring-red-100',
          'dark:bg-slate-900 dark:border-slate-600 dark:text-slate-200',
          !wrapped && className,
        )}
      >
        <span className={cn('flex items-center gap-2 truncate', !selected && 'text-gray-400')}>
          <CalendarIcon className="w-4 h-4 text-gray-400 shrink-0" />
          {selected ? formatDisplay(selected) : placeholder}
        </span>
        {clearable && selected && !disabled ? (
          <span
            role="button"
            tabIndex={-1}
            onClick={clear}
            className="p-0.5 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600"
            aria-label="Clear date"
          >
            <X className="w-3.5 h-3.5" />
          </span>
        ) : (
          <CalendarIcon className="w-4 h-4 text-transparent" aria-hidden />
        )}
      </button>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {hint && !error && <p className="text-sm text-gray-500">{hint}</p>}

      {open && panelStyle && createPortal(
        <AnimatePresence>
          <motion.div
            ref={panelRef}
            initial={{ opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.12 }}
            role="dialog"
            aria-label="Choose date"
            style={{ position: 'fixed', top: panelStyle.top, left: panelStyle.left, width: panelStyle.width, zIndex: 9999 }}
            className="bg-white border border-gray-200 rounded-xl shadow-xl p-3 dark:bg-slate-900 dark:border-slate-700"
          >
            <div className="flex items-center justify-between gap-2 mb-2">
              <div className="flex items-center gap-0.5">
                <button
                  type="button"
                  onClick={() => stepYear(-1)}
                  className="p-1 rounded hover:bg-gray-100 text-gray-500 hover:text-gray-700 dark:hover:bg-slate-800"
                  aria-label="Previous year"
                >
                  <CaretLeft className="w-4 h-4" />
                  <span className="sr-only">Previous year</span>
                </button>
                <button
                  type="button"
                  onClick={() => stepMonth(-1)}
                  className="p-1 rounded hover:bg-gray-100 text-gray-600 hover:text-gray-900 dark:hover:bg-slate-800"
                  aria-label="Previous month"
                >
                  <CaretLeft className="w-4 h-4" />
                </button>
              </div>
              <div className="text-sm font-semibold text-gray-800 dark:text-slate-200 tabular-nums">
                {MONTH_LABELS[view.getMonth()]} {view.getFullYear()}
              </div>
              <div className="flex items-center gap-0.5">
                <button
                  type="button"
                  onClick={() => stepMonth(1)}
                  className="p-1 rounded hover:bg-gray-100 text-gray-600 hover:text-gray-900 dark:hover:bg-slate-800"
                  aria-label="Next month"
                >
                  <CaretRight className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => stepYear(1)}
                  className="p-1 rounded hover:bg-gray-100 text-gray-500 hover:text-gray-700 dark:hover:bg-slate-800"
                  aria-label="Next year"
                >
                  <CaretRight className="w-4 h-4" />
                  <span className="sr-only">Next year</span>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-7 gap-0.5 mb-1">
              {WEEKDAY_LABELS.map(w => (
                <div key={w} className="text-[10px] uppercase tracking-wider text-gray-400 text-center py-1">
                  {w}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-0.5">
              {daysGrid.map(({ date, inMonth }, i) => {
                const enabled = inRange(date)
                const isSelected = sameDay(date, selected)
                const isToday = sameDay(date, today)
                return (
                  <button
                    key={i}
                    type="button"
                    disabled={!enabled}
                    onClick={() => pick(date)}
                    className={cn(
                      'h-8 w-full rounded-md text-xs tabular-nums transition-colors',
                      enabled ? 'cursor-pointer' : 'cursor-not-allowed opacity-30',
                      isSelected && 'bg-primary-600 text-white font-semibold hover:bg-primary-700',
                      !isSelected && isToday && 'ring-1 ring-primary-300 text-primary-700 font-semibold',
                      !isSelected && !isToday && inMonth && 'text-gray-700 hover:bg-gray-100 dark:text-slate-300 dark:hover:bg-slate-800',
                      !isSelected && !inMonth && 'text-gray-300 hover:bg-gray-50 dark:text-slate-600',
                    )}
                  >
                    {date.getDate()}
                  </button>
                )
              })}
            </div>

            <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-100 dark:border-slate-700">
              <button
                type="button"
                onClick={() => pick(today)}
                className="text-xs font-medium text-primary-600 hover:text-primary-700"
              >
                Today
              </button>
              {clearable && selected && (
                <button
                  type="button"
                  onClick={() => { onChange?.(''); setOpen(false) }}
                  className="text-xs font-medium text-gray-500 hover:text-gray-700"
                >
                  Clear
                </button>
              )}
            </div>
          </motion.div>
        </AnimatePresence>,
        document.body,
      )}
    </div>
  )
}

DatePicker.displayName = 'DatePicker'
