import { FileArrowDown } from '@phosphor-icons/react'
import { Button } from '@/components/ui'

interface PdfButtonProps {
  /** Report key of the backend PDF endpoint: /api/reports/pdf/<key>/ */
  reportKey: string
  /** Exactly the params the section sends to its JSON report query. */
  params?: Record<string, string | number>
  disabled?: boolean
}

/** Opens the server-rendered PDF for a report section in a new tab. */
export default function PdfButton({ reportKey, params, disabled }: PdfButtonProps) {
  const handleClick = () => {
    const search = new URLSearchParams(
      Object.entries(params ?? {}).map(([key, value]) => [key, String(value)])
    ).toString()
    window.open(`/api/reports/pdf/${reportKey}/${search ? `?${search}` : ''}`, '_blank')
  }

  return (
    <Button variant="secondary" size="sm" disabled={disabled} onClick={handleClick}>
      <FileArrowDown className="w-4 h-4 mr-2" /> PDF
    </Button>
  )
}
