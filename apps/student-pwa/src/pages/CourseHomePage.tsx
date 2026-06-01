import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import type { Course, CRSSession } from '@crs/types'
import { Button } from '@crs/ui'
import { supabase } from '../lib/supabase'

interface SessionRow extends CRSSession {
  question_count?: number
}

export default function CourseHomePage() {
  const { courseId } = useParams<{ courseId: string }>()
  const navigate = useNavigate()

  const [course, setCourse] = useState<Course | null>(null)
  const [sessions, setSessions] = useState<SessionRow[]>([])
  const [activeSession, setActiveSession] = useState<CRSSession | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!courseId) return
    let cancelled = false

    async function load() {
      setLoading(true)
      setError(null)
      try {
        const [courseRes, sessionsRes, activeRes] = await Promise.all([
          supabase.from('courses').select('*').eq('id', courseId).maybeSingle(),
          supabase
            .from('crs_sessions')
            .select('*')
            .eq('course_id', courseId)
            .order('started_at', { ascending: false })
            .limit(20),
          supabase
            .from('crs_sessions')
            .select('*')
            .eq('course_id', courseId)
            .is('ended_at', null)
            .order('started_at', { ascending: false })
            .limit(1)
            .maybeSingle(),
        ])

        if (courseRes.error) throw courseRes.error
        if (sessionsRes.error) throw sessionsRes.error
        if (activeRes.error) throw activeRes.error

        if (cancelled) return
        setCourse(courseRes.data as Course)
        setSessions((sessionsRes.data ?? []) as SessionRow[])
        setActiveSession(activeRes.data as CRSSession | null)
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load course')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [courseId])

  function handleJoinSession() {
    if (!activeSession || !courseId) return
    navigate(`/courses/${courseId}/session/${activeSession.id}`)
  }

  function handleScanQR() {
    navigate('/scan', {
      state: { courseId: courseId ?? null },
    })
  }

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-gray-50">
        <p className="text-gray-500 text-sm">Loading…</p>
      </main>
    )
  }

  if (error || !course) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center bg-gray-50 px-4 gap-4">
        <p role="alert" className="text-red-600 text-sm text-center">
          {error ?? 'Course not found.'}
        </p>
        <Button variant="secondary" onClick={() => navigate('/courses')}>
          Back to courses
        </Button>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-gray-50 px-4 py-6 max-w-lg mx-auto">
      <header className="flex items-center gap-3 mb-6">
        <button
          onClick={() => navigate('/courses')}
          aria-label="Back to courses"
          className="text-gray-400 hover:text-gray-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold text-gray-900 truncate">{course.name}</h1>
          <p className="text-xs text-gray-400">Code: {course.join_code}</p>
        </div>
      </header>

      {/* Active session banner */}
      {activeSession && (
        <section
          aria-labelledby="active-session-heading"
          className="bg-blue-600 text-white rounded-xl px-4 py-5 mb-6 flex flex-col gap-3"
        >
          <div>
            <p id="active-session-heading" className="text-xs font-semibold uppercase tracking-wide opacity-80">
              Session in progress
            </p>
            <p className="text-sm opacity-90 mt-0.5">
              Started {new Date(activeSession.started_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              onClick={handleJoinSession}
              className="flex-1 bg-white text-blue-600 hover:bg-blue-50"
            >
              Join active session
            </Button>
            <Button
              onClick={handleScanQR}
              variant="ghost"
              className="text-white hover:bg-blue-500"
              aria-label="Scan QR code for attendance"
            >
              Scan QR
            </Button>
          </div>
        </section>
      )}

      {/* Scan QR when no active session */}
      {!activeSession && (
        <div className="mb-6">
          <Button
            variant="secondary"
            onClick={handleScanQR}
            className="w-full"
          >
            Scan QR for attendance
          </Button>
        </div>
      )}

      {/* Session history */}
      <section aria-labelledby="history-heading">
        <h2 id="history-heading" className="text-base font-semibold text-gray-900 mb-3">
          Session history
        </h2>

        {sessions.length === 0 && (
          <p className="text-gray-400 text-sm text-center py-6">No sessions yet.</p>
        )}

        <ul className="flex flex-col gap-2">
          {sessions.map((session) => (
            <li key={session.id}>
              <div className="bg-white rounded-xl px-4 py-3 shadow-sm border border-gray-100">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-900">
                      {new Date(session.started_at).toLocaleDateString([], {
                        weekday: 'short',
                        month: 'short',
                        day: 'numeric',
                      })}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {new Date(session.started_at).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                      {session.ended_at
                        ? ` – ${new Date(session.ended_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                        : ' — in progress'}
                    </p>
                  </div>
                  {!session.ended_at && (
                    <span className="text-xs font-semibold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">
                      Live
                    </span>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </main>
  )
}
