// Manual setup required before loopback OAuth will work:
//
// 1. Supabase dashboard → Authentication → URL Configuration → Redirect URLs
//    Add: http://127.0.0.1
//
// 2. Google Cloud Console → OAuth 2.0 Client ID → Authorized redirect URIs
//    Add: http://127.0.0.1
//    (Google allows any port on the loopback address for desktop apps — no port needed)

import { useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { supabase } from '../lib/supabase'

const ALLOWED_DOMAIN = import.meta.env.VITE_ALLOWED_DOMAIN as string | undefined

export function LoginWindow() {
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleGoogleSignIn() {
    setError(null)
    setLoading(true)

    let port: number
    try {
      port = await invoke<number>('start_oauth')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start sign-in server.')
      setLoading(false)
      return
    }

    // Register one-time listener for the callback URL the Rust side will emit.
    const unlisten = await listen<string>('oauth-callback', async (event) => {
      unlisten()
      const { error: authError } = await supabase.auth.exchangeCodeForSession(event.payload)
      if (authError) {
        setError(authError.message)
        setLoading(false)
      }
      // On success, onAuthStateChange in App.tsx detects the session and closes this window.
    })

    const opts: Record<string, string> = {}
    if (ALLOWED_DOMAIN) {
      opts['hd'] = ALLOWED_DOMAIN
    }

    const { error: authError } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `http://127.0.0.1:${port}`,
        queryParams: Object.keys(opts).length > 0 ? opts : undefined,
        skipBrowserRedirect: false,
      },
    })

    if (authError) {
      unlisten()
      setError(authError.message)
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
