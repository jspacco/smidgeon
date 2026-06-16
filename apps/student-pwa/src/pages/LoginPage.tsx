import { useState } from 'react'
import { Button } from '@crs/ui'
import { signInWithGoogle } from '../lib/auth'

const ALLOWED_DOMAIN = import.meta.env.VITE_ALLOWED_DOMAIN as string | undefined

export default function LoginPage() {
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
    <main className="min-h-screen flex flex-col items-center justify-center bg-white px-6">
      <div className="w-full max-w-sm flex flex-col items-center gap-8">
        {/* Branding */}
        <div className="flex flex-col items-center gap-2 text-center">
          <div className="w-16 h-16 rounded-2xl bg-blue-600 flex items-center justify-center" aria-hidden="true">
            <svg
              className="w-9 h-9 text-white"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
              />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Smidgeon Student</h1>
          <p className="text-sm text-gray-500">Classroom Response System</p>
        </div>

        {/* Sign-in card */}
        <div className="w-full flex flex-col gap-4">
          <p className="text-center text-gray-700 text-sm">
            {ALLOWED_DOMAIN
              ? <>Sign in with your <span className="font-medium text-blue-600">@{ALLOWED_DOMAIN}</span> Google account.</>
              : 'Sign in with your Google account.'}
          </p>

          {error && (
            <p role="alert" className="text-red-600 text-sm text-center bg-red-50 rounded-lg px-4 py-2">
              {error}
            </p>
          )}

          <Button
            size="lg"
            onClick={() => void handleSignIn()}
            disabled={loading}
            className="w-full"
            aria-label="Sign in with Google"
          >
            <svg
              className="w-5 h-5 mr-2"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                fill="currentColor"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="currentColor"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="currentColor"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              />
              <path
                fill="currentColor"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              />
            </svg>
            {loading ? 'Signing in…' : 'Sign in with Google'}
          </Button>
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
