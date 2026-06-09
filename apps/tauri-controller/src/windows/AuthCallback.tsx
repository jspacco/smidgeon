import { useEffect, useState } from 'react'
import { onOpenUrl } from '@tauri-apps/plugin-deep-link'
import { supabase } from '../lib/supabase'

export function AuthCallback() {
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let unlisten: (() => void) | undefined

    onOpenUrl((urls) => {
      const url = urls[0]
      if (!url) return

      supabase.auth.exchangeCodeForSession(url).then(({ error: authError }) => {
        if (authError) {
          setError(authError.message)
        }
        // On success, onAuthStateChange in App.tsx detects the new session
        // and closes this window automatically.
      })
    })
      .then((fn) => {
        unlisten = fn
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Failed to register deep link listener')
      })

    return () => {
      unlisten?.()
    }
  }, [])

  if (error) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-gray-900 px-6">
        <p role="alert" className="text-sm text-red-400 text-center bg-red-900/30 rounded-lg px-4 py-3">
          {error}
        </p>
      </main>
    )
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-900">
      <p className="text-sm text-gray-400">Completing sign in…</p>
    </main>
  )
}
