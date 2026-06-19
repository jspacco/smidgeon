import { useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function AuthCallback() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  useEffect(() => {
    // returnTo is set by signInWithGoogle when the OAuth flow was triggered from
    // a specific destination (e.g. /join?token=...). Only accept relative paths
    // to prevent open-redirect attacks.
    const returnTo = searchParams.get('returnTo')
    const safePath = returnTo && returnTo.startsWith('/') ? returnTo : '/'

    supabase.auth.getSession().then(({ data, error }) => {
      if (data.session) {
        navigate(safePath, { replace: true })
      } else {
        navigate('/', {
          replace: true,
          state: { error: error?.message ?? 'Sign-in failed. Please try again.' },
        })
      }
    })
  }, [navigate, searchParams])

  return (
    <div className="min-h-screen flex items-center justify-center text-gray-500">
      Signing in...
    </div>
  )
}
