import { useState, ReactNode, createContext, useContext, ComponentType } from 'react'
import { motion } from 'framer-motion'
import { cn } from '../../lib/utils'

type IconComponent = ComponentType<{ className?: string }>

interface TabsContextValue {
  activeTab: string
  setActiveTab: (tab: string) => void
}

const TabsContext = createContext<TabsContextValue | null>(null)

interface TabsProps {
  defaultValue: string
  children: ReactNode
  className?: string
  onChange?: (value: string) => void
}

export function Tabs({ defaultValue, children, className, onChange }: TabsProps) {
  const [activeTab, setActiveTab] = useState(defaultValue)

  const handleTabChange = (tab: string) => {
    setActiveTab(tab)
    onChange?.(tab)
  }

  return (
    <TabsContext.Provider value={{ activeTab, setActiveTab: handleTabChange }}>
      <div className={className}>{children}</div>
    </TabsContext.Provider>
  )
}

interface TabsListProps {
  children: ReactNode
  className?: string
}

export function TabsList({ children, className }: TabsListProps) {
  return (
    <div
      className={cn(
        'inline-flex items-center gap-1 p-1 bg-gray-100 rounded-xl',
        className
      )}
    >
      {children}
    </div>
  )
}

interface TabsTriggerProps {
  value: string
  children: ReactNode
  icon?: IconComponent
  className?: string
}

export function TabsTrigger({ value, children, icon: Icon, className }: TabsTriggerProps) {
  const context = useContext(TabsContext)
  if (!context) throw new Error('TabsTrigger must be used within Tabs')

  const isActive = context.activeTab === value

  return (
    <button
      onClick={() => context.setActiveTab(value)}
      className={cn(
        'relative px-4 py-2 text-sm font-medium rounded-lg transition-all duration-200',
        'flex items-center gap-2',
        isActive
          ? 'text-primary-700'
          : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50',
        className
      )}
    >
      {isActive && (
        <motion.div
          layoutId="activeTab"
          className="absolute inset-0 bg-white rounded-lg shadow-sm"
          transition={{ type: 'spring', duration: 0.3 }}
        />
      )}
      <span className="relative flex items-center gap-2">
        {Icon && <Icon className="w-4 h-4" />}
        {children}
      </span>
    </button>
  )
}

interface TabsContentProps {
  value: string
  children: ReactNode
  className?: string
}

export function TabsContent({ value, children, className }: TabsContentProps) {
  const context = useContext(TabsContext)
  if (!context) throw new Error('TabsContent must be used within Tabs')

  if (context.activeTab !== value) return null

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className={className}
    >
      {children}
    </motion.div>
  )
}

// Card-style tabs for report selection
interface TabCardProps {
  value: string
  icon: IconComponent
  title: string
  description: string
  className?: string
}

export function TabCard({ value, icon: Icon, title, description, className }: TabCardProps) {
  const context = useContext(TabsContext)
  if (!context) throw new Error('TabCard must be used within Tabs')

  const isActive = context.activeTab === value

  return (
    <button
      onClick={() => context.setActiveTab(value)}
      className={cn(
        'p-4 rounded-xl border-2 text-left transition-all duration-200',
        isActive
          ? 'border-primary-500 bg-primary-50'
          : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50',
        className
      )}
    >
      <div
        className={cn(
          'w-10 h-10 rounded-lg flex items-center justify-center mb-3',
          isActive ? 'bg-primary-500 text-white' : 'bg-gray-100 text-gray-600'
        )}
      >
        <Icon className="w-5 h-5" />
      </div>
      <h4 className={cn('font-semibold', isActive ? 'text-primary-700' : 'text-gray-900')}>
        {title}
      </h4>
      <p className="text-sm text-gray-500 mt-1">{description}</p>
    </button>
  )
}
