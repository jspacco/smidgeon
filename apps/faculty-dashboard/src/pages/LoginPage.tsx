import { useState } from 'react'
import { Button } from '@crs/ui'
import { signInWithGoogle } from '../lib/auth'

const ALLOWED_DOMAIN = import.meta.env.VITE_ALLOWED_DOMAIN as string | undefined

export function LoginPage() {
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSignIn() {
    setError(null)
    setLoading(true)
    try {
      await signInWithGoogle()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed. Please try again.')
      setLoading(false)
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-sm border border-gray-200 p-8 flex flex-col items-center gap-6">
        <div className="flex flex-col items-center gap-2">
          <span className="text-3xl font-bold text-gray-900 tracking-tight">Smidgeon</span>
          <span className="text-sm text-gray-500 font-medium">Classroom Response System</span>
          <span className="text-xs text-gray-400">Knox College</span>
        </div>

        <div className="w-full border-t border-gray-100" />

        <div className="w-full flex flex-col gap-3">
          <Button
            variant="primary"
            size="lg"
            className="w-full"
            onClick={handleSignIn}
            disabled={loading}
            aria-label="Sign in with Google"
          >
            {loading ? 'Redirecting…' : 'Sign in with Google'}
          </Button>

          {error && (
            <p role="alert" className="text-sm text-red-600 text-center">
              {error}
            </p>
          )}
        </div>

        {ALLOWED_DOMAIN && (
          <p className="text-xs text-gray-400 text-center">
            @{ALLOWED_DOMAIN} accounts only.
          </p>
        )}
      </div>
    </main>
  )
}
