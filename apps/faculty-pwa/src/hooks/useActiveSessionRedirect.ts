import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import type { User } from '@supabase/supabase-js'

/**
 * App-level hook with two responsibilities:
 *
 * 1. INSERT watcher — subscribes to crs_sessions INSERT for any of the
 *    faculty's courses. When a new active session appears, navigates to
 *    the session page with { autoJoined: true }. Runs whenever the user
 *    is authenticated, regardless of which page is shown.
 *
 * 2. UPDATE watcher — when currentSessionId is provided (i.e. faculty is
 *    on a session page), subscribes to UPDATE events on that specific
 *    session. When ended_at becomes non-null, navigates back to the
 *    course page with { message: 'Session ended' }.
 */
export function useActiveSessionRedirect(
  user: User | null,
  currentSessionId: string | null = null,
): void {
  const navigate = useNavigate()

  // --- INSERT watcher: auto-navigate when a new session starts ---
  useEffect(() => {
    if (!user) return

    let channel: ReturnType<typeof supabase.channel> | null = null
    let cancelled = false

    async function setup() {
      const { data } = await supabase
        .from('enrollments')
        .select('course_id')
        .eq('user_id', user!.id)
        .in('role', ['INSTRUCTOR', 'TA'])

      if (cancelled) return

      const courseIds = new Set(
        (data ?? []).map((e: { course_id: string }) => e.course_id),
      )

      channel = supabase
        .channel('app-active-session-redirect')
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'crs_sessions' },
          (payload) => {
            const session = payload.new as {
              id: string
              course_id: string
              ended_at: string | null
            }
            if (session.ended_at !== null) return
            if (!courseIds.has(session.course_id)) return
            navigate(
              `/courses/${session.course_id}/session/${session.id}`,
              { state: { autoJoined: true } },
            )
          },
        )
        .subscribe()
    }

    void setup()

    return () => {
      cancelled = true
      if (channel) void supabase.removeChannel(channel)
    }
  }, [user, navigate])

  // --- UPDATE watcher: detect session-ended while on the session page ---
  useEffect(() => {
    if (!currentSessionId) return

    const channel = supabase
      .channel(`session-ended-${currentSessionId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'crs_sessions',
          filter: `id=eq.${currentSessionId}`,
        },
        (payload) => {
          const updated = payload.new as { ended_at: string | null; course_id: string }
          if (updated.ended_at !== null) {
            navigate(`/courses/${updated.course_id}`, {
              replace: true,
              state: { message: 'Session ended' },
            })
          }
        },
      )
      .subscribe()

    return () => { void supabase.removeChannel(channel) }
  }, [currentSessionId, navigate])
}
