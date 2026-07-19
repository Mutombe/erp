import { cn } from '../../lib/utils'

export type BadgeVariant = 'default' | 'success' | 'warning' | 'danger' | 'info' | 'purple' | 'outline' | 'secondary'
type BadgeSize = 'sm' | 'md' | 'lg'

export interface BadgeProps {
  children: React.ReactNode
  variant?: BadgeVariant
  size?: BadgeSize
  className?: string
  dot?: boolean
  onClick?: () => void
}

const variantClasses: Record<BadgeVariant, string> = {
  default: 'bg-gray-100 text-gray-700',
  secondary: 'bg-gray-200 text-gray-800',
  success: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
  warning: 'bg-amber-50 text-amber-700 border border-amber-200',
  danger: 'bg-red-50 text-red-700 border border-red-200',
  info: 'bg-blue-50 text-blue-700 border border-blue-200',
  purple: 'bg-purple-50 text-purple-700 border border-purple-200',
  outline: 'bg-white text-gray-700 border border-gray-300',
}

const sizeClasses: Record<BadgeSize, string> = {
  sm: 'px-2 py-0.5 text-xs',
  md: 'px-2.5 py-1 text-xs',
  lg: 'px-3 py-1.5 text-sm',
}

const dotColors: Record<BadgeVariant, string> = {
  default: 'bg-gray-500',
  secondary: 'bg-gray-600',
  success: 'bg-emerald-500',
  warning: 'bg-amber-500',
  danger: 'bg-red-500',
  info: 'bg-blue-500',
  purple: 'bg-purple-500',
  outline: 'bg-gray-500',
}

export function Badge({
  children,
  variant = 'default',
  size = 'md',
  className,
  dot = false,
  onClick,
}: BadgeProps) {
  const Component = onClick ? 'button' : 'span'
  return (
    <Component
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1.5 font-medium rounded-full',
        variantClasses[variant],
        sizeClasses[size],
        onClick && 'cursor-pointer hover:opacity-80 transition-opacity',
        className
      )}
    >
      {dot && (
        <span className={cn('w-1.5 h-1.5 rounded-full', dotColors[variant])} />
      )}
      {children}
    </Component>
  )
}

// Pre-configured status badges for common ERP document statuses
export function StatusBadge({ status }: { status: string }) {
  const statusConfig: Record<string, { variant: BadgeVariant; label: string }> = {
    // Document lifecycle
    draft: { variant: 'default', label: 'Draft' },
    pending: { variant: 'warning', label: 'Pending' },
    approved: { variant: 'info', label: 'Approved' },
    posted: { variant: 'success', label: 'Posted' },
    reversed: { variant: 'default', label: 'Reversed' },
    cancelled: { variant: 'default', label: 'Cancelled' },
    rejected: { variant: 'danger', label: 'Rejected' },

    // Invoice / receipt statuses
    sent: { variant: 'info', label: 'Sent' },
    partial: { variant: 'warning', label: 'Partial' },
    paid: { variant: 'success', label: 'Paid' },
    unpaid: { variant: 'warning', label: 'Unpaid' },
    overdue: { variant: 'danger', label: 'Overdue' },

    // Generic active/inactive
    active: { variant: 'success', label: 'Active' },
    inactive: { variant: 'default', label: 'Inactive' },
    suspended: { variant: 'warning', label: 'Suspended' },
    closed: { variant: 'default', label: 'Closed' },
    locked: { variant: 'purple', label: 'Locked' },
    open: { variant: 'success', label: 'Open' },

    // Students
    enrolled: { variant: 'success', label: 'Enrolled' },
    graduated: { variant: 'info', label: 'Graduated' },
    withdrawn: { variant: 'danger', label: 'Withdrawn' },

    // Billing runs / background processes
    preview: { variant: 'info', label: 'Preview' },
    executed: { variant: 'success', label: 'Executed' },
    completed: { variant: 'success', label: 'Completed' },
    failed: { variant: 'danger', label: 'Failed' },
    processing: { variant: 'warning', label: 'Processing' },

    // Procurement
    received: { variant: 'success', label: 'Received' },
    ordered: { variant: 'info', label: 'Ordered' },
  }

  const config = statusConfig[status.toLowerCase()] || { variant: 'default', label: status }

  return (
    <Badge variant={config.variant} dot>
      {config.label}
    </Badge>
  )
}
