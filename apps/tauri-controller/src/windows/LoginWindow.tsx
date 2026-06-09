import { useState } from 'react'
import { supabase } from '../lib/supabase'

const ALLOWED_DOMAIN = import.meta.env.VITE_ALLOWED_DOMAIN as string | undefined

export function LoginWindow() {
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleGoogleSignIn() {
    setError(null)
    setLoading(true)
    try {
      const opts: Record<string, string> = {}
      if (ALLOWED_DOMAIN) {
        opts['hd'] = ALLOWED_DOMAIN
      }
      const { error: authError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: 'smidgeon://auth/callback',
          queryParams: Object.keys(opts).length > 0 ? opts : undefined,
        },
      })
      if (authError) {
        setError(authError.message)
        setLoading(false)
      }
      // On success the browser will redirect; window stays open until main toolbar
      // detects the new session and closes this window.
    } catch {
      setError('Sign in failed. Please try again.')
      setLoading(false)
    }
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-gray-900 px-6">
      <div className="w-full max-w-sm bg-gray-800 border border-gray-700 rounded-2xl p-8 flex flex-col items-center gap-6">
        <div className="flex flex-col items-center gap-1 text-center">
          <span className="text-2xl font-bold text-white tracking-tight">CRS Controller</span>
          <span className="text-sm text-gray-400">Classroom Response System</span>
          {ALLOWED_DOMAIN && (
            <span className="text-xs text-gray-500 mt-1">@{ALLOWED_DOMAIN} accounts only</span>
          )}
        </div>

        <div className="w-full border-t border-gray-700" />

        <div className="w-full flex flex-col gap-3">
          <button
            onClick={() => void handleGoogleSignIn()}
            disabled={loading}
            className="w-full h-12 rounded-xl bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white font-semibold text-base transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            aria-label={ALLOWED_DOMAIN ? `Sign in with Google ${ALLOWED_DOMAIN} account` : 'Sign in with Google'}
          >
            {loading ? 'Opening browser…' : 'Sign in with Google'}
          </button>

          {error && (
            <p role="alert" className="text-sm text-red-400 text-center bg-red-900/30 rounded-lg px-3 py-2">
              {error}
            </p>
          )}
        </div>
      </div>
    </main>
  )
}
