import { ComponentType } from 'react'
import { motion } from 'framer-motion'
import { TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { cn } from '../../lib/utils'

type IconComponent = ComponentType<{ className?: string }>

interface StatsCardProps {
  title: string
  value: string | number
  subtitle?: string
  icon: IconComponent
  trend?: {
    value: number
    label: string
  }
  color?: 'blue' | 'green' | 'purple' | 'orange' | 'red' | 'cyan'
  loading?: boolean
}

const colorClasses = {
  blue: {
    bg: 'bg-blue-50',
    icon: 'bg-blue-500',
    trend: 'text-blue-600',
  },
  green: {
    bg: 'bg-emerald-50',
    icon: 'bg-emerald-500',
    trend: 'text-emerald-600',
  },
  purple: {
    bg: 'bg-purple-50',
    icon: 'bg-purple-500',
    trend: 'text-purple-600',
  },
  orange: {
    bg: 'bg-orange-50',
    icon: 'bg-orange-500',
    trend: 'text-orange-600',
  },
  red: {
    bg: 'bg-red-50',
    icon: 'bg-red-500',
    trend: 'text-red-600',
  },
  cyan: {
    bg: 'bg-cyan-50',
    icon: 'bg-cyan-500',
    trend: 'text-cyan-600',
  },
}

export function StatsCard({
  title,
  value,
  subtitle,
  icon: Icon,
  trend,
  color = 'blue',
  loading = false,
}: StatsCardProps) {
  const colors = colorClasses[color]

  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-6 animate-pulse">
        <div className="flex items-center justify-between">
          <div className="space-y-3 flex-1">
            <div className="h-3 w-24 bg-gray-200 rounded" />
            <div className="h-8 w-32 bg-gray-200 rounded" />
            <div className="h-3 w-20 bg-gray-200 rounded" />
          </div>
          <div className="h-14 w-14 bg-gray-200 rounded-xl" />
        </div>
      </div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white rounded-xl border border-gray-200 p-6 hover:shadow-lg hover:border-gray-300 transition-all duration-300"
    >
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-gray-500">{title}</p>
          <p className="text-3xl font-bold text-gray-900 mt-1">{value}</p>

          {trend && (
            <div className="flex items-center gap-1.5 mt-2">
              {trend.value > 0 ? (
                <TrendingUp className="w-4 h-4 text-emerald-500" />
              ) : trend.value < 0 ? (
                <TrendingDown className="w-4 h-4 text-red-500" />
              ) : (
                <Minus className="w-4 h-4 text-gray-400" />
              )}
              <span
                className={cn(
                  'text-sm font-medium',
                  trend.value > 0 ? 'text-emerald-600' : trend.value < 0 ? 'text-red-600' : 'text-gray-500'
                )}
              >
                {trend.value > 0 ? '+' : ''}{trend.value}%
              </span>
              <span className="text-sm text-gray-500">{trend.label}</span>
            </div>
          )}

          {subtitle && !trend && (
            <p className="text-sm text-gray-500 mt-2">{subtitle}</p>
          )}
        </div>

        <div className={cn('p-4 rounded-xl', colors.bg)}>
          <div className={cn('p-3 rounded-lg', colors.icon)}>
            <Icon className="w-6 h-6 text-white" />
          </div>
        </div>
      </div>
    </motion.div>
  )
}

export function StatsCardCompact({
  title,
  value,
  icon: Icon,
  color = 'blue',
}: Omit<StatsCardProps, 'trend' | 'subtitle'>) {
  const colors = colorClasses[color]

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-4"
    >
      <div className={cn('p-3 rounded-xl', colors.bg)}>
        <Icon className={cn('w-5 h-5', colors.icon.replace('bg-', 'text-'))} />
      </div>
      <div>
        <p className="text-2xl font-bold text-gray-900">{value}</p>
        <p className="text-sm text-gray-500">{title}</p>
      </div>
    </motion.div>
  )
}
