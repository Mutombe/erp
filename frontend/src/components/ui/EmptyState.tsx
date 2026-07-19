import { motion } from 'framer-motion'
import { FileX, Plus } from 'lucide-react'
import { ReactNode, ComponentType } from 'react'

type IconComponent = ComponentType<{ className?: string }>

interface EmptyStateAction {
  label: string
  onClick: () => void
}

interface EmptyStateProps {
  icon?: IconComponent
  title: string
  description: string
  action?: EmptyStateAction | ReactNode
}

export function EmptyState({ icon: Icon = FileX, title, description, action }: EmptyStateProps) {
  // Check if action is a ReactNode or an action object
  const isActionObject = action && typeof action === 'object' && 'label' in action && 'onClick' in action

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col items-center justify-center py-16 px-4"
    >
      <div className="w-20 h-20 rounded-full bg-gray-100 flex items-center justify-center mb-6">
        <Icon className="w-10 h-10 text-gray-400" />
      </div>
      <h3 className="text-lg font-semibold text-gray-900 mb-2">{title}</h3>
      <p className="text-gray-500 text-center max-w-md mb-6">{description}</p>
      {action && (
        isActionObject ? (
          <button
            onClick={(action as EmptyStateAction).onClick}
            className="inline-flex items-center gap-2 px-6 py-3 bg-primary-600 hover:bg-primary-700 text-white font-medium rounded-xl transition-colors shadow-lg shadow-primary-500/25"
          >
            <Plus className="w-4 h-4" />
            {(action as EmptyStateAction).label}
          </button>
        ) : (
          action
        )
      )}
    </motion.div>
  )
}

export function EmptyTableState({
  title = 'No data found',
  description = 'There are no records to display yet.',
  action,
}: Partial<EmptyStateProps>) {
  return (
    <tr>
      <td colSpan={100} className="py-16">
        <EmptyState title={title} description={description} action={action} />
      </td>
    </tr>
  )
}
