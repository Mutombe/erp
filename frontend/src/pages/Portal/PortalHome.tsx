import { CalendarCheck, HandCoins, Scroll, Student as StudentIcon } from '@phosphor-icons/react'
import RecordLink from '@/components/RecordLink'
import { Badge, EmptyState, SkeletonCard } from '@/components/ui'
import { usePortalContext } from '@/hooks/usePortalContext'
import { formatCurrency, formatPercent } from '@/lib/utils'
import type { Balance, StudentCard } from '@/types/portal'

function AttendancePill({ rate }: { rate: number | null }) {
  if (rate == null) {
    return <Badge variant="default">No attendance yet</Badge>
  }
  const variant = rate >= 90 ? 'success' : rate >= 75 ? 'warning' : 'danger'
  return (
    <Badge variant={variant} dot>
      {formatPercent(rate)} attendance
    </Badge>
  )
}

function Balances({ balances }: { balances: Balance[] }) {
  const owed = balances.filter((b) => Number(b.amount) !== 0)
  if (owed.length === 0) {
    return (
      <span className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald-600 dark:text-emerald-400">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
        Paid up
      </span>
    )
  }
  return (
    <div className="space-y-0.5">
      {owed.map((b) => (
        <p key={b.currency} className="text-sm font-semibold text-gray-900 dark:text-slate-100 tabular-nums">
          {formatCurrency(Number(b.amount), b.currency)}
          <span className="ml-1.5 text-xs font-normal text-gray-400 dark:text-slate-500">outstanding</span>
        </p>
      ))}
    </div>
  )
}

function StudentPortalCard({ student, isGuardian }: { student: StudentCard; isGuardian: boolean }) {
  const meta = [student.class_name, student.grade].filter(Boolean).join(' · ')
  return (
    <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-200 dark:border-slate-700 shadow-sm p-5 sm:p-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          {student.photo ? (
            <img src={student.photo} alt="" className="w-12 h-12 rounded-full object-cover shrink-0" />
          ) : (
            <span className="w-12 h-12 rounded-full bg-primary-100 text-primary-700 dark:bg-primary-900/40 dark:text-primary-200 flex items-center justify-center shrink-0">
              <StudentIcon className="w-6 h-6" />
            </span>
          )}
          <div className="min-w-0">
            <RecordLink
              to={`/portal/students/${student.id}`}
              className="block text-base font-semibold truncate no-underline hover:underline"
            >
              {student.name}
            </RecordLink>
            <p className="text-xs uppercase tracking-wider text-gray-400 dark:text-slate-500 font-mono">
              {student.code}
            </p>
            {meta && <p className="text-sm text-gray-500 dark:text-slate-400 truncate">{meta}</p>}
          </div>
        </div>
        <AttendancePill rate={student.attendance_rate} />
      </div>

      <div className="mt-5 pt-5 border-t border-gray-100 dark:border-slate-700">
        <p className="text-xs uppercase tracking-wider text-gray-400 dark:text-slate-500 mb-1.5">Balance</p>
        <Balances balances={student.balances} />
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-2">
        <RecordLink
          to={`/portal/students/${student.id}`}
          className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600 no-underline hover:no-underline"
        >
          <Scroll className="w-4 h-4" /> Statement
        </RecordLink>
        <RecordLink
          to={`/portal/students/${student.id}/attendance`}
          className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600 no-underline hover:no-underline"
        >
          <CalendarCheck className="w-4 h-4" /> Attendance
        </RecordLink>
        {isGuardian && (
          <RecordLink
            to={`/portal/payments?student=${student.id}`}
            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium bg-primary-600 text-white hover:bg-primary-700 no-underline hover:no-underline"
          >
            <HandCoins className="w-4 h-4" /> Make a payment
          </RecordLink>
        )}
      </div>
    </div>
  )
}

export default function PortalHome() {
  const { data: context, isLoading, isError } = usePortalContext()

  if (isLoading) {
    return (
      <div className="space-y-6">
        <SkeletonCard />
        <SkeletonCard />
      </div>
    )
  }

  if (isError || !context) {
    return (
      <EmptyState
        title="Couldn't load your portal"
        description="Please refresh the page and try again. If the problem continues, contact your school office."
      />
    )
  }

  const isGuardian = context.kind === 'guardian'

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-slate-100">
          Welcome, {context.profile.name}
        </h1>
        <p className="text-sm text-gray-500 dark:text-slate-400 mt-1">
          {isGuardian
            ? 'Your children’s fees and attendance at a glance.'
            : 'Your fees and attendance at a glance.'}
        </p>
      </div>

      {context.students.length === 0 ? (
        <EmptyState
          icon={StudentIcon}
          title="No students linked yet"
          description="There are no students linked to your account. Please contact your school office if you believe this is a mistake."
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {context.students.map((student) => (
            <StudentPortalCard key={student.id} student={student} isGuardian={isGuardian} />
          ))}
        </div>
      )}
    </div>
  )
}
