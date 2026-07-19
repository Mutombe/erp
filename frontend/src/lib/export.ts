/**
 * Export utilities for CSV and Excel formats
 */

export interface ExportColumn {
  key: string
  header: string
  format?: (value: any) => string
}

/**
 * Export data to CSV file
 */
export function exportToCSV(
  data: Record<string, any>[],
  columns: ExportColumn[],
  filename: string
): void {
  if (!data || data.length === 0) {
    console.warn('No data to export')
    return
  }

  // Build header row
  const headers = columns.map(col => `"${col.header}"`)

  // Build data rows
  const rows = data.map(row => {
    return columns.map(col => {
      let value = row[col.key]
      if (col.format) {
        value = col.format(value)
      }
      // Escape quotes and wrap in quotes
      if (value === null || value === undefined) {
        return '""'
      }
      const stringValue = String(value).replace(/"/g, '""')
      return `"${stringValue}"`
    }).join(',')
  })

  // Combine header and rows
  const csvContent = [headers.join(','), ...rows].join('\n')

  // Create and trigger download
  downloadFile(csvContent, `${filename}.csv`, 'text/csv;charset=utf-8;')
}

/**
 * Export data to Excel-compatible format (TSV with BOM for Excel)
 */
export function exportToExcel(
  data: Record<string, any>[],
  columns: ExportColumn[],
  filename: string
): void {
  if (!data || data.length === 0) {
    console.warn('No data to export')
    return
  }

  // Build header row
  const headers = columns.map(col => col.header)

  // Build data rows
  const rows = data.map(row => {
    return columns.map(col => {
      let value = row[col.key]
      if (col.format) {
        value = col.format(value)
      }
      if (value === null || value === undefined) {
        return ''
      }
      return String(value)
    })
  })

  // Create workbook content (tab-separated for better Excel compatibility)
  const tsvContent = [
    headers.join('\t'),
    ...rows.map(row => row.join('\t'))
  ].join('\n')

  // Add BOM for Excel to recognize UTF-8
  const BOM = '\uFEFF'
  downloadFile(BOM + tsvContent, `${filename}.xls`, 'application/vnd.ms-excel;charset=utf-8;')
}

/**
 * Export any table data generically
 */
export function exportTableData(
  data: Record<string, any>[],
  columns: { key: string; header: string; format?: (value: any) => string }[],
  filename: string,
  format: 'csv' | 'excel' = 'csv'
): void {
  if (format === 'excel') {
    exportToExcel(data, columns, filename)
  } else {
    exportToCSV(data, columns, filename)
  }
}

/**
 * Format number for export
 */
export function formatExportNumber(value: any): string {
  if (value === null || value === undefined) return '0.00'
  const num = parseFloat(value)
  if (isNaN(num)) return '0.00'
  return num.toFixed(2)
}

/**
 * Create and trigger file download
 */
function downloadFile(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType })
  downloadBlob(blob, filename)
}

/**
 * Trigger download from a Blob
 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.style.display = 'none'

  document.body.appendChild(link)
  link.click()

  setTimeout(() => {
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }, 100)
}
