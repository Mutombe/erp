import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { useQuery } from '@tanstack/react-query'
import { CaretLeft, Lock, Envelope, Warning } from '@phosphor-icons/react'
import SchoolAvatar from '@/components/SchoolAvatar'
import { Button, Input } from '@/components/ui'
import { authApi, publicApi } from '@/services/api'
import { useAuthStore, type Me, type SchoolSummary } from '@/stores/authStore'
import { showToast, parseApiError } from '@/lib/toast'

const loginSchema = z.object({
  email: z.string().min(1, 'Email is required').email('Enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
})

type LoginForm = z.infer<typeof loginSchema>

/** The Golden Knot platform wordmark shown atop both login steps. */
function GoldenKnotHeader() {
  return (
    <div className="flex flex-col items-center text-center mb-8">
      <div className="w-14 h-14 rounded-2xl bg-primary-600 text-white flex items-center justify-center shadow-lg shadow-primary-600/25 mb-4">
        <span className="font-black text-xl tracking-tighter">GK</span>
      </div>
      <h1 className="text-2xl font-black tracking-tight text-primary-700 dark:text-primary-300">
        GOLDEN KNOT
      </h1>
      <p className="text-[11px] uppercase tracking-[0.25em] text-gray-500 dark:text-slate-400 mt-1.5">
        School Management Platform
      </p>
    </div>
  )
}

/** Step 1 — pick the school to sign in to. */
function SchoolPicker({ onSelect }: { onSelect: (s: SchoolSummary) => void }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['public', 'schools'],
    queryFn: () => publicApi.schools().then((r) => r.data as SchoolSummary[]),
    staleTime: 5 * 60 * 1000,
  })

  // Auto-advance when there is exactly one active school.
  useEffect(() => {
    if (data && data.length === 1) onSelect(data[0])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data])

  return (
    <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-200 dark:border-slate-700 shadow-sm p-6 sm:p-8">
      <p className="text-sm font-medium text-gray-700 dark:text-slate-300 mb-4">
        Choose your school to continue
      </p>

      {isLoading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-[72px] rounded-xl border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-900/40 animate-pulse"
            />
          ))}
        </div>
      )}

      {isError && (
        <div className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400 py-6 justify-center">
          <Warning className="w-5 h-5" />
          Couldn&apos;t load schools. Please refresh and try again.
        </div>
      )}

      {data && data.length === 0 && (
        <p className="text-sm text-gray-500 dark:text-slate-400 py-6 text-center">
          No active schools are available yet.
        </p>
      )}

      {data && data.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {data.map((school) => (
            <button
              key={school.id}
              type="button"
              onClick={() => onSelect(school)}
              className="group flex items-center gap-3 text-left p-3 rounded-xl border border-gray-200 dark:border-slate-700 hover:border-primary-400 hover:bg-primary-50/50 dark:hover:bg-primary-900/20 dark:hover:border-primary-500 transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              <SchoolAvatar school={school} className="w-11 h-11 text-base" ocwFallbackCrest />
              <span className="min-w-0">
                <span className="block font-semibold text-gray-900 dark:text-slate-100 truncate">
                  {school.name}
                </span>
                <span className="block text-xs uppercase tracking-wider text-gray-400 dark:text-slate-500">
                  {school.code}
                </span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/** Step 2 — credentials for the chosen school. */
function Credentials({
  school,
  onBack,
  onSuccess,
}: {
  school: SchoolSummary
  onBack: () => void
  onSuccess: (me: Me) => void
}) {
  const [submitting, setSubmitting] = useState(false)
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginForm>({ resolver: zodResolver(loginSchema) })

  const onSubmit = async (values: LoginForm) => {
    setSubmitting(true)
    try {
      const res = await authApi.login({ school: school.code, ...values })
      onSuccess(res.data as Me)
    } catch (error) {
      showToast.error(parseApiError(error, 'Login failed. Please check your credentials.'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-200 dark:border-slate-700 shadow-sm p-6 sm:p-8">
      <div className="flex items-center gap-3 pb-5 mb-5 border-b border-gray-100 dark:border-slate-700">
        <SchoolAvatar school={school} className="w-11 h-11 text-base" ocwFallbackCrest />
        <span className="min-w-0 flex-1">
          <span className="block font-semibold text-gray-900 dark:text-slate-100 truncate">
            {school.name}
          </span>
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-1 text-xs font-medium text-primary-600 dark:text-primary-400 hover:underline mt-0.5"
          >
            <CaretLeft className="w-3 h-3" />
            Change school
          </button>
        </span>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
        <Input
          label="Email"
          type="email"
          autoComplete="email"
          placeholder="you@school.edu"
          icon={Envelope}
          error={errors.email?.message}
          {...register('email')}
        />
        <Input
          label="Password"
          type="password"
          autoComplete="current-password"
          placeholder="••••••••"
          icon={Lock}
          error={errors.password?.message}
          {...register('password')}
        />
        <Button type="submit" className="w-full" loading={submitting}>
          Sign in
        </Button>
      </form>
    </div>
  )
}

export default function Login() {
  const navigate = useNavigate()
  const setSession = useAuthStore((s) => s.setSession)
  const [school, setSchool] = useState<SchoolSummary | null>(null)

  const handleSuccess = (me: Me) => {
    setSession(me)
    navigate('/app', { replace: true })
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-10 bg-gradient-to-b from-primary-50 via-gray-50 to-white dark:from-slate-900 dark:via-slate-900 dark:to-slate-950">
      <div className="w-full max-w-lg">
        <GoldenKnotHeader />
        {school ? (
          <Credentials school={school} onBack={() => setSchool(null)} onSuccess={handleSuccess} />
        ) : (
          <SchoolPicker onSelect={setSchool} />
        )}
        <p className="text-center text-xs text-gray-400 dark:text-slate-600 mt-6">
          Golden Knot — one platform, every school.
        </p>
      </div>
    </div>
  )
}
