import { ReactNode, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronDown } from 'lucide-react'
import { cn } from '../../lib/utils'

/** Simple controlled or uncontrolled accordion section.
 *
 *  Renders:
 *    [▾] Title                                   right slot (badge / total)
 *    ─────────────────────────────────────────
 *    children (when open)
 *
 *  Default-open is the common case for financial reports — users want
 *  to see numbers at a glance and only collapse sections they don't
 *  care about — so `defaultOpen` defaults to true.
 */
export function Accordion({
  title,
  right,
  defaultOpen = true,
  open: controlledOpen,
  onOpenChange,
  headerClassName,
  bodyClassName,
  className,
  children,
}: {
  title: ReactNode
  right?: ReactNode
  defaultOpen?: boolean
  open?: boolean
  onOpenChange?: (open: boolean) => void
  headerClassName?: string
  bodyClassName?: string
  className?: string
  children: ReactNode
}) {
  const [internalOpen, setInternalOpen] = useState(defaultOpen)
  const isControlled = controlledOpen !== undefined
  const open = isControlled ? controlledOpen : internalOpen

  const toggle = () => {
    const next = !open
    if (!isControlled) setInternalOpen(next)
    onOpenChange?.(next)
  }

  return (
    <div className={cn('rounded-xl border border-gray-200 overflow-hidden bg-white', className)}>
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className={cn(
          'w-full flex items-center gap-3 px-5 py-3 text-left transition-colors',
          'hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-inset',
          headerClassName,
        )}
      >
        <ChevronDown
          className={cn(
            'w-4 h-4 text-gray-400 shrink-0 transition-transform duration-200',
            open && 'rotate-180',
          )}
        />
        <span className="flex-1 min-w-0 font-semibold text-sm">{title}</span>
        {right && <span className="shrink-0">{right}</span>}
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="content"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            className="overflow-hidden"
          >
            <div className={cn('border-t border-gray-100', bodyClassName)}>{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
