import { useState } from 'react'
import ocwLogo from '@/assets/logo.png'
import { cn } from '@/lib/utils'
import type { SchoolSummary } from '@/stores/authStore'

/** Deterministic initials for a school with no uploaded logo. Prefer a short
 *  code (e.g. "OCW"); fall back to the first letters of the name. */
function monogram(school: Pick<SchoolSummary, 'code' | 'name'>): string {
  const code = (school.code || '').trim()
  if (code) return code.slice(0, 3).toUpperCase()
  const words = (school.name || '?').trim().split(/\s+/)
  return words
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase()
}

interface SchoolAvatarProps {
  school: Pick<SchoolSummary, 'code' | 'name' | 'logo'>
  /** Tailwind sizing classes, e.g. "w-10 h-10". */
  className?: string
  /** Monogram text size. */
  textClassName?: string
  /** Use the bundled Oceanwaves crest as the fallback when this is the OCW
   *  school and no logo was uploaded (in-app branding continuity). */
  ocwFallbackCrest?: boolean
}

/** Renders a school's uploaded logo, or a branded monogram avatar when none is
 *  present. For OCW without a logo we can optionally show the bundled crest. */
export default function SchoolAvatar({
  school,
  className,
  textClassName,
  ocwFallbackCrest = false,
}: SchoolAvatarProps) {
  const [broken, setBroken] = useState(false)
  const useCrest = ocwFallbackCrest && !school.logo && school.code?.toUpperCase() === 'OCW'
  const src = school.logo && !broken ? school.logo : useCrest ? ocwLogo : null

  if (src) {
    return (
      <img
        src={src}
        alt=""
        onError={() => setBroken(true)}
        className={cn('object-contain rounded-lg bg-white shrink-0', className)}
      />
    )
  }

  return (
    <span
      className={cn(
        'inline-flex items-center justify-center rounded-lg shrink-0 font-bold tracking-tight',
        'bg-primary-100 text-primary-700 dark:bg-primary-900/40 dark:text-primary-200',
        className,
        textClassName
      )}
    >
      {monogram(school)}
    </span>
  )
}
