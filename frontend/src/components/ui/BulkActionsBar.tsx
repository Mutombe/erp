import { motion, AnimatePresence } from 'framer-motion'
import { X } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

type ActionVariant = 'primary' | 'danger' | 'outline'

interface BulkAction {
  label: string
  icon?: LucideIcon
  onClick: () => void
  variant?: ActionVariant
  disabled?: boolean
  loading?: boolean
}

interface BulkActionsBarProps {
  selectedCount: number
  onClearSelection: () => void
  actions: BulkAction[]
  entityName?: string
}

const variantClasses: Record<ActionVariant, string> = {
  primary: 'bg-white text-gray-900 hover:bg-gray-100',
  danger: 'bg-red-500 text-white hover:bg-red-600',
  outline: 'border border-gray-500 text-white hover:bg-white/10',
}

export function BulkActionsBar({
  selectedCount,
  onClearSelection,
  actions,
  entityName = 'items',
}: BulkActionsBarProps) {
  return (
    <AnimatePresence>
      {selectedCount > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 40 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40"
        >
          <div className="flex items-center gap-3 bg-gray-900 text-white px-5 py-3 rounded-full shadow-2xl">
            <span className="text-sm font-medium whitespace-nowrap">
              {selectedCount} {entityName} selected
            </span>

            <div className="w-px h-5 bg-gray-600" />

            <div className="flex items-center gap-2">
              {actions.map((action) => {
                const Icon = action.icon
                const variant = action.variant || 'outline'
                return (
                  <button
                    key={action.label}
                    onClick={action.onClick}
                    disabled={action.disabled || action.loading}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-full transition-colors disabled:opacity-50 ${variantClasses[variant]}`}
                  >
                    {action.loading ? (
                      <div className="w-3.5 h-3.5 border-2 border-current/30 border-t-current rounded-full animate-spin" />
                    ) : Icon ? (
                      <Icon className="w-3.5 h-3.5" />
                    ) : null}
                    {action.label}
                  </button>
                )
              })}
            </div>

            <button
              onClick={onClearSelection}
              className="p-1.5 hover:bg-white/10 rounded-full transition-colors ml-1"
              title="Clear selection"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
