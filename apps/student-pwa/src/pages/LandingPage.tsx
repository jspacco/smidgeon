import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import type { ValidateQRResponse } from '@crs/types'
import { Button, QRScanner } from '@crs/ui'
import { supabase } from '../lib/supabase'
import { signOut } from '../lib/auth'

type ScanState = 'idle' | 'scanning' | 'validating' | 'success' | 'error'

interface LocationState {
  message?: string
}

export default function LandingPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const message = (location.state as LocationState | null)?.message ?? null

  const [scanState, setScanState] = useState<ScanState>('idle')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [codeInput, setCodeInput] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function validate(body: { qr_token?: string; session_code?: string }) {
    if (scanState === 'validating' || scanState === 'success') return
    setScanState('validating')
    setErrorMessage(null)

    try {
      const { data, error } = await supabase.functions.invoke<ValidateQRResponse>('validate-qr', {
        body,
      })

      if (error) throw error
      if (data?.error) throw new Error(data.error)
      if (!data?.success || !data.session_id || !data.course_id) {
        throw new Error('Could not join session. Please try again.')
      }

      setScanState('success')
      setTimeout(() => {
        navigate(`/courses/${data.course_id}/session/${data.session_id}`, { replace: true })
      }, 900)
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Something went wrong, please try again.')
      setScanState('error')
    }
  }

  async function handleScan(rawValue: string) {
    // QR codes now encode a full URL: https://smidgeon.app/join?token=<uuid>
    // Extract the token query parameter if present; fall back to treating the
    // entire scanned string as a bare token for backward compatibility with any
    // cached/printed QR codes from before this change.
    let token: string
    try {
      const url = new URL(rawValue)
      token = url.searchParams.get('token') ?? rawValue.trim()
    } catch {
      // Not a valid URL — old bare-UUID format or manual test value.
      token = rawValue.trim()
    }
    await validate({ qr_token: token })
  }

  async function handleCodeSubmit(e: React.FormEvent) {
    e.preventDefault()
    const code = codeInput.trim()
    if (code.length !== 6) return
    setSubmitting(true)
    await validate({ session_code: code })
    setSubmitting(false)
  }

  function handleRetry() {
    setErrorMessage(null)
    setCodeInput('')
    setScanState('idle')
  }

  async function handleSignOut() {
    await signOut()
    navigate('/')
  }

  return (
    <main className="min-h-screen bg-white flex flex-col">
      {/* Top bar */}
      <header className="flex items-center justify-between px-5 pt-6 pb-2">
        <h1 className="text-2xl font-black tracking-tight text-gray-900">
          smidgeon
        </h1>
        <button
          onClick={() => void handleSignOut()}
          className="text-xs text-gray-400 hover:text-gray-600"
        >
          Sign out
        </button>
      </header>

      <div className="flex-1 flex flex-col justify-center px-5 pb-10 max-w-sm mx-auto w-full gap-6">

        {/* Session-ended or other status message */}
        {message && (
          <p
            role="status"
            className="text-center text-sm text-gray-500 bg-gray-50 rounded-xl px-4 py-3"
          >
            {message}
          </p>
        )}

        {/* Success */}
        {scanState === 'success' && (
          <div
            role="alert"
            className="flex flex-col items-center gap-3 py-8 text-center"
          >
            <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center" aria-hidden="true">
              <svg className="w-7 h-7 text-green-600" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <p className="text-lg font-semibold text-gray-900">You're in!</p>
            <p className="text-sm text-gray-500">Joining session…</p>
          </div>
        )}

        {/* Validating */}
        {scanState === 'validating' && (
          <div className="flex flex-col items-center gap-3 py-8 text-center" aria-live="polite">
            <div
              className="w-10 h-10 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin"
              aria-hidden="true"
            />
            <p className="text-gray-500 text-sm">Verifying…</p>
          </div>
        )}

        {/* Error */}
        {scanState === 'error' && (
          <div className="flex flex-col items-center gap-4 py-6 text-center">
            <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center" aria-hidden="true">
              <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            {errorMessage && (
              <p role="alert" className="text-sm text-red-600">{errorMessage}</p>
            )}
            <Button onClick={handleRetry}>Try again</Button>
          </div>
        )}

        {/* Idle — main entry UI */}
        {(scanState === 'idle' || scanState === 'scanning') && (
          <>
            {/* QR scan */}
            {scanState === 'scanning' ? (
              <div className="flex flex-col gap-3">
                <div className="rounded-xl overflow-hidden border border-gray-200 shadow-sm">
                  <QRScanner
                    onScan={(token) => void handleScan(token)}
                    onError={(err) => { setErrorMessage(err); setScanState('error') }}
                  />
                </div>
                <button
                  onClick={() => setScanState('idle')}
                  className="text-sm text-gray-400 hover:text-gray-600 text-center"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <Button
                onClick={() => setScanState('scanning')}
                size="lg"
                className="w-full"
              >
                Scan QR code
              </Button>
            )}

            {/* Divider */}
            <div className="flex items-center gap-3">
              <div className="flex-1 h-px bg-gray-200" aria-hidden="true" />
              <span className="text-xs text-gray-400 shrink-0">or enter code</span>
              <div className="flex-1 h-px bg-gray-200" aria-hidden="true" />
            </div>

            {/* 6-digit code entry */}
            <form onSubmit={(e) => void handleCodeSubmit(e)} className="flex flex-col gap-4">
              <div>
                <label htmlFor="session-code" className="sr-only">
                  6-digit session code
                </label>
                <input
                  id="session-code"
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  value={codeInput}
                  onChange={(e) => setCodeInput(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="000000"
                  autoComplete="off"
                  className="w-full text-center text-4xl font-mono font-bold tracking-widest border-2 border-gray-200 rounded-xl px-4 py-4 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  aria-label="6-digit session code"
                />
              </div>
              <Button
                type="submit"
                size="lg"
                className="w-full"
                disabled={codeInput.length !== 6 || submitting}
              >
                {submitting ? 'Joining…' : 'Join session'}
              </Button>
            </form>
          </>
        )}
      </div>
    </main>
  )
}
