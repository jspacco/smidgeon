import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import type { ValidateQRResponse } from '@crs/types'
import { Button, QRScanner } from '@crs/ui'
import { supabase } from '../lib/supabase'

interface LocationState {
  courseId?: string | null
}

type ScanState = 'idle' | 'validating' | 'success' | 'error'
type EntryMode = 'qr' | 'code'

export default function QRScanPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const state = (location.state ?? {}) as LocationState
  const courseId = state.courseId ?? null

  const [scanState, setScanState] = useState<ScanState>('idle')
  const [entryMode, setEntryMode] = useState<EntryMode>('qr')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [codeInput, setCodeInput] = useState('')
  const [submittingCode, setSubmittingCode] = useState(false)

  async function validate(body: { qr_token?: string; session_code?: string }) {
    if (scanState !== 'idle') return

    setScanState('validating')
    setErrorMessage(null)

    try {
      const { data, error } = await supabase.functions.invoke<ValidateQRResponse>('validate-qr', {
        body,
      })

      if (error) throw error
      if (data?.error) throw new Error(data.error)
      if (!data?.success || !data.session_id) {
        throw new Error('Attendance could not be recorded. Please try again.')
      }

      setScanState('success')

      // Navigate into the session after a brief moment so the user sees the success state
      if (courseId) {
        setTimeout(() => {
          navigate(`/courses/${courseId}/session/${data.session_id}`, { replace: true })
        }, 1200)
      }
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Something went wrong, please refresh')
      setScanState('error')
    }
  }

  async function handleScan(token: string) {
    await validate({ qr_token: token.trim() })
  }

  async function handleCodeSubmit(e: React.FormEvent) {
    e.preventDefault()
    const code = codeInput.trim()
    if (code.length !== 4) return

    setSubmittingCode(true)
    await validate({ session_code: code })
    setSubmittingCode(false)
  }

  function handleScanError(err: string) {
    setErrorMessage(err)
    setScanState('error')
  }

  function handleRetry() {
    setErrorMessage(null)
    setCodeInput('')
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
        <h1 className="text-base font-semibold text-gray-900">Join session</h1>
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
              <p className="text-xl font-semibold text-gray-900">You're in!</p>
              <p className="text-sm text-gray-500 mt-1">Attendance recorded. Joining session…</p>
            </div>
          </div>
        )}

        {/* Validating state */}
        {scanState === 'validating' && (
          <div className="flex flex-col items-center gap-4 py-12 text-center" aria-live="polite">
            <div
              className="w-10 h-10 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin"
              aria-hidden="true"
            />
            <p className="text-gray-500 text-base">Verifying…</p>
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
              <p className="text-base font-semibold text-gray-900">Could not join</p>
              {errorMessage && (
                <p role="alert" className="text-sm text-red-600 mt-1">{errorMessage}</p>
              )}
            </div>
            <Button onClick={handleRetry}>Try again</Button>
          </div>
        )}

        {/* Idle — show QR scanner or code input */}
        {scanState === 'idle' && (
          <>
            {/* Mode toggle */}
            <div className="flex rounded-lg border border-gray-200 overflow-hidden" role="tablist">
              <button
                role="tab"
                aria-selected={entryMode === 'qr'}
                onClick={() => setEntryMode('qr')}
                className={[
                  'flex-1 py-2.5 text-sm font-medium transition-colors',
                  entryMode === 'qr'
                    ? 'bg-blue-600 text-white'
                    : 'bg-white text-gray-600 hover:bg-gray-50',
                ].join(' ')}
              >
                Scan QR
              </button>
              <button
                role="tab"
                aria-selected={entryMode === 'code'}
                onClick={() => setEntryMode('code')}
                className={[
                  'flex-1 py-2.5 text-sm font-medium transition-colors',
                  entryMode === 'code'
                    ? 'bg-blue-600 text-white'
                    : 'bg-white text-gray-600 hover:bg-gray-50',
                ].join(' ')}
              >
                Enter code
              </button>
            </div>

            {entryMode === 'qr' && (
              <div className="flex flex-col gap-4">
                <p className="text-sm text-gray-500 text-center">
                  Point your camera at the QR code displayed by your instructor.
                </p>
                <div className="rounded-xl overflow-hidden shadow-sm border border-gray-200">
                  <QRScanner onScan={(token) => void handleScan(token)} onError={handleScanError} />
                </div>
                {!courseId && (
                  <p role="alert" className="text-amber-700 text-sm bg-amber-50 rounded-lg px-3 py-2 text-center">
                    No course context. Please go back and tap a course first.
                  </p>
                )}
              </div>
            )}

            {entryMode === 'code' && (
              <form
                onSubmit={(e) => void handleCodeSubmit(e)}
                className="flex flex-col gap-4"
              >
                <p className="text-sm text-gray-500 text-center">
                  Enter the 4-digit code shown by your instructor.
                </p>
                <div>
                  <label htmlFor="session-code" className="sr-only">
                    4-digit session code
                  </label>
                  <input
                    id="session-code"
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]{4}"
                    maxLength={4}
                    value={codeInput}
                    onChange={(e) => setCodeInput(e.target.value.replace(/\D/g, '').slice(0, 4))}
                    placeholder="0000"
                    autoComplete="off"
                    className="w-full text-center text-4xl font-mono font-bold tracking-widest border-2 border-gray-300 rounded-xl px-4 py-4 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    aria-label="Session code"
                  />
                </div>
                <Button
                  type="submit"
                  size="lg"
                  className="w-full"
                  disabled={codeInput.length !== 4 || submittingCode}
                >
                  {submittingCode ? 'Joining…' : 'Join session'}
                </Button>
              </form>
            )}
          </>
        )}
      </div>
    </main>
  )
}
