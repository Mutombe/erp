import { cn } from '../../lib/utils'

interface CurrencyDisplayProps {
  amount: number
  currency?: string
  className?: string
  showSign?: boolean
  size?: 'sm' | 'md' | 'lg'
}

const sizeClasses = {
  sm: 'text-xs',
  md: 'text-sm',
  lg: 'text-base font-semibold',
}

export function CurrencyDisplay({
  amount,
  currency = 'USD',
  className,
  showSign = false,
  size = 'md',
}: CurrencyDisplayProps) {
  const formatted = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  }).format(Math.abs(amount))

  const isNegative = amount < 0
  const prefix = showSign ? (isNegative ? '-' : '+') : (isNegative ? '-' : '')
  const displayValue = isNegative && !showSign ? `-${formatted}` : showSign ? `${prefix}${formatted}` : formatted

  return (
    <span
      className={cn(
        'tabular-nums text-right inline-block',
        sizeClasses[size],
        showSign && isNegative && 'text-red-600',
        showSign && !isNegative && amount > 0 && 'text-emerald-600',
        className
      )}
    >
      {displayValue}
    </span>
  )
}

export function CurrencyTotal({
  label,
  amount,
  currency = 'USD',
  className,
}: {
  label: string
  amount: number
  currency?: string
  className?: string
}) {
  return (
    <div className={cn('flex items-center justify-between py-2', className)}>
      <span className="text-sm font-medium text-gray-600">{label}</span>
      <CurrencyDisplay amount={amount} currency={currency} size="lg" />
    </div>
  )
}
