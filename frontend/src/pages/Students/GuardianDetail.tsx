import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate, useParams } from 'react-router-dom'
import { Pencil, Users } from 'lucide-react'
import { guardiansApi } from '@/services/api'
import { qk } from '@/lib/queryKeys'
import {
  Button,
  Card,
  CardContent,
  DataTable,
  PageHeader,
  SkeletonCard,
  StatusBadge,
  type Column,
} from '@/components/ui'
import type { Guardian, StudentBrief } from '@/types/students'
import GuardianFormModal from './GuardianFormModal'

export default function GuardianDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [editOpen, setEditOpen] = useState(false)

  const { data: guardian, isLoading } = useQuery({
    queryKey: qk.guardians.detail(id!),
    queryFn: () => guardiansApi.get(id!).then((r) => r.data as Guardian),
  })

  if (isLoading || !guardian) return <SkeletonCard />

  const columns: Column<StudentBrief>[] = [
    {
      key: 'code',
      header: 'Admission #',
      render: (s) => <span className="font-mono text-primary-600 dark:text-primary-400">{s.code}</span>,
    },
    { key: 'full_name', header: 'Name', render: (s) => <span className="font-medium">{s.full_name}</span> },
    { key: 'status', header: 'Status', render: (s) => <StatusBadge status={s.status} /> },
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        title={guardian.full_name}
        description={guardian.code}
        icon={Users}
        backLink="/app/guardians"
        actions={
          <Button variant="secondary" onClick={() => setEditOpen(true)}>
            <Pencil className="w-4 h-4 mr-2" /> Edit
          </Button>
        }
      />

      <Card>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div><span className="text-gray-500 block">Phone</span>{guardian.phone || '—'}</div>
            <div><span className="text-gray-500 block">Email</span>{guardian.email || '—'}</div>
            <div><span className="text-gray-500 block">National ID</span>{guardian.national_id || '—'}</div>
            <div><span className="text-gray-500 block">Employer</span>{guardian.employer || '—'}</div>
            <div className="col-span-2 md:col-span-4">
              <span className="text-gray-500 block">Address</span>{guardian.address || '—'}
            </div>
          </div>
        </CardContent>
      </Card>

      <div>
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">Linked students</h3>
        <DataTable<StudentBrief>
          rowKey={(s) => s.id}
          columns={columns}
          data={guardian.students ?? []}
          onRowClick={(s) => navigate(`/app/students/${s.id}`)}
          emptyTitle="No students linked"
          emptyDescription="This guardian has no linked students yet."
        />
      </div>

      <GuardianFormModal open={editOpen} onClose={() => setEditOpen(false)} guardian={guardian} />
    </div>
  )
}
