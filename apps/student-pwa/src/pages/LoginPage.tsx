import { useState } from 'react'
import { Button } from '@crs/ui'
import { signInWithGoogle } from '../lib/auth'
import logo from '../assets/logo.png'

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
          <img src={logo} alt="Smidgeon Logo" className="w-16 h-16 mx-auto mb-4 rounded-full" />
          <h1 className="text-2xl font-bold text-gray-900">Smidgeon Student</h1>
          <p className="text-sm text-gray-500">Classroom Response System</p>
        </div>

        {/* Sign-in card */}
        <div className="w-full flex flex-col gap-4">

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
