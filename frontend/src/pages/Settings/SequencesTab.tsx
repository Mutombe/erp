import { useQuery } from '@tanstack/react-query'
import { sequencesApi } from '@/services/api'
import { qk } from '@/lib/queryKeys'
import { DataTable, RefreshingOverlay, refreshingContentClass, type Column } from '@/components/ui'

interface DocumentSequence {
  id: number
  doc_type: string
  prefix: string
  padding: number
  next_number: number
}

export default function SequencesTab() {
  const { data, isFetching } = useQuery({
    queryKey: qk.sequences.list(),
    queryFn: () => sequencesApi.list().then((r) => r.data as DocumentSequence[]),
  })

  const isRefreshing = isFetching && !!data

  const columns: Column<DocumentSequence>[] = [
    { key: 'doc_type', header: 'Document type', render: (s) => <span className="font-mono font-medium">{s.doc_type}</span> },
    { key: 'prefix', header: 'Prefix', render: (s) => <span className="font-mono">{s.prefix}</span> },
    { key: 'padding', header: 'Padding', align: 'right', render: (s) => <span className="tabular-nums">{s.padding}</span> },
    { key: 'next_number', header: 'Next number', align: 'right', render: (s) => <span className="tabular-nums">{s.next_number}</span> },
    {
      key: 'preview',
      header: 'Next document',
      render: (s) => (
        <span className="font-mono text-primary-600 dark:text-primary-400">
          {s.prefix}{String(s.next_number).padStart(s.padding, '0')}
        </span>
      ),
    },
  ]

  return (
    <div className="space-y-3">
      <p className="text-sm text-gray-500 dark:text-gray-400">
        Document numbering is race-safe and managed by the system — shown here for reference only.
      </p>
      <div className="relative">
        <RefreshingOverlay active={isRefreshing} />
        <div className={refreshingContentClass(isRefreshing)}>
          <DataTable<DocumentSequence>
            rowKey={(s) => s.id}
            columns={columns}
            data={data ?? []}
            loading={!data}
            emptyTitle="No sequences configured"
          />
        </div>
      </div>
    </div>
  )
}
