import { useEffect, useState } from 'react'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { supabase } from '../lib/supabase'
import { QRCode } from '@crs/ui'
import type { CRSSession } from '@crs/types'

export function QRWindow() {
  const [session, setSession] = useState<CRSSession | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Handle the OS close button — confirm and destroy the window
  useEffect(() => {
    const win = getCurrentWindow()
    let unlisten: (() => void) | null = null
    win.listen('tauri://close-requested', async () => {
      await win.destroy()
    }).then(fn => { unlisten = fn })
    return () => { unlisten?.() }
  }, [])

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
    <main className="flex flex-col items-center justify-center min-h-screen bg-white p-8 gap-6">
      <h1 className="text-2xl font-bold text-gray-900">Scan to join</h1>
      <QRCode value={session.qr_token} size={420} />
      <div className="flex flex-col items-center gap-1">
        <p className="text-sm text-gray-500">or enter session code</p>
        <p className="text-6xl font-mono font-bold tracking-widest text-gray-900">
          {session.session_code}
        </p>
      </div>
    </main>
  )
}
