import { useEffect, useState } from 'react'
import { IconPlayerPlay, IconLogout } from '@tabler/icons-react'
import { WebviewWindow } from '@tauri-apps/api/webviewWindow'
import { supabase } from '../lib/supabase'
import { startSession, reopenSession } from '../lib/session'
import type { User } from '@supabase/supabase-js'
import type { Course, CRSSession } from '@crs/types'

interface SessionSelectorProps {
  user: User
  onSessionStarted: (course: Course, session: CRSSession) => void
}

function formatSessionLabel(session: CRSSession): string {
  const d = new Date(session.started_at)
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  const hh = String(d.getHours()).padStart(2, '0')
  const min = String(d.getMinutes()).padStart(2, '0')
  const ss = String(d.getSeconds()).padStart(2, '0')
  const dt = `${yyyy}-${mm}-${dd} ${hh}:${min}:${ss}`
  return session.ended_at === null ? `${dt}  [OPEN]` : dt
}

const SELECT_CLASS =
  'h-9 rounded bg-gray-800 border border-gray-600 text-gray-200 text-sm px-2 ' +
  'focus:outline-none focus:border-cyan-500 disabled:opacity-50 disabled:cursor-not-allowed'

export function SessionSelector({ user, onSessionStarted }: SessionSelectorProps) {
  const [courses, setCourses] = useState<Course[]>([])
  const [selectedCourseId, setSelectedCourseId] = useState<string>('')
  const [sessions, setSessions] = useState<CRSSession[]>([])
  const [selectedSessionId, setSelectedSessionId] = useState<string>('new')
  const [loading, setLoading] = useState(true)
  const [sessionsLoading, setSessionsLoading] = useState(false)
  const [joining, setJoining] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Load courses where user is INSTRUCTOR
  useEffect(() => {
    async function loadCourses() {
      setLoading(true)
      setError(null)
      try {
        const { data, error: fetchError } = await supabase
          .from('enrollments')
          .select('course_id, courses(*)')
          .eq('user_id', user.id)
          .eq('role', 'INSTRUCTOR')

        if (fetchError) throw new Error(fetchError.message)

        const fetched = (data ?? []) as unknown as Array<{ course_id: string; courses: Course }>
        const courseList = fetched.map((e) => e.courses).filter(Boolean)
        setCourses(courseList)
        if (courseList.length > 0) setSelectedCourseId(courseList[0]!.id)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load courses')
      } finally {
        setLoading(false)
      }
    }
    loadCourses()
  }, [user.id])

  // Load sessions when selected course changes
  useEffect(() => {
    if (!selectedCourseId) {
      setSessions([])
      setSelectedSessionId('new')
      return
    }

    async function loadSessions() {
      setSessionsLoading(true)
      try {
        const { data, error: fetchError } = await supabase
          .from('crs_sessions')
          .select('*')
          .eq('course_id', selectedCourseId)
          .order('started_at', { ascending: false })
          .limit(10)

        if (fetchError) throw new Error(fetchError.message)
        setSessions((data ?? []) as CRSSession[])
        setSelectedSessionId('new')
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load sessions')
      } finally {
        setSessionsLoading(false)
      }
    }
    loadSessions()
  }, [selectedCourseId])

  async function handleJoin() {
    if (!selectedCourseId) return
    setJoining(true)
    setError(null)
    try {
      const course = courses.find((c) => c.id === selectedCourseId)!
      const session =
        selectedSessionId === 'new'
          ? await startSession(selectedCourseId)
          : await reopenSession(selectedSessionId)
      onSessionStarted(course, session)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to join session')
      setJoining(false)
    }
  }

  async function handleLogout() {
    await supabase.auth.signOut()
    WebviewWindow.getByLabel('qr').then((w) => w?.close())
    WebviewWindow.getByLabel('results').then((w) => w?.close())
  }

  if (loading) {
    return (
      <div
        data-tauri-drag-region
        className="flex items-center bg-gray-900 px-3 gap-2"
        style={{ height: 60 }}
      >
        <p data-tauri-drag-region className="text-gray-400 text-sm">
          Loading courses…
        </p>
      </div>
    )
  }

  if (courses.length === 0) {
    return (
      <div
        data-tauri-drag-region
        className="flex items-center bg-gray-900 px-3 gap-2"
        style={{ height: 60 }}
      >
        <p data-tauri-drag-region className="text-gray-400 text-sm">
          No courses found. Create one in the Faculty PWA first.
        </p>
        <button
          onClick={handleLogout}
          className="ml-auto flex items-center justify-center w-9 h-9 rounded text-gray-400 hover:text-gray-200 hover:bg-gray-700 transition-colors shrink-0"
          aria-label="Logout"
        >
          <IconLogout size={18} />
        </button>
      </div>
    )
  }

  return (
    <div
      data-tauri-drag-region
      className="flex items-center bg-gray-900 px-3 gap-2"
      style={{ height: 60 }}
    >
      {/* Course select */}
      <select
        value={selectedCourseId}
        onChange={(e) => setSelectedCourseId(e.target.value)}
        className={SELECT_CLASS}
        disabled={joining}
        aria-label="Select course"
      >
        {courses.map((course) => (
          <option key={course.id} value={course.id}>
            {course.name}
          </option>
        ))}
      </select>

      {/* Session select */}
      <select
        value={selectedSessionId}
        onChange={(e) => setSelectedSessionId(e.target.value)}
        className={SELECT_CLASS}
        disabled={joining || sessionsLoading}
        aria-label="Select session"
      >
        <option value="new">— new session —</option>
        {sessions.map((s) => (
          <option key={s.id} value={s.id}>
            {formatSessionLabel(s)}
          </option>
        ))}
      </select>

      {/* Join button */}
      <button
        onClick={handleJoin}
        disabled={joining || !selectedCourseId}
        className="flex items-center gap-1 px-3 h-9 rounded bg-green-600 hover:bg-green-500 text-white text-sm font-medium shrink-0 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        aria-label={joining ? 'Joining…' : 'Join session'}
      >
        <IconPlayerPlay size={14} />
        {joining ? 'Joining…' : 'Join'}
      </button>

      {/* Inline error */}
      {error && (
        <span
          role="alert"
          data-tauri-drag-region
          className="text-xs text-red-400 shrink-0 truncate max-w-48"
        >
          {error}
        </span>
      )}

      {/* Logout — right side */}
      <button
        onClick={handleLogout}
        className="ml-auto flex items-center justify-center w-9 h-9 rounded text-gray-400 hover:text-gray-200 hover:bg-gray-700 transition-colors shrink-0"
        aria-label="Logout"
      >
        <IconLogout size={18} />
      </button>
    </div>
  )
}
