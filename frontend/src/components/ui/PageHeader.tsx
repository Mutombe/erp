import { ReactNode, ComponentType } from 'react'
import { motion } from 'framer-motion'
import { ArrowLeft } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { cn } from '../../lib/utils'

interface PageHeaderProps {
  title: string
  description?: string
  subtitle?: string  // Alias for description
  icon?: ComponentType<{ className?: string }>
  backLink?: string
  actions?: ReactNode
  breadcrumbs?: { label: string; href?: string }[]
  className?: string
}

export function PageHeader({
  title,
  description,
  subtitle,
  icon: Icon,
  backLink,
  actions,
  breadcrumbs,
  className,
}: PageHeaderProps) {
  const displayDescription = description || subtitle
  const navigate = useNavigate()

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn('mb-8', className)}
    >
      {/* Breadcrumbs */}
      {breadcrumbs && breadcrumbs.length > 0 && (
        <nav className="flex items-center gap-2 text-sm text-gray-500 mb-4">
          {breadcrumbs.map((crumb, index) => (
            <span key={index} className="flex items-center gap-2">
              {index > 0 && <span>/</span>}
              {crumb.href ? (
                <button
                  onClick={() => navigate(crumb.href!)}
                  className="hover:text-gray-900 transition-colors"
                >
                  {crumb.label}
                </button>
              ) : (
                <span className="text-gray-900 font-medium">{crumb.label}</span>
              )}
            </span>
          ))}
        </nav>
      )}

      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div className="flex items-start gap-3 sm:gap-4">
          {backLink && (
            <button
              onClick={() => navigate(backLink)}
              className="mt-0.5 sm:mt-1 p-1.5 sm:p-2 rounded-lg hover:bg-gray-100 transition-colors"
            >
              <ArrowLeft className="w-4 h-4 sm:w-5 sm:h-5 text-gray-500" />
            </button>
          )}

          {Icon && (
            <div className="p-2 sm:p-3 bg-primary-50 rounded-xl">
              <Icon className="w-5 h-5 sm:w-6 sm:h-6 text-primary-600" />
            </div>
          )}

          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900">{title}</h1>
            {displayDescription && (
              <p className="text-sm sm:text-base text-gray-500 mt-0.5 sm:mt-1">{displayDescription}</p>
            )}
          </div>
        </div>

        {actions && <div className="flex items-center gap-2 sm:gap-3 flex-wrap">{actions}</div>}
      </div>
    </motion.div>
  )
}

interface SectionHeaderProps {
  title: string
  description?: string
  actions?: ReactNode
  className?: string
}

export function SectionHeader({ title, description, actions, className }: SectionHeaderProps) {
  return (
    <div className={cn('flex items-center justify-between mb-6', className)}>
      <div>
        <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
        {description && <p className="text-sm text-gray-500 mt-0.5">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  )
}
