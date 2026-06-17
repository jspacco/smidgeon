import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function AuthCallback() {
  const navigate = useNavigate()
  useEffect(() => {
    supabase.auth.getSession().then(({ data, error }) => {
      if (data.session) {
        navigate('/courses', { replace: true })
      } else {
        navigate('/login', {
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
