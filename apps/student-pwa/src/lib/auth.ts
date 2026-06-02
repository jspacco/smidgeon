import { supabase } from './supabase'

// When set, restricts sign-in to accounts from this domain (e.g. 'knox.edu').
// Leave unset or empty in .env.local to allow any Google account.
const ALLOWED_DOMAIN = import.meta.env.VITE_ALLOWED_DOMAIN as string | undefined

export async function signInWithGoogle(): Promise<void> {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: window.location.origin,
      queryParams: ALLOWED_DOMAIN ? { hd: ALLOWED_DOMAIN } : undefined,
    },
  })
  if (error) throw error
}

export async function signOut(): Promise<void> {
  const { error } = await supabase.auth.signOut()
  if (error) throw error
}

export async function getSession() {
  const { data, error } = await supabase.auth.getSession()
  if (error) throw error
  return data.session
}
