import { MicrosoftExcelLogo } from '@phosphor-icons/react'
import { Button } from '@/components/ui'

interface ExcelButtonProps {
  /** Report key of the backend XLSX endpoint: /api/reports/xlsx/<key>/ */
  reportKey: string
  /** Exactly the params the section sends to its JSON report query. */
  params?: Record<string, string | number>
  disabled?: boolean
}

/** Opens the server-rendered Excel (.xlsx) export for a report section in a new tab. */
export default function ExcelButton({ reportKey, params, disabled }: ExcelButtonProps) {
  const handleClick = () => {
    const search = new URLSearchParams(
      Object.entries(params ?? {}).map(([key, value]) => [key, String(value)])
    ).toString()
    window.open(`/api/reports/xlsx/${reportKey}/${search ? `?${search}` : ''}`, '_blank')
  }

  return (
    <Button variant="secondary" size="sm" disabled={disabled} onClick={handleClick}>
      <MicrosoftExcelLogo className="w-4 h-4 mr-2" /> Excel
    </Button>
  )
}
