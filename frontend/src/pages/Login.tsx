import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { Lock, Envelope } from '@phosphor-icons/react'
import logoUrl from '@/assets/logo.png'
import { Button, Input } from '@/components/ui'
import { authApi } from '@/services/api'
import { useAuthStore } from '@/stores/authStore'
import { showToast, parseApiError } from '@/lib/toast'

const loginSchema = z.object({
  email: z.string().min(1, 'Email is required').email('Enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
})

type LoginForm = z.infer<typeof loginSchema>

export default function Login() {
  const navigate = useNavigate()
  const setUser = useAuthStore((s) => s.setUser)
  const [submitting, setSubmitting] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
  })

  const onSubmit = async (values: LoginForm) => {
    setSubmitting(true)
    try {
      const res = await authApi.login(values)
      const user = res.data?.user ?? res.data
      setUser(user)
      navigate('/app', { replace: true })
    } catch (error) {
      showToast.error(parseApiError(error, 'Login failed. Please check your credentials.'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-gradient-to-b from-ocean-50 via-gray-50 to-white">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center mb-8">
          <img src={logoUrl} alt="Oceanwaves Schools" className="w-28 h-28 object-contain mb-4" />
          <h1 className="text-2xl font-bold text-primary-700">Oceanwaves Schools</h1>
          <p className="text-xs uppercase tracking-[0.2em] text-crest mt-1">Sailing To Success</p>
          <p className="text-sm text-gray-500 mt-3">Sign in to your account</p>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 sm:p-8">
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
      </div>
    </div>
  )
}
