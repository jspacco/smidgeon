import { useEffect, useState } from 'react'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { LogicalSize } from '@tauri-apps/api/dpi'
import { IconPlayerPlay, IconLogout, IconPlus, IconGripVertical, IconPower } from '@tabler/icons-react'
import { WebviewWindow } from '@tauri-apps/api/webviewWindow'
import { invoke } from '@tauri-apps/api/core'
import { supabase } from '../lib/supabase'
import { startSession, reopenSession, createCourse, enrollInstructor } from '../lib/session'
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

  // Create panel state
  const [showCreatePanel, setShowCreatePanel] = useState(false)
  const [createName, setCreateName] = useState('')
  const [createOptionCount, setCreateOptionCount] = useState<2 | 3 | 4 | 5>(5)
  const [createMultiAnswer, setCreateMultiAnswer] = useState(true)
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

  // Resize window to fit content when create panel opens/closes
  useEffect(() => {
    const win = getCurrentWindow()
    if (showCreatePanel) {
      requestAnimationFrame(() => {
        const height = document.body.scrollHeight
        void win.setSize(new LogicalSize(480, Math.max(60, height)))
      })
    } else {
      void win.setSize(new LogicalSize(480, 60))
    }
  }, [showCreatePanel])

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
        const courseList = fetched.map((e) => e.courses).filter(Boolean).filter((c) => !c.archived_at)
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

  async function handleCreate() {
    if (!createName.trim()) {
      setCreateError('Course name is required')
      return
    }
    setCreating(true)
    setCreateError(null)
    try {
      const course = await createCourse(createName.trim(), createOptionCount, user.id, createMultiAnswer, false)
      await enrollInstructor(course.id, user.id)
      // Add to list and auto-select
      setCourses((prev) => [course, ...prev])
      setSelectedCourseId(course.id)
      setSessions([])
      setSelectedSessionId('new')
      // Reset form and close panel
      setCreateName('')
      setCreateOptionCount(5)
      setCreateMultiAnswer(true)
      setShowCreatePanel(false)
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Failed to create course')
    } finally {
      setCreating(false)
    }
  }

  function handleCancelCreate() {
    setCreateName('')
    setCreateOptionCount(5)
    setCreateError(null)
    setShowCreatePanel(false)
  }

  async function handleLogout() {
    await supabase.auth.signOut()
    WebviewWindow.getByLabel('qr').then((w) => w?.close())
    WebviewWindow.getByLabel('results').then((w) => w?.close())
  }

  async function handleQuit() {
    await invoke('quit_app')
  }

  const iconButtonClass =
    'flex items-center justify-center w-9 h-9 rounded text-gray-400 hover:text-gray-200 ' +
    'hover:bg-gray-700 transition-colors shrink-0'

  if (loading) {
    return (
      <div
        data-tauri-drag-region
        className="flex items-center bg-gray-900 px-3 gap-2"
        style={{ height: 60 }}
      >
        <div
          data-tauri-drag-region
          className="flex items-center justify-center w-4 shrink-0 cursor-move select-none text-gray-600 hover:text-gray-400"
          style={{ height: 60 }}
          aria-hidden="true"
        >
          <IconGripVertical size={14} style={{ pointerEvents: 'none' }} />
        </div>
        <p data-tauri-drag-region className="text-gray-400 text-sm">
          Loading courses…
        </p>
      </div>
    )
  }

  return (
    <div className="bg-gray-900">
      {/* Toolbar row */}
      <div
        data-tauri-drag-region
        className="flex items-center px-3 gap-2"
        style={{ height: 60 }}
      >
        {/* Drag handle */}
        <div
          data-tauri-drag-region
          className="flex items-center justify-center w-4 shrink-0 cursor-move select-none text-gray-600 hover:text-gray-400"
          style={{ height: 60 }}
          aria-hidden="true"
        >
          <IconGripVertical size={14} style={{ pointerEvents: 'none' }} />
        </div>

        {courses.length === 0 ? (
          <p data-tauri-drag-region className="text-gray-400 text-sm">
            No courses yet — create one with +
          </p>
        ) : (
          <>
            {/* Course select */}
            <select
              value={selectedCourseId}
              onChange={(e) => setSelectedCourseId(e.target.value)}
              className={`${SELECT_CLASS} max-w-[160px]`}
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
              className={`${SELECT_CLASS} max-w-[120px]`}
              disabled={joining || sessionsLoading}
              aria-label="Select session"
            >
              <option value="new">New session</option>
              {sessions.map((s) => (
                <option key={s.id} value={s.id}>
                  {formatSessionLabel(s)}
                </option>
              ))}
            </select>

            {/* Start/join button */}
            <button
              onClick={handleJoin}
              disabled={joining || !selectedCourseId}
              className="flex items-center justify-center w-10 h-10 rounded bg-green-600 hover:bg-green-500 text-white shrink-0 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              aria-label={joining ? 'Starting session…' : 'Start session'}
            >
              <IconPlayerPlay size={22} />
            </button>

            {/* Inline error */}
            {error && (
              <span role="alert" data-tauri-drag-region className="text-xs text-red-400 shrink-0 truncate max-w-36">
                {error}
              </span>
            )}
          </>
        )}

        {/* + Create course — suppressed when panel open */}
        <span title="Create new course" className="ml-auto">
          <button
            onClick={() => setShowCreatePanel((s) => !s)}
            className={[
              iconButtonClass,
              showCreatePanel ? 'opacity-50' : '',
            ].join(' ')}
            aria-label="Create course"
            aria-expanded={showCreatePanel}
            data-tooltip="Create new course"
          >
            <IconPlus size={18} />
          </button>
        </span>

        {/* Logout */}
        <span title="Sign out">
          <button
            onClick={handleLogout}
            className={iconButtonClass}
            aria-label="Sign out"
            data-tooltip="Sign out"
          >
            <IconLogout size={18} />
          </button>
        </span>

        {/* Quit */}
        <span title="Quit Smidgeon">
          <button
            onClick={handleQuit}
            className={iconButtonClass}
            aria-label="Quit Smidgeon"
            data-tooltip="Quit Smidgeon"
          >
            <IconPower size={18} />
          </button>
        </span>
      </div>

      {/* Create course panel */}
      {showCreatePanel && (
        <div data-tauri-drag-region className="px-4 py-3 border-t border-gray-700 space-y-3">
          {/* Course name */}
          <div data-tauri-drag-region>
            <label data-tauri-drag-region htmlFor="create-course-name" className="block text-xs text-gray-400 mb-1">
              Course name
            </label>
            <input
              id="create-course-name"
              type="text"
              value={createName}
              onChange={(e) => setCreateName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
              placeholder="e.g. CSCI 241 Databases Winter 26"
              disabled={creating}
              className="w-full h-9 rounded bg-gray-800 border border-gray-600 text-gray-200 text-sm px-2 placeholder-gray-500 focus:outline-none focus:border-cyan-500 disabled:opacity-50"
              autoFocus
            />
          </div>

          {/* MCQ option count */}
          <div data-tauri-drag-region className="flex items-center gap-3">
            <span data-tauri-drag-region className="text-xs text-gray-400 shrink-0">MCQ options</span>
            <div className="flex gap-2" role="radiogroup" aria-label="Default MCQ option count">
              {([2, 3, 4, 5] as const).map((n) => (
                <label
                  key={n}
                  className={[
                    'flex items-center justify-center w-9 h-9 rounded-lg border-2 cursor-pointer font-semibold text-sm transition-colors',
                    createOptionCount === n
                      ? 'border-blue-500 bg-blue-600 text-white'
                      : 'border-gray-600 bg-gray-700 text-gray-300 hover:border-blue-400',
                  ].join(' ')}
                >
                  <input
                    type="radio"
                    name="create-option-count"
                    value={n}
                    checked={createOptionCount === n}
                    onChange={() => setCreateOptionCount(n)}
                    className="sr-only"
                  />
                  {n}
                </label>
              ))}
            </div>
          </div>

          {/* Free response mode */}
          <div data-tauri-drag-region className="flex items-center gap-3">
            <span data-tauri-drag-region className="text-xs text-gray-400 shrink-0">Free response</span>
            <div className="flex gap-2" role="radiogroup" aria-label="Default free response mode">
              {([
                { value: false, label: 'Single' },
                { value: true, label: 'Multiple' },
              ] as const).map(({ value, label }) => (
                <label
                  key={String(value)}
                  className={[
                    'flex items-center justify-center px-3 h-9 rounded-lg border-2 cursor-pointer text-sm font-medium transition-colors',
                    createMultiAnswer === value
                      ? 'border-blue-500 bg-blue-600 text-white'
                      : 'border-gray-600 bg-gray-700 text-gray-300 hover:border-blue-400',
                  ].join(' ')}
                >
                  <input
                    type="radio"
                    name="create-multi-answer"
                    checked={createMultiAnswer === value}
                    onChange={() => setCreateMultiAnswer(value)}
                    className="sr-only"
                  />
                  {label}
                </label>
              ))}
            </div>
          </div>

          {/* Error */}
          {createError && (
            <p role="alert" className="text-xs text-red-400">
              {createError}
            </p>
          )}

          {/* Actions */}
          <div data-tauri-drag-region className="flex gap-2">
            <button
              onClick={handleCreate}
              disabled={creating}
              className="flex items-center justify-center px-4 h-8 rounded bg-cyan-600 hover:bg-cyan-500 text-white text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {creating ? 'Creating…' : 'Create'}
            </button>
            <button
              onClick={handleCancelCreate}
              disabled={creating}
              className="flex items-center justify-center px-4 h-8 rounded bg-gray-700 hover:bg-gray-600 text-gray-200 text-sm transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
