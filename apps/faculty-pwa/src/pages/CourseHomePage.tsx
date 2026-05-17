import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { startSession } from '../lib/session'
import { Button, QRCode } from '@crs/ui'
import type { Course, CRSSession } from '@crs/types'

interface SessionSummary {
  id: string
  started_at: string
  ended_at: string | null
  question_count: number
}

export default function CourseHomePage() {
  const { courseId } = useParams<{ courseId: string }>()
  const navigate = useNavigate()

  const [course, setCourse] = useState<Course | null>(null)
  const [sessions, setSessions] = useState<SessionSummary[]>([])
  const [activeSession, setActiveSession] = useState<CRSSession | null>(null)
  const [loading, setLoading] = useState(true)
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!courseId) return

    async function load() {
      setLoading(true)
      setError(null)

      try {
        // Load course
        const { data: courseData, error: courseError } = await supabase
          .from('courses')
          .select('*')
          .eq('id', courseId)
          .single()

        if (courseError) throw new Error(courseError.message)
        setCourse(courseData as Course)

        // Load sessions
        const { data: sessionsData, error: sessionsError } = await supabase
          .from('crs_sessions')
          .select('id, started_at, ended_at')
          .eq('course_id', courseId)
          .order('started_at', { ascending: false })

        if (sessionsError) throw new Error(sessionsError.message)

        const sessionList = (sessionsData ?? []) as Array<{
          id: string
          started_at: string
          ended_at: string | null
        }>

        // Get question counts for each session
        const summaries: SessionSummary[] = await Promise.all(
          sessionList.map(async (s) => {
            const { count } = await supabase
              .from('crs_questions')
              .select('id', { count: 'exact', head: true })
              .eq('session_id', s.id)
            return { ...s, question_count: count ?? 0 }
          }),
        )

        setSessions(summaries)

        // Find active session (no ended_at)
        const active = sessionList.find((s) => s.ended_at === null)
        if (active) {
          const { data: fullSession } = await supabase
            .from('crs_sessions')
            .select('*')
            .eq('id', active.id)
            .single()
          setActiveSession(fullSession as CRSSession)
        } else {
          setActiveSession(null)
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load course')
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [courseId])

  async function handleStartSession() {
    if (!courseId) return
    setStarting(true)
    setError(null)
    try {
      const session = await startSession(courseId)
      navigate(`/courses/${courseId}/session/${session.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start session')
    } finally {
      setStarting(false)
    }
  }

  function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  if (loading) {
    return (
      <main className="flex items-center justify-center min-h-screen">
        <p className="text-gray-500">Loading…</p>
      </main>
    )
  }

  if (!course) {
    return (
      <main className="flex items-center justify-center min-h-screen">
        <p className="text-red-600">Course not found.</p>
      </main>
    )
  }

  const joinUrl = `${window.location.origin}/join/${course.join_code}`

  return (
    <main className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-4 py-4 flex items-center gap-3">
        <button
          onClick={() => navigate('/courses')}
          className="text-blue-600 font-medium text-sm"
          aria-label="Back to courses"
        >
          ← Back
        </button>
        <h1 className="text-xl font-bold text-gray-900 truncate">{course.name}</h1>
      </header>

      <div className="px-4 py-6 max-w-lg mx-auto space-y-6">
        {error && (
          <p role="alert" className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">
            {error}
          </p>
        )}

        {/* Join code + QR */}
        <section className="bg-white rounded-xl border border-gray-200 p-5 text-center">
          <p className="text-sm text-gray-500 mb-1">Join code</p>
          <p className="text-4xl font-mono font-bold tracking-widest text-gray-900 mb-4">
            {course.join_code}
          </p>
          <div className="flex justify-center">
            <QRCode value={joinUrl} size={180} />
          </div>
          <p className="text-xs text-gray-400 mt-3 break-all">{joinUrl}</p>
        </section>

        {/* Session actions */}
        <section className="space-y-3">
          {activeSession ? (
            <>
              <Button
                size="lg"
                className="w-full"
                onClick={() => navigate(`/courses/${courseId}/session/${activeSession.id}`)}
              >
                Resume active session
              </Button>
              <Button
                size="lg"
                variant="secondary"
                className="w-full"
                onClick={handleStartSession}
                disabled={starting}
              >
                {starting ? 'Starting…' : 'Start new session'}
              </Button>
            </>
          ) : (
            <Button
              size="lg"
              className="w-full"
              onClick={handleStartSession}
              disabled={starting}
            >
              {starting ? 'Starting…' : 'Start session'}
            </Button>
          )}
        </section>

        {/* Session history */}
        <section>
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
            Session history
          </h2>
          {sessions.length === 0 ? (
            <p className="text-gray-400 text-sm">No sessions yet.</p>
          ) : (
            <ul className="space-y-2" aria-label="Session history">
              {sessions.map((s) => (
                <li
                  key={s.id}
                  className="bg-white rounded-xl border border-gray-200 px-4 py-3 flex items-center justify-between"
                >
                  <div>
                    <p className="text-sm font-medium text-gray-900">{formatDate(s.started_at)}</p>
                    <p className="text-xs text-gray-500">
                      {s.question_count} question{s.question_count !== 1 ? 's' : ''}
                      {s.ended_at === null && (
                        <span className="ml-2 text-green-600 font-semibold">• Active</span>
                      )}
                    </p>
                  </div>
                  {s.ended_at && (
                    <p className="text-xs text-gray-400">{formatDate(s.ended_at)}</p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  )
}
