import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { QRCode } from '@crs/ui'
import type { CRSSession } from '@crs/types'

export function QRWindow() {
  const [session, setSession] = useState<CRSSession | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function loadActiveSession() {
      try {
        // Find the most recently started active session (no ended_at)
        const { data, error: fetchError } = await supabase
          .from('crs_sessions')
          .select('*')
          .is('ended_at', null)
          .order('started_at', { ascending: false })
          .limit(1)
          .maybeSingle()

        if (fetchError) throw new Error(fetchError.message)
        setSession(data as CRSSession | null)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load session')
      }
    }

    loadActiveSession()
  }, [])

  if (error) {
    return (
      <main className="flex items-center justify-center min-h-screen bg-white px-4">
        <p role="alert" className="text-red-600 text-sm text-center">
          {error}
        </p>
      </main>
    )
  }

  if (!session) {
    return (
      <main className="flex items-center justify-center min-h-screen bg-white">
        <p className="text-gray-400 text-sm">Loading…</p>
      </main>
    )
  }

  return (
    <main className="flex flex-col items-center justify-center min-h-screen bg-white p-6">
      <h1 className="text-base font-bold text-gray-900 mb-1">Scan to mark attendance</h1>
      <p className="text-xs text-gray-500 mb-6">
        Students can scan anytime during the session
      </p>
      <QRCode value={session.qr_token} size={240} />
      <p className="text-xs font-mono text-gray-400 mt-4 tracking-wider">
        {session.qr_token}
      </p>
    </main>
  )
}
