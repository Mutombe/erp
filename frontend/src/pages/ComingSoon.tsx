import { useLocation } from 'react-router-dom'
import { Barricade } from '@phosphor-icons/react'
import { EmptyState } from '@/components/ui'

function titleFromPath(pathname: string): string {
  const segment = pathname.replace(/^\/app\/?/, '').split('/')[0] || 'This page'
  return segment
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

export default function ComingSoon() {
  const { pathname } = useLocation()

  return (
    <EmptyState
      icon={Barricade}
      title={`${titleFromPath(pathname)} — coming soon`}
      description="This module is under construction. Check back shortly."
    />
  )
}
