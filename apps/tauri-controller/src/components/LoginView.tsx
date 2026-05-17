import { useState } from 'react'
import { supabase } from '../lib/supabase'

export function LoginView() {
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleGoogleSignIn() {
    setError(null)
    setLoading(true)
    try {
      const { error: authError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          queryParams: {
            hd: 'knox.edu',
          },
        },
      })
      if (authError) {
        setError(authError.message)
      }
    } catch {
      setError('Sign in failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className="flex flex-col items-center justify-center h-full bg-gray-900 px-4"
      style={{ height: 60 }}
    >
      <div className="flex items-center gap-4">
        <span className="text-sm font-semibold text-gray-300">CRS Controller</span>
        <button
          onClick={handleGoogleSignIn}
          disabled={loading}
          className="px-4 h-8 rounded-lg bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          aria-label="Sign in with Google Knox account"
        >
          {loading ? 'Signing in…' : 'Sign in with Google'}
        </button>
        <span className="text-xs text-gray-500">@knox.edu only</span>
        {error && (
          <span role="alert" className="text-xs text-red-400">
            {error}
          </span>
        )}
      </div>
    </div>
  )
}
