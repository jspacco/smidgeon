import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function AuthCallback() {
  const navigate = useNavigate()
  
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const error = params.get('error')
    const errorDescription = params.get('error_description')
    //console.log('auth callback params:', { error, errorDescription })

    if (error) {
      const message = errorDescription ?? error ?? 'Sign-in failed. Please try again.'
      navigate(`/?error=${encodeURIComponent(message)}`, { replace: true })
      return
    }
    
    supabase.auth.getSession().then(({ data, error }) => {
      if (data.session) {
        navigate('/courses', { replace: true })
      } else {
        navigate('/', {
          replace: true,
          state: { error: error?.message ?? 'Sign-in failed. Please try again.' },
        })
      }
    })
  }, [navigate])
  
  return (
    <div className="min-h-screen flex items-center justify-center text-gray-500">
      Signing in...
    </div>
  )
}
