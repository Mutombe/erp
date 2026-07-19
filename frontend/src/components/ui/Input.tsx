import { forwardRef, useState, useRef, useEffect, useCallback, useMemo, useId, InputHTMLAttributes, TextareaHTMLAttributes, ComponentType } from 'react'
import { ChevronDown, Check, Search, X } from 'lucide-react'
import { cn } from '../../lib/utils'
import { AnimatePresence, motion } from 'framer-motion'

type IconComponent = ComponentType<{ className?: string }>

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
  hint?: string
  icon?: IconComponent
  iconPosition?: 'left' | 'right'
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, hint, icon: Icon, iconPosition = 'left', id, ...props }, ref) => {
    const autoId = useId()
    const inputId = id || autoId
    return (
      <div className="space-y-1.5">
        {label && (
          <label htmlFor={inputId} className="block text-sm font-medium text-gray-700">
            {label}
            {props.required && <span className="text-red-500 ml-1">*</span>}
          </label>
        )}
        <div className="relative">
          {Icon && iconPosition === 'left' && (
            <Icon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          )}
          <input
            ref={ref}
            id={inputId}
            className={cn(
              'w-full px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm text-gray-900 transition-all duration-200',
              'placeholder:text-gray-400',
              'focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent',
              'disabled:bg-gray-50 disabled:text-gray-500 disabled:cursor-not-allowed',
              'dark:bg-slate-900 dark:border-slate-600 dark:text-slate-200 dark:placeholder:text-slate-500 dark:disabled:bg-slate-800',
              error && 'border-red-300 focus:ring-red-500',
              Icon && iconPosition === 'left' && 'pl-10',
              Icon && iconPosition === 'right' && 'pr-10',
              className
            )}
            {...props}
          />
          {Icon && iconPosition === 'right' && (
            <Icon className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          )}
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        {hint && !error && <p className="text-sm text-gray-500">{hint}</p>}
      </div>
    )
  }
)

Input.displayName = 'Input'

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string
  error?: string
  hint?: string
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, label, error, hint, id, ...props }, ref) => {
    const autoId = useId()
    const inputId = id || autoId
    return (
      <div className="space-y-1.5">
        {label && (
          <label htmlFor={inputId} className="block text-sm font-medium text-gray-700">
            {label}
            {props.required && <span className="text-red-500 ml-1">*</span>}
          </label>
        )}
        <textarea
          ref={ref}
          id={inputId}
          className={cn(
            'w-full px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm text-gray-900 transition-all duration-200',
            'placeholder:text-gray-400 resize-none',
            'focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent',
            'disabled:bg-gray-50 disabled:text-gray-500 disabled:cursor-not-allowed',
            'dark:bg-slate-900 dark:border-slate-600 dark:text-slate-200 dark:placeholder:text-slate-500 dark:disabled:bg-slate-800',
            error && 'border-red-300 focus:ring-red-500',
            className
          )}
          {...props}
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
        {hint && !error && <p className="text-sm text-gray-500">{hint}</p>}
      </div>
    )
  }
)

Textarea.displayName = 'Textarea'

interface SelectOption {
  value: string
  label: string
}

interface SelectProps {
  label?: string
  error?: string
  hint?: string
  options?: SelectOption[]
  placeholder?: string
  value?: string | number
  defaultValue?: string | number
  onChange?: (e: { target: { value: string; name?: string } }) => void
  required?: boolean
  disabled?: boolean
  name?: string
  id?: string
  className?: string
  children?: React.ReactNode
  searchable?: boolean
}

export function Select({
  className,
  label,
  error,
  hint,
  options,
  placeholder,
  value: controlledValue,
  defaultValue,
  onChange,
  required,
  disabled,
  name,
  id,
  children,
  searchable = false,
}: SelectProps) {
  const autoId = useId()
  const selectId = id || autoId
  const [internalValue, setInternalValue] = useState(String(defaultValue ?? ''))
  const value = controlledValue !== undefined ? controlledValue : internalValue
  const [isOpen, setIsOpen] = useState(false)
  const [highlightedIndex, setHighlightedIndex] = useState(-1)
  const [searchTerm, setSearchTerm] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)

  // Derive options from children if provided (for backward compat with <option> children)
  const derivedOptions: SelectOption[] = (() => {
    if (options) return options
    if (!children) return []
    const items: SelectOption[] = []
    const extractFromChildren = (nodes: React.ReactNode) => {
      const arr = Array.isArray(nodes) ? nodes : [nodes]
      arr.forEach((child: any) => {
        if (!child) return
        if (Array.isArray(child)) {
          extractFromChildren(child)
          return
        }
        if (child.type === 'option' && child.props) {
          items.push({ value: String(child.props.value ?? ''), label: String(child.props.children ?? '') })
        }
        if (child.props?.children && child.type !== 'option') {
          extractFromChildren(child.props.children)
        }
      })
    }
    extractFromChildren(children)
    return items
  })()

  const currentValue = String(value ?? '')
  const selectedOption = derivedOptions.find(opt => opt.value === currentValue)

  const filteredOptions = useMemo(() => {
    if (!searchable || !searchTerm) return derivedOptions
    const q = searchTerm.toLowerCase()
    return derivedOptions.filter(opt => opt.label.toLowerCase().includes(q))
  }, [derivedOptions, searchTerm, searchable])

  // Focus search input when dropdown opens
  useEffect(() => {
    if (isOpen && searchable && searchInputRef.current) {
      searchInputRef.current.focus()
    }
    if (!isOpen) {
      setSearchTerm('')
    }
  }, [isOpen, searchable])

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useEffect(() => {
    if (highlightedIndex >= 0 && listRef.current) {
      const items = listRef.current.querySelectorAll('[data-select-option]')
      const item = items[highlightedIndex] as HTMLElement
      if (item) item.scrollIntoView({ block: 'nearest' })
    }
  }, [highlightedIndex])

  const handleSelect = useCallback((optValue: string) => {
    setInternalValue(optValue)
    if (onChange) {
      onChange({ target: { value: optValue, name } })
    }
    setIsOpen(false)
    setHighlightedIndex(-1)
  }, [onChange, name])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!isOpen) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
        e.preventDefault()
        setIsOpen(true)
      }
      return
    }
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setHighlightedIndex(prev => prev < filteredOptions.length - 1 ? prev + 1 : 0)
        break
      case 'ArrowUp':
        e.preventDefault()
        setHighlightedIndex(prev => prev > 0 ? prev - 1 : filteredOptions.length - 1)
        break
      case 'Enter':
        e.preventDefault()
        if (highlightedIndex >= 0 && highlightedIndex < filteredOptions.length) {
          handleSelect(filteredOptions[highlightedIndex].value)
        }
        break
      case 'Escape':
        e.preventDefault()
        setIsOpen(false)
        setHighlightedIndex(-1)
        break
    }
  }, [isOpen, filteredOptions, highlightedIndex, handleSelect])

  return (
    <div className={cn('relative', className)} ref={containerRef} onKeyDown={handleKeyDown}>
      {label && (
        <label htmlFor={selectId} className="block text-sm font-medium text-gray-700 mb-1.5">
          {label}
          {required && <span className="text-red-500 ml-1">*</span>}
        </label>
      )}
      {name && <input type="hidden" name={name} value={currentValue} />}
      <button
        id={selectId}
        type="button"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        role="combobox"
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        className={cn(
          'w-full flex items-center justify-between px-4 py-2.5 text-left text-sm bg-white border rounded-xl transition-all duration-200',
          isOpen ? 'border-primary-500 ring-2 ring-primary-100' : 'border-gray-200 hover:border-gray-300',
          disabled && 'opacity-50 cursor-not-allowed bg-gray-50',
          error && 'border-red-300 focus:ring-red-100',
          'dark:bg-slate-900 dark:border-slate-600 dark:text-slate-200'
        )}
      >
        <span className={cn('truncate', !selectedOption && 'text-gray-400')}>
          {selectedOption ? selectedOption.label : (placeholder || 'Select...')}
        </span>
        <ChevronDown className={cn(
          'w-4 h-4 text-gray-400 transition-transform shrink-0 ml-2',
          isOpen && 'rotate-180'
        )} />
      </button>

      {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
      {hint && !error && <p className="mt-1 text-sm text-gray-500">{hint}</p>}

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.97 }}
            transition={{ duration: 0.15 }}
            className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden dark:bg-slate-900 dark:border-slate-600"
          >
            {searchable && (
              <div className="p-2 border-b border-gray-100 dark:border-slate-700">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    ref={searchInputRef}
                    type="text"
                    placeholder="Search..."
                    value={searchTerm}
                    onChange={(e) => { setSearchTerm(e.target.value); setHighlightedIndex(-1) }}
                    onKeyDown={handleKeyDown}
                    className="w-full pl-9 pr-8 py-2 text-sm bg-white border border-gray-200 rounded-lg focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500 dark:bg-slate-900 dark:border-slate-600 dark:text-slate-200 dark:placeholder:text-slate-500"
                  />
                  {searchTerm && (
                    <button
                      type="button"
                      onClick={() => { setSearchTerm(''); setHighlightedIndex(-1) }}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </div>
            )}
            <div className="max-h-60 overflow-y-auto p-1" ref={listRef} role="listbox">
              {filteredOptions.length === 0 ? (
                <div className="px-3 py-2.5 text-sm text-gray-400 text-center">No options found</div>
              ) : filteredOptions.map((option, index) => (
                <button
                  key={option.value}
                  type="button"
                  data-select-option
                  onClick={() => handleSelect(option.value)}
                  onMouseEnter={() => setHighlightedIndex(index)}
                  className={cn(
                    'w-full flex items-center justify-between px-3 py-2.5 text-left text-sm rounded-lg transition-colors',
                    option.value === currentValue
                      ? 'bg-primary-50 text-primary-700 font-medium dark:bg-primary-900/30 dark:text-primary-300'
                      : index === highlightedIndex
                        ? 'bg-gray-100 text-gray-900 dark:bg-slate-700 dark:text-slate-200'
                        : 'text-gray-700 hover:bg-gray-50 dark:text-slate-300 dark:hover:bg-slate-800'
                  )}
                >
                  <span className="truncate">{option.label}</span>
                  {option.value === currentValue && (
                    <Check className="w-4 h-4 text-primary-600 shrink-0 ml-2" />
                  )}
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

interface FormGroupProps {
  children: React.ReactNode
  className?: string
}

export function FormRow({ children, className }: FormGroupProps) {
  return (
    <div className={cn('grid grid-cols-1 md:grid-cols-2 gap-4', className)}>
      {children}
    </div>
  )
}

export function FormSection({ children, className }: FormGroupProps) {
  return <div className={cn('space-y-4', className)}>{children}</div>
}
