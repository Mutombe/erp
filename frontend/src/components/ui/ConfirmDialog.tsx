import { motion, AnimatePresence } from 'framer-motion'
import { AlertTriangle, Trash2, X, CheckCircle, AlertCircle, Info } from 'lucide-react'
import { ReactNode, useRef, useId } from 'react'
import { useFocusTrap } from '../../hooks/useFocusTrap'

type DialogType = 'danger' | 'warning' | 'success' | 'info'

interface ConfirmDialogProps {
  isOpen?: boolean
  open?: boolean  // Alias for isOpen
  onClose: () => void
  onConfirm: () => void
  title: string
  message?: string | ReactNode
  description?: string  // Alias for message
  confirmText?: string
  cancelText?: string
  type?: DialogType
  variant?: string  // Alias for type
  isLoading?: boolean
  loading?: boolean  // Alias for isLoading
}

const typeConfig: Record<DialogType, { icon: typeof AlertTriangle; color: string; bgColor: string; buttonClass: string }> = {
  danger: {
    icon: Trash2,
    color: 'text-red-600',
    bgColor: 'bg-red-100',
    buttonClass: 'bg-red-600 hover:bg-red-700 focus:ring-red-500',
  },
  warning: {
    icon: AlertTriangle,
    color: 'text-amber-600',
    bgColor: 'bg-amber-100',
    buttonClass: 'bg-amber-600 hover:bg-amber-700 focus:ring-amber-500',
  },
  success: {
    icon: CheckCircle,
    color: 'text-green-600',
    bgColor: 'bg-green-100',
    buttonClass: 'bg-green-600 hover:bg-green-700 focus:ring-green-500',
  },
  info: {
    icon: Info,
    color: 'text-blue-600',
    bgColor: 'bg-blue-100',
    buttonClass: 'bg-blue-600 hover:bg-blue-700 focus:ring-blue-500',
  },
}

// Map common variant names to our dialog types
const variantMap: Record<string, DialogType> = {
  danger: 'danger',
  destructive: 'danger',
  error: 'danger',
  warning: 'warning',
  warn: 'warning',
  success: 'success',
  info: 'info',
  default: 'info',
}

export function ConfirmDialog({
  isOpen,
  open,
  onClose,
  onConfirm,
  title,
  message,
  description,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  type,
  variant,
  isLoading,
  loading,
}: ConfirmDialogProps) {
  const showDialog = isOpen ?? open ?? false
  const displayMessage = message || description
  const showLoading = isLoading ?? loading ?? false
  const dialogRef = useRef<HTMLDivElement>(null)
  const titleId = useId()

  // Resolve the dialog type with fallback
  const rawType = type || variant || 'danger'
  const dialogType: DialogType = variantMap[rawType] || 'danger'
  const config = typeConfig[dialogType] || typeConfig.danger
  const Icon = config.icon

  // Focus trap
  useFocusTrap(dialogRef, showDialog)

  return (
    <AnimatePresence>
      {showDialog && (
        <div
          className="fixed inset-0 z-50 overflow-y-auto"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby={titleId}
        >
          <div className="flex min-h-full items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/50 backdrop-blur-sm"
              onClick={onClose}
              aria-hidden="true"
            />

            <motion.div
              ref={dialogRef}
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ type: 'spring', duration: 0.3 }}
              className="relative bg-white rounded-2xl shadow-xl max-w-md w-full p-6"
            >
              <button
                onClick={onClose}
                className="absolute top-4 right-4 p-1 rounded-lg hover:bg-gray-100 transition-colors"
                aria-label="Close dialog"
              >
                <X className="w-5 h-5 text-gray-400" />
              </button>

              <div className="flex items-start gap-4">
                <div className={`p-3 rounded-full ${config.bgColor}`}>
                  <Icon className={`w-6 h-6 ${config.color}`} />
                </div>
                <div className="flex-1 pt-1">
                  <h3 id={titleId} className="text-lg font-semibold text-gray-900">{title}</h3>
                  <div className="mt-2 text-gray-600">{displayMessage}</div>
                </div>
              </div>

              <div className="mt-6 flex gap-3 justify-end">
                <button
                  onClick={onClose}
                  disabled={showLoading}
                  className="px-4 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 transition-colors disabled:opacity-50"
                >
                  {cancelText}
                </button>
                <button
                  onClick={onConfirm}
                  disabled={showLoading}
                  className={`px-4 py-2.5 text-sm font-medium text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-offset-2 transition-colors disabled:opacity-50 flex items-center gap-2 ${config.buttonClass}`}
                >
                  {showLoading && (
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  )}
                  {confirmText}
                </button>
              </div>
            </motion.div>
          </div>
        </div>
      )}
    </AnimatePresence>
  )
}
