import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import type { ValidateQRResponse } from '@crs/types'
import { Button, QRScanner } from '@crs/ui'
import { supabase } from '../lib/supabase'

interface LocationState {
  sessionId?: string | null
}

type ScanState = 'idle' | 'validating' | 'success' | 'error'

export default function QRScanPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const state = (location.state ?? {}) as LocationState
  const sessionId = state.sessionId ?? null

  const [scanState, setScanState] = useState<ScanState>('idle')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  async function handleScan(token: string) {
    if (scanState !== 'idle') return

    // The QR token may encode a raw token string, or it may be a URL from
    // which we extract the token. We accept the raw value as-is for now.
    const qrToken = token.trim()

    if (!sessionId) {
      setErrorMessage('No active session found. Please return to your course and try again.')
      setScanState('error')
      return
    }

    setScanState('validating')
    setErrorMessage(null)

    try {
      const { data, error } = await supabase.functions.invoke<ValidateQRResponse>('validate-qr', {
        body: { qr_token: qrToken, session_id: sessionId },
      })

      if (error) throw error
      if (data?.error) throw new Error(data.error)
      if (!data?.success) throw new Error('Attendance could not be recorded. Please try again.')

      setScanState('success')
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Something went wrong, please refresh')
      setScanState('error')
    }
  }

  function handleScanError(err: string) {
    setErrorMessage(err)
    setScanState('error')
  }

  function handleRetry() {
    setErrorMessage(null)
    setScanState('idle')
  }

  return (
    <main className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-gray-100 px-4 py-3 flex items-center gap-3">
        <button
          onClick={() => navigate(-1)}
          aria-label="Go back"
          className="text-gray-400 hover:text-gray-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h1 className="text-base font-semibold text-gray-900">Scan attendance QR</h1>
      </header>

      <div className="flex-1 px-4 py-6 max-w-lg mx-auto w-full flex flex-col gap-6">

        {/* Success state */}
        {scanState === 'success' && (
          <div
            role="alert"
            className="flex flex-col items-center gap-4 py-12 text-center"
          >
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center" aria-hidden="true">
              <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <div>
              <p className="text-xl font-semibold text-gray-900">Attendance marked!</p>
              <p className="text-sm text-gray-500 mt-1">Your attendance has been recorded.</p>
            </div>
            <Button variant="secondary" onClick={() => navigate(-1)} className="mt-2">
              Done
            </Button>
          </div>
        )}

        {/* Validating state */}
        {scanState === 'validating' && (
          <div className="flex flex-col items-center gap-4 py-12 text-center" aria-live="polite">
            <div
              className="w-10 h-10 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin"
              aria-hidden="true"
            />
            <p className="text-gray-500 text-base">Verifying attendance…</p>
          </div>
        )}

        {/* Error state */}
        {scanState === 'error' && (
          <div className="flex flex-col items-center gap-4 py-8 text-center">
            <div className="w-14 h-14 bg-red-100 rounded-full flex items-center justify-center" aria-hidden="true">
              <svg className="w-7 h-7 text-red-600" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <div>
              <p className="text-base font-semibold text-gray-900">Scan failed</p>
              {errorMessage && (
                <p role="alert" className="text-sm text-red-600 mt-1">{errorMessage}</p>
              )}
            </div>
            <Button onClick={handleRetry}>Try again</Button>
          </div>
        )}

        {/* Idle — show scanner */}
        {scanState === 'idle' && (
          <div className="flex flex-col gap-4">
            <p className="text-sm text-gray-500 text-center">
              Point your camera at the QR code displayed by your instructor.
            </p>
            <div className="rounded-xl overflow-hidden shadow-sm border border-gray-200">
              <QRScanner onScan={(token) => void handleScan(token)} onError={handleScanError} />
            </div>
            {!sessionId && (
              <p role="alert" className="text-amber-700 text-sm bg-amber-50 rounded-lg px-3 py-2 text-center">
                No active session detected. Make sure you've joined your course's active session first.
              </p>
            )}
          </div>
        )}
      </div>
    </main>
  )
}
