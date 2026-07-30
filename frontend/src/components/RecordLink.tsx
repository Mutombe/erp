import type { MouseEvent, ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { cn } from '@/lib/utils'

export interface RecordLinkProps {
  /** Destination detail route, e.g. `/app/students/12`. */
  to: string
  children: ReactNode
  className?: string
  /** Monospace the label — codes, document numbers. */
  mono?: boolean
  /** Right-align-friendly numerals for money / quantities. */
  tabularNums?: boolean
  /**
   * Warm the target's detail cache on hover. Bind a `usePrefetchDetail(...)`
   * call, e.g. `onHoverPrefetch={() => prefetch(row)}`.
   */
  onHoverPrefetch?: () => void
  title?: string
}

/**
 * A styled cross-reference link to another record's detail page.
 *
 * Stops click propagation so it works inside clickable DataTable rows, and can
 * warm the detail cache on hover via `onHoverPrefetch`. Use this everywhere a
 * name / code / number identifies a *different* record that has a detail route.
 */
export default function RecordLink({
  to,
  children,
  className,
  mono,
  tabularNums,
  onHoverPrefetch,
  title,
}: RecordLinkProps) {
  return (
    <Link
      to={to}
      title={title}
      onClick={(e: MouseEvent) => e.stopPropagation()}
      onMouseEnter={onHoverPrefetch}
      className={cn(
        'text-primary-600 dark:text-primary-400 hover:underline',
        mono && 'font-mono',
        tabularNums && 'tabular-nums',
        className
      )}
    >
      {children}
    </Link>
  )
}
