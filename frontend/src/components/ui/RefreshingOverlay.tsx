import type { ReactNode } from 'react'
import { cn } from '../../lib/utils'

interface RefreshingOverlayProps {
  /** True while a background refetch is in flight AND data is already on screen. */
  active: boolean
  className?: string
}

/**
 * A subtle "this region is refreshing" affordance.
 *
 * Renders a thin indeterminate progress bar pinned to the top of the nearest
 * positioned ancestor. It never replaces content and never occupies layout
 * space, so paginating a table or switching a filter cannot cause a shift.
 *
 * The parent MUST be `relative`. Pair it with `refreshingContentClass(active)`
 * on the content itself to dim it slightly while the new data loads.
 *
 *   <div className="relative">
 *     <RefreshingOverlay active={isFetching && !!data} />
 *     <div className={refreshingContentClass(isFetching && !!data)}>…</div>
 *   </div>
 */
export function RefreshingOverlay({ active, className }: RefreshingOverlayProps) {
  if (!active) return null

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="Refreshing"
      className={cn(
        'pointer-events-none absolute inset-x-0 top-0 z-20 h-0.5 overflow-hidden rounded-t-xl',
        'bg-primary-100/60 dark:bg-slate-700/60',
        className
      )}
    >
      <div className="h-full w-1/3 -translate-x-full rounded-full bg-primary-600 animate-shimmer dark:bg-ocean-400" />
    </div>
  )
}

/**
 * ClassName for the content being refreshed: a slight, animated dim.
 * Deliberately mild — the data stays readable and interactive.
 */
export function refreshingContentClass(active: boolean, base?: string): string {
  return cn('transition-opacity duration-200', active && 'opacity-60', base)
}

/**
 * Convenience wrapper for the common case: a relative container that owns both
 * the bar and the dimmed content.
 */
export function RefreshingRegion({
  active,
  children,
  className,
}: {
  active: boolean
  children: ReactNode
  className?: string
}) {
  return (
    <div className={cn('relative', className)}>
      <RefreshingOverlay active={active} />
      <div className={refreshingContentClass(active)}>{children}</div>
    </div>
  )
}
