import { forwardRef, ButtonHTMLAttributes, ComponentType } from 'react'
import { Loader2 } from 'lucide-react'
import { cn } from '../../lib/utils'

type IconComponent = ComponentType<{ className?: string }>
type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'outline' | 'success'
type ButtonSize = 'sm' | 'md' | 'lg' | 'icon'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  loading?: boolean
  icon?: IconComponent
  iconPosition?: 'left' | 'right'
}

const variantClasses: Record<ButtonVariant, string> = {
  primary: 'bg-primary-600 text-white hover:bg-primary-700 focus:ring-primary-500 shadow-sm',
  secondary: 'bg-gray-100 text-gray-700 hover:bg-gray-200 focus:ring-gray-500',
  danger: 'bg-red-600 text-white hover:bg-red-700 focus:ring-red-500 shadow-sm',
  ghost: 'text-gray-700 hover:bg-gray-100 focus:ring-gray-500',
  outline: 'border border-gray-300 text-gray-700 hover:bg-gray-50 focus:ring-gray-500',
  success: 'bg-emerald-600 text-white hover:bg-emerald-700 focus:ring-emerald-500 shadow-sm',
}

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'px-3 py-1.5 text-sm',
  md: 'px-4 py-2.5 text-sm',
  lg: 'px-6 py-3 text-base',
  icon: 'p-2',
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant = 'primary',
      size = 'md',
      loading = false,
      icon: Icon,
      iconPosition = 'left',
      disabled,
      children,
      ...props
    },
    ref
  ) => {
    const isDisabled = disabled || loading

    return (
      <button
        ref={ref}
        disabled={isDisabled}
        className={cn(
          'inline-flex items-center justify-center gap-2 font-medium rounded-lg transition-all duration-200',
          'focus:outline-none focus:ring-2 focus:ring-offset-2',
          'disabled:opacity-50 disabled:cursor-not-allowed',
          variantClasses[variant],
          sizeClasses[size],
          className
        )}
        {...props}
      >
        {loading && <Loader2 className="w-4 h-4 animate-spin" />}
        {!loading && Icon && iconPosition === 'left' && <Icon className="w-4 h-4" />}
        {children}
        {!loading && Icon && iconPosition === 'right' && <Icon className="w-4 h-4" />}
      </button>
    )
  }
)

Button.displayName = 'Button'

// Icon button variant
export function IconButton({
  icon: Icon,
  variant = 'ghost',
  size = 'icon',
  className,
  ...props
}: Omit<ButtonProps, 'children'> & { icon: IconComponent }) {
  return (
    <Button
      variant={variant}
      size={size}
      className={cn('rounded-lg', className)}
      {...props}
    >
      <Icon className="w-4 h-4" />
    </Button>
  )
}
