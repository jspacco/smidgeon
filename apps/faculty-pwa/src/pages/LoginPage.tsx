import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { Button } from '@crs/ui'

export default function LoginPage() {
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleGoogleSignIn() {
    setError(null)
    setLoading(true)
    try {
      const { error: authError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/courses`,
          queryParams: {
            hd: 'knox.edu',
          },
        },
      })
      if (authError) {
        setError(authError.message)
      }
    } catch (err) {
      setError('Sign in failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="flex flex-col items-center justify-center min-h-screen bg-gray-50 px-4">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8 w-full max-w-sm text-center">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">CRS Faculty</h1>
        <p className="text-gray-500 text-sm mb-8">Classroom Response System</p>

        <Button
          onClick={handleGoogleSignIn}
          disabled={loading}
          size="lg"
          className="w-full"
          aria-label="Sign in with Google"
        >
          {loading ? 'Signing in…' : 'Sign in with Google'}
        </Button>

        <p className="text-xs text-gray-400 mt-4">@knox.edu accounts only</p>

        {error && (
          <p role="alert" className="mt-4 text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">
            {error}
          </p>
        )}
      </div>
    </main>
  )
}
