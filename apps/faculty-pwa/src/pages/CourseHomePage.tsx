import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { startSession, endSession, reopenSession } from '../lib/session'
import { Button, QRCode } from '@crs/ui'
import type { Course, CRSSession } from '@crs/types'

interface SessionSummary {
  id: string
  started_at: string
  ended_at: string | null
  question_count: number
}

// YYYY-MM-DD HH:MM:SS 24-hour local time
function formatDatetime(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
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
  const [sessionAction, setSessionAction] = useState<string | null>(null)

  useEffect(() => {
    if (!courseId) return
    void load()
  }, [courseId])

  async function load() {
    setLoading(true)
    setError(null)

    try {
      const { data: courseData, error: courseError } = await supabase
        .from('courses')
        .select('*')
        .eq('id', courseId)
        .single()

      if (courseError) throw new Error(courseError.message)
      setCourse(courseData as Course)

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

  async function handleEndSession(sessionId: string) {
    setSessionAction(sessionId)
    setError(null)
    try {
      await endSession(sessionId)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to end session')
    } finally {
      setSessionAction(null)
    }
  }

  async function handleReopenSession(sessionId: string) {
    setSessionAction(sessionId)
    setError(null)
    try {
      const session = await reopenSession(sessionId)
      navigate(`/courses/${courseId}/session/${session.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reopen session')
      setSessionAction(null)
    }
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
                  className="bg-white rounded-xl border border-gray-200 px-4 py-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-mono font-medium text-gray-900">
                        {formatDatetime(s.started_at)}
                      </p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {s.question_count} question{s.question_count !== 1 ? 's' : ''}
                        {s.ended_at === null && (
                          <span className="ml-2 text-green-600 font-semibold">• LIVE</span>
                        )}
                        {s.ended_at !== null && (
                          <span className="ml-2 text-gray-400 font-mono">
                            → {formatDatetime(s.ended_at)}
                          </span>
                        )}
                      </p>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      {s.ended_at === null ? (
                        <button
                          onClick={() => void handleEndSession(s.id)}
                          disabled={sessionAction !== null}
                          className="text-xs font-semibold text-white bg-red-600 hover:bg-red-700 active:bg-red-800 disabled:opacity-50 px-3 py-1.5 rounded-lg transition-colors min-h-[36px]"
                          aria-label="End session"
                        >
                          {sessionAction === s.id ? '…' : 'End'}
                        </button>
                      ) : (
                        <button
                          onClick={() => void handleReopenSession(s.id)}
                          disabled={sessionAction !== null}
                          className="text-xs font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200 active:bg-gray-300 disabled:opacity-50 px-3 py-1.5 rounded-lg transition-colors min-h-[36px]"
                          aria-label="Reopen session"
                        >
                          {sessionAction === s.id ? '…' : 'Reopen'}
                        </button>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  )
}
