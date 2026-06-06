import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import type { User } from '@supabase/supabase-js'

/**
 * App-level hook: subscribes to crs_sessions INSERT and navigates to the
 * session page when a new active session is started for any of the
 * faculty's courses. Designed to run at the top of the component tree so
 * it fires regardless of which page the faculty is currently viewing.
 *
 * Fetches course IDs first, then opens the Realtime channel, so the
 * lookup Set is populated before any INSERT events can arrive.
 */
export function useActiveSessionRedirect(user: User | null): void {
  const navigate = useNavigate()

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
}
