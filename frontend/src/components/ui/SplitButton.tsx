import { useState, useRef, useEffect, ReactNode, ComponentType } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '../../lib/utils'
import { AnimatePresence, motion } from 'framer-motion'

export interface SplitButtonMenuItem {
  label: string
  icon?: ComponentType<{ className?: string }>
  onClick: () => void
  disabled?: boolean
}

interface SplitButtonProps {
  children: ReactNode
  onClick: () => void
  menuItems: SplitButtonMenuItem[]
  className?: string
  disabled?: boolean
}

export function SplitButton({ children, onClick, menuItems, className, disabled }: SplitButtonProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  return (
    <div ref={ref} className="relative inline-flex">
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className={cn(
          'inline-flex items-center gap-2 font-medium rounded-l-lg transition-all duration-200',
          'px-4 py-2.5 text-sm',
          'bg-primary-600 text-white hover:bg-primary-700',
          'focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500',
          'disabled:opacity-50 disabled:cursor-not-allowed',
          className
        )}
      >
        {children}
      </button>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        disabled={disabled}
        className={cn(
          'inline-flex items-center px-2 rounded-r-lg transition-all duration-200',
          'bg-primary-600 text-white hover:bg-primary-700 border-l border-primary-500',
          'focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500',
          'disabled:opacity-50 disabled:cursor-not-allowed'
        )}
      >
        <ChevronDown className={cn('w-4 h-4 transition-transform', open && 'rotate-180')} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 top-full mt-1.5 z-50 w-52 bg-white rounded-lg shadow-lg border border-gray-200 py-1 overflow-hidden"
          >
            {menuItems.map((item, i) => {
              const Icon = item.icon
              return (
                <button
                  key={i}
                  onClick={() => {
                    setOpen(false)
                    item.onClick()
                  }}
                  disabled={item.disabled}
                  className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {Icon && <Icon className="w-4 h-4 text-gray-400" />}
                  {item.label}
                </button>
              )
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
