import { motion, AnimatePresence } from 'framer-motion'
import { X } from 'lucide-react'
import { ReactNode, ComponentType, useRef, useEffect, useId } from 'react'
import { useFocusTrap } from '../../hooks/useFocusTrap'

type IconComponent = ComponentType<{ className?: string }>

interface ModalProps {
  isOpen?: boolean
  open?: boolean // Allow both isOpen and open for flexibility
  onClose: () => void
  title: string
  description?: string
  children: ReactNode
  size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl' | '4xl' | '5xl' | '6xl' | 'full' | 'wide'
  showClose?: boolean
  icon?: IconComponent
}

// Tailwind max-width tokens. Larger sizes are useful for wide data
// tables (commissions grid, etc.) where the cramped default would
// force horizontal scrolling. The viewport p-4 wrapper still keeps
// the modal off the edges on narrow screens.
const sizeClasses = {
  sm: 'max-w-sm',     // 384px
  md: 'max-w-md',     // 448px
  lg: 'max-w-lg',     // 512px
  xl: 'max-w-xl',     // 576px
  '2xl': 'max-w-2xl', // 672px
  '3xl': 'max-w-3xl', // 768px
  '4xl': 'max-w-4xl', // 896px
  '5xl': 'max-w-5xl', // 1024px — fits a 6-col commissions grid comfortably
  '6xl': 'max-w-6xl', // 1152px
  full: 'max-w-4xl',  // legacy alias — kept for backwards compat
  // Viewport-proportional: ≥75% of the screen on desktop so wide working
  // surfaces (journal entry lines with long account names, descriptions and
  // amounts) aren't squeezed. Near-full width on small screens.
  wide: 'max-w-[95vw] lg:max-w-[80vw] xl:max-w-[75vw]',
}

export function Modal({
  isOpen,
  open,
  onClose,
  title,
  description,
  children,
  size = 'md',
  showClose = true,
  icon: Icon,
}: ModalProps) {
  // Support both isOpen and open props
  const isVisible = isOpen ?? open ?? false
  const modalRef = useRef<HTMLDivElement>(null)
  const titleId = useId()
  const descId = useId()

  // Focus trap: keep Tab within the modal
  useFocusTrap(modalRef, isVisible)

  // Close on Escape key
  useEffect(() => {
    if (!isVisible) return
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleEsc)
    return () => document.removeEventListener('keydown', handleEsc)
  }, [isVisible, onClose])

  return (
    <AnimatePresence>
      {isVisible && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
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
              ref={modalRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby={titleId}
              aria-describedby={description ? descId : undefined}
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ type: 'spring', duration: 0.3 }}
              className={`relative bg-white rounded-2xl shadow-xl w-full ${sizeClasses[size]}`}
            >
              {/* Header */}
              <div className="flex items-start justify-between p-6 border-b border-gray-100">
                <div className="flex items-center gap-3">
                  {Icon && (
                    <div className="w-10 h-10 rounded-xl bg-primary-50 flex items-center justify-center">
                      <Icon className="w-5 h-5 text-primary-600" />
                    </div>
                  )}
                  <div>
                    <h2 id={titleId} className="text-xl font-semibold text-gray-900">{title}</h2>
                    {description && (
                      <p id={descId} className="mt-1 text-sm text-gray-500">{description}</p>
                    )}
                  </div>
                </div>
                {showClose && (
                  <button
                    onClick={onClose}
                    className="p-2 -m-2 rounded-lg hover:bg-gray-100 transition-colors"
                    aria-label="Close dialog"
                  >
                    <X className="w-5 h-5 text-gray-400" />
                  </button>
                )}
              </div>

              {/* Content */}
              <div className="p-6">{children}</div>
            </motion.div>
          </div>
        </div>
      )}
    </AnimatePresence>
  )
}

interface ModalFooterProps {
  children: ReactNode
}

export function ModalFooter({ children }: ModalFooterProps) {
  return (
    <div className="flex items-center justify-end gap-3 pt-6 mt-6 border-t border-gray-100">
      {children}
    </div>
  )
}
