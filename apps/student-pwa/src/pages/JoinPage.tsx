import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import type { ValidateQRResponse } from '@crs/types'
import { supabase } from '../lib/supabase'
import { signInWithGoogle } from '../lib/auth'
import { useSession } from '../hooks/useSession'

type Status = 'loading' | 'redirecting-to-auth' | 'error'

/**
 * /join?token=<qr_token>
 *
 * Entry point for students who scan the QR code with their stock camera app.
 * The QR code encodes a full URL (this page) so the camera app knows to open
 * it in a browser without needing the student-pwa to already be installed.
 *
 * Flow:
 *   authenticated  → validate token → navigate to session
 *   unauthenticated → OAuth with returnTo preserved → back here → validate
 *
 * The token survives the OAuth round-trip because signInWithGoogle embeds
 * the current path in the Supabase redirectTo callback URL, and AuthCallback
 * reads it back and navigates here after the session is established.
 */
export default function JoinPage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { user, loading: sessionLoading } = useSession()
  const token = searchParams.get('token')

  const [status, setStatus] = useState<Status>('loading')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  // Guard so the effect only fires once per mount regardless of re-renders.
  const attempted = useRef(false)

  useEffect(() => {
    if (sessionLoading || attempted.current) return

    if (!token) {
      // No token in URL — nothing to do, send to landing.
      navigate('/', { replace: true })
      return
    }

    if (!user) {
      // Not authenticated. Trigger OAuth and embed the return destination so
      // AuthCallback can navigate back here after login completes.
      attempted.current = true
      setStatus('redirecting-to-auth')
      void signInWithGoogle({ returnTo: `/join?token=${encodeURIComponent(token)}` })
      return
    }

    // Authenticated — validate the token immediately.
    attempted.current = true
    void (async () => {
      try {
        const { data, error } = await supabase.functions.invoke<ValidateQRResponse>(
          'validate-qr',
          { body: { qr_token: token } },
        )
        if (error) throw error
        if (data?.error) throw new Error(data.error)
        if (!data?.success || !data.session_id || !data.course_id) {
          throw new Error('Could not join session. Please try again.')
        }
        navigate(`/courses/${data.course_id}/session/${data.session_id}`, { replace: true })
      } catch (err) {
        setErrorMessage(
          err instanceof Error ? err.message : 'Something went wrong, please try again.',
        )
        setStatus('error')
      }
    })()
  }, [sessionLoading, user, token, navigate])

  if (status === 'error') {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center bg-white px-6 gap-4">
        <div
          className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center"
          aria-hidden="true"
        >
          <svg
            className="w-6 h-6 text-red-600"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </div>
        <p role="alert" className="text-sm text-red-600 text-center max-w-xs">
          {errorMessage ?? 'Failed to join session.'}
        </p>
        <button
          onClick={() => navigate('/', { replace: true })}
          className="text-sm text-blue-600 underline hover:text-blue-800"
        >
          Go to home
        </button>
      </main>
    )
  }

  // Loading / redirecting-to-auth — just show a spinner. The 'redirecting-to-auth'
  // case causes an immediate page redirect to Google, so this is only visible
  // for a brief moment.
  return (
    <main className="min-h-screen flex items-center justify-center bg-white">
      <div
        className="w-10 h-10 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin"
        role="status"
        aria-label="Joining session…"
      />
    </main>
  )
}
