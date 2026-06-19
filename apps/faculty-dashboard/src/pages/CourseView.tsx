import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Button } from '@crs/ui'
import type { Course, CRSSession, Enrollment } from '@crs/types'
import { supabase } from '../lib/supabase'
import { exportCourseSummary } from '../lib/exports'

interface StudentRow {
  user_id: string
  name: string
  email: string
  enrolled_at: string
}

interface SessionRow {
  id: string
  started_at: string
  ended_at: string | null
  question_count: number
  attendance_count: number
}

export function CourseView() {
  const { courseId } = useParams<{ courseId: string }>()

  const [course, setCourse] = useState<Course | null>(null)
  const [students, setStudents] = useState<StudentRow[]>([])
  const [sessions, setSessions] = useState<SessionRow[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [exportingCourse, setExportingCourse] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)

  // Course defaults editing
  const [editingDefaults, setEditingDefaults] = useState(false)
  const [editOptionCount, setEditOptionCount] = useState(5)
  const [editMultiAnswer, setEditMultiAnswer] = useState(true)
  const [editScreenshotsOn, setEditScreenshotsOn] = useState(false)
  const [savingDefaults, setSavingDefaults] = useState(false)
  const [defaultsError, setDefaultsError] = useState<string | null>(null)

  useEffect(() => {
    if (!courseId) return
    loadAll(courseId)
  }, [courseId])

  async function loadAll(id: string) {
    setLoading(true)
    setError(null)
    try {
      // Fetch course
      const { data: courseData, error: courseErr } = await supabase
        .from('courses')
        .select('*')
        .eq('id', id)
        .single()
      if (courseErr) throw courseErr
      const c = courseData as Course
      setCourse(c)
      setEditOptionCount(c.default_option_count)
      setEditMultiAnswer(c.default_multi_answer)
      setEditScreenshotsOn(c.default_screenshots_on)

      // Fetch student enrollments with user info
      const { data: enrollData, error: enrollErr } = await supabase
        .from('enrollments')
        .select('user_id, enrolled_at, users(name, email)')
        .eq('course_id', id)
        .eq('role', 'STUDENT')
        .order('enrolled_at', { ascending: true })
      if (enrollErr) throw enrollErr

      const studentRows: StudentRow[] = ((enrollData ?? []) as unknown as Array<{
        user_id: string
        enrolled_at: string
        users: { name: string; email: string } | null
      }>).map((e) => ({
        user_id: e.user_id,
        name: e.users?.name ?? '',
        email: e.users?.email ?? '',
        enrolled_at: e.enrolled_at,
      }))
      setStudents(studentRows)

      // Fetch sessions
      const { data: sessionsData, error: sessErr } = await supabase
        .from('crs_sessions')
        .select('id, started_at, ended_at')
        .eq('course_id', id)
        .order('started_at', { ascending: false })
      if (sessErr) throw sessErr
      const rawSessions = (sessionsData ?? []) as Pick<CRSSession, 'id' | 'started_at' | 'ended_at'>[]

      if (rawSessions.length === 0) {
        setSessions([])
        return
      }

      const sessionIds = rawSessions.map((s) => s.id)

      // Question counts per session
      const { data: questionsData, error: questErr } = await supabase
        .from('crs_questions')
        .select('id, session_id')
        .in('session_id', sessionIds)
      if (questErr) throw questErr
      const qCountMap = new Map<string, number>()
      for (const q of (questionsData ?? []) as Array<{ id: string; session_id: string }>) {
        qCountMap.set(q.session_id, (qCountMap.get(q.session_id) ?? 0) + 1)
      }

      // Attendance counts per session (COUNT DISTINCT user_id)
      const { data: attData, error: attErr } = await supabase
        .from('session_attendance')
        .select('session_id, user_id')
        .in('session_id', sessionIds)
      if (attErr) throw attErr
      const attMap = new Map<string, Set<string>>()
      for (const a of (attData ?? []) as Array<{ session_id: string; user_id: string }>) {
        let s = attMap.get(a.session_id)
        if (!s) { s = new Set(); attMap.set(a.session_id, s) }
        s.add(a.user_id)
      }

      const sessionRows: SessionRow[] = rawSessions.map((s) => ({
        id: s.id,
        started_at: s.started_at,
        ended_at: s.ended_at,
        question_count: qCountMap.get(s.id) ?? 0,
        attendance_count: attMap.get(s.id)?.size ?? 0,
      }))
      setSessions(sessionRows)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load course.')
    } finally {
      setLoading(false)
    }
  }

  async function handleSaveCourseDefaults() {
    if (!course) return
    setSavingDefaults(true)
    setDefaultsError(null)
    try {
      const { error } = await supabase
        .from('courses')
        .update({
          default_option_count: editOptionCount,
          default_multi_answer: editMultiAnswer,
          default_screenshots_on: editScreenshotsOn,
        })
        .eq('id', course.id)
      if (error) throw error
      setCourse((c) =>
        c
          ? { ...c, default_option_count: editOptionCount, default_multi_answer: editMultiAnswer, default_screenshots_on: editScreenshotsOn }
          : c,
      )
      setEditingDefaults(false)
    } catch (err) {
      setDefaultsError(err instanceof Error ? err.message : 'Failed to save course defaults.')
    } finally {
      setSavingDefaults(false)
    }
  }

  async function handleExportCourse() {
    if (!course) return
    setExportingCourse(true)
    setExportError(null)
    try {
      await exportCourseSummary(course.id, course.name)
    } catch (err) {
      setExportError(err instanceof Error ? err.message : 'Export failed.')
    } finally {
      setExportingCourse(false)
    }
  }

  function formatDuration(started: string, ended: string | null): string {
    if (!ended) return '—'
    const ms = new Date(ended).getTime() - new Date(started).getTime()
    const totalSeconds = Math.round(ms / 1000)
    const minutes = Math.floor(totalSeconds / 60)
    const seconds = totalSeconds % 60
    return `${minutes}m ${seconds}s`
  }

  function formatDateTime(iso: string): string {
    return new Date(iso).toLocaleString(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    })
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-gray-500">
        Loading…
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p role="alert" className="text-red-600">
          {error}
        </p>
      </div>
    )
  }

  if (!course) return null

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center gap-3">
          <Link to="/courses" className="text-sm text-blue-600 hover:underline">
            ← Courses
          </Link>
          <span className="text-gray-300">/</span>
          <h1 className="text-xl font-bold text-gray-900">{course.name}</h1>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-6 py-8 flex gap-8 items-start">
        {/* Left column — course info + roster */}
        <aside className="w-72 shrink-0 flex flex-col gap-6">
          {/* Join code */}
          <section
            aria-labelledby="join-code-heading"
            className="bg-white border border-gray-200 rounded-xl p-6 flex flex-col gap-2"
          >
            <h2 id="join-code-heading" className="text-sm font-medium text-gray-500 uppercase tracking-wide">
              Join code
            </h2>
            <span className="font-mono text-4xl font-bold text-blue-700 tracking-widest">
              {course.join_code}
            </span>
            <p className="text-xs text-gray-400">Students enter this at the student app</p>
          </section>

          {/* Course defaults */}
          <section
            aria-labelledby="course-defaults-heading"
            className="bg-white border border-gray-200 rounded-xl p-6"
          >
            <div className="flex items-center justify-between mb-4">
              <h2 id="course-defaults-heading" className="text-sm font-medium text-gray-500 uppercase tracking-wide">
                Course defaults
              </h2>
              {!editingDefaults && (
                <button
                  onClick={() => setEditingDefaults(true)}
                  className="text-sm text-blue-600 hover:underline"
                >
                  Edit
                </button>
              )}
            </div>

            {editingDefaults ? (
              <div className="flex flex-col gap-3">
                <div className="flex flex-col gap-1">
                  <label htmlFor="cv-option-count" className="text-xs font-medium text-gray-600">MCQ options</label>
                  <select
                    id="cv-option-count"
                    value={editOptionCount}
                    onChange={(e) => setEditOptionCount(Number(e.target.value))}
                    className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {[2, 3, 4, 5].map((n) => (
                      <option key={n} value={n}>{n} options</option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <label htmlFor="cv-multi-answer" className="text-xs font-medium text-gray-600">Free response</label>
                  <select
                    id="cv-multi-answer"
                    value={editMultiAnswer ? 'multiple' : 'single'}
                    onChange={(e) => setEditMultiAnswer(e.target.value === 'multiple')}
                    className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="multiple">Multiple responses</option>
                    <option value="single">Single response</option>
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <label htmlFor="cv-screenshots" className="text-xs font-medium text-gray-600">Screenshots</label>
                  <select
                    id="cv-screenshots"
                    value={editScreenshotsOn ? 'on' : 'off'}
                    onChange={(e) => setEditScreenshotsOn(e.target.value === 'on')}
                    className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="off">Off</option>
                    <option value="on">On</option>
                  </select>
                </div>
                {defaultsError && (
                  <p role="alert" className="text-xs text-red-600">{defaultsError}</p>
                )}
                <div className="flex gap-2 pt-1">
                  <button
                    onClick={() => void handleSaveCourseDefaults()}
                    disabled={savingDefaults}
                    className="text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 px-3 py-1.5 rounded-lg disabled:opacity-50"
                  >
                    {savingDefaults ? 'Saving…' : 'Save'}
                  </button>
                  <button
                    onClick={() => {
                      setEditingDefaults(false)
                      setDefaultsError(null)
                      if (course) {
                        setEditOptionCount(course.default_option_count)
                        setEditMultiAnswer(course.default_multi_answer)
                        setEditScreenshotsOn(course.default_screenshots_on)
                      }
                    }}
                    disabled={savingDefaults}
                    className="text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 px-3 py-1.5 rounded-lg disabled:opacity-50"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <dl className="flex flex-col gap-2 text-sm">
                <div className="flex justify-between">
                  <dt className="text-gray-500">MCQ options</dt>
                  <dd className="font-semibold text-gray-900">{course.default_option_count}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-gray-500">Free response</dt>
                  <dd className="font-semibold text-gray-900">{course.default_multi_answer ? 'Multi' : 'Single'}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-gray-500">Screenshots</dt>
                  <dd className="font-semibold text-gray-900">{course.default_screenshots_on ? 'On' : 'Off'}</dd>
                </div>
              </dl>
            )}
          </section>

          {/* Student roster */}
          <section aria-labelledby="roster-heading" className="bg-white border border-gray-200 rounded-xl p-6">
            <h2 id="roster-heading" className="text-sm font-medium text-gray-500 uppercase tracking-wide mb-4">
              Students ({students.length})
            </h2>
            {students.length === 0 ? (
              <p className="text-sm text-gray-400">No students enrolled yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm" aria-label="Student roster">
                  <thead>
                    <tr className="border-b border-gray-100">
                      <th scope="col" className="text-left py-2 font-medium text-gray-600">Name</th>
                      <th scope="col" className="text-left py-2 font-medium text-gray-600">Email</th>
                      <th scope="col" className="text-left py-2 font-medium text-gray-600">Enrolled</th>
                    </tr>
                  </thead>
                  <tbody>
                    {students.map((s) => (
                      <tr key={s.user_id} className="border-b border-gray-50 last:border-0">
                        <td className="py-2 text-gray-900">{s.name}</td>
                        <td className="py-2 text-gray-500">{s.email}</td>
                        <td className="py-2 text-gray-400 whitespace-nowrap">
                          {new Date(s.enrolled_at).toLocaleDateString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </aside>

        {/* Main column — sessions */}
        <main className="flex-1 flex flex-col gap-6 min-w-0">
          {/* Export course summary */}
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">Sessions</h2>
            <div className="flex flex-col items-end gap-1">
              <Button
                variant="secondary"
                size="sm"
                onClick={handleExportCourse}
                disabled={exportingCourse}
                aria-label="Export course summary CSV"
              >
                {exportingCourse ? 'Exporting…' : 'Export course summary CSV'}
              </Button>
              {exportError && (
                <p role="alert" className="text-xs text-red-600">
                  {exportError}
                </p>
              )}
            </div>
          </div>

          {sessions.length === 0 ? (
            <p className="text-sm text-gray-400">No sessions yet.</p>
          ) : (
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <table className="w-full text-sm" aria-label="Sessions">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th scope="col" className="text-left px-4 py-3 font-medium text-gray-600">Date</th>
                    <th scope="col" className="text-left px-4 py-3 font-medium text-gray-600">Duration</th>
                    <th scope="col" className="text-right px-4 py-3 font-medium text-gray-600">Questions</th>
                    <th scope="col" className="text-right px-4 py-3 font-medium text-gray-600">Attendance</th>
                    <th scope="col" className="text-left px-4 py-3 font-medium text-gray-600">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {sessions.map((session) => (
                    <SessionTableRow
                      key={session.id}
                      session={session}
                      courseId={course.id}
                      courseName={course.name}
                      formatDateTime={formatDateTime}
                      formatDuration={formatDuration}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </main>
      </div>
    </div>
  )
}

function SessionTableRow({
  session,
  courseId,
  courseName,
  formatDateTime,
  formatDuration,
}: {
  session: SessionRow
  courseId: string
  courseName: string
  formatDateTime: (iso: string) => string
  formatDuration: (started: string, ended: string | null) => string
}) {
  const [exportingSummary, setExportingSummary] = useState(false)
  const [exportingDetail, setExportingDetail] = useState(false)
  const [rowError, setRowError] = useState<string | null>(null)

  async function handleExportSummary() {
    setExportingSummary(true)
    setRowError(null)
    try {
      const { exportSessionSummary } = await import('../lib/exports')
      await exportSessionSummary(session.id, courseName)
    } catch (err) {
      setRowError(err instanceof Error ? err.message : 'Export failed.')
    } finally {
      setExportingSummary(false)
    }
  }

  async function handleExportDetail() {
    setExportingDetail(true)
    setRowError(null)
    try {
      const { exportFullResponseDetail } = await import('../lib/exports')
      await exportFullResponseDetail(session.id, courseName)
    } catch (err) {
      setRowError(err instanceof Error ? err.message : 'Export failed.')
    } finally {
      setExportingDetail(false)
    }
  }

  return (
    <tr className="border-b border-gray-100 last:border-0">
      <td className="px-4 py-3 text-gray-900 whitespace-nowrap">
        <Link
          to={`/courses/${courseId}/sessions/${session.id}`}
          className="text-blue-600 hover:underline font-medium"
        >
          {formatDateTime(session.started_at)}
        </Link>
      </td>
      <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
        {formatDuration(session.started_at, session.ended_at)}
      </td>
      <td className="px-4 py-3 text-right text-gray-700">{session.question_count}</td>
      <td className="px-4 py-3 text-right text-gray-700">{session.attendance_count}</td>
      <td className="px-4 py-3">
        <div className="flex flex-col gap-1 items-start">
          <div className="flex gap-2 flex-wrap">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleExportSummary}
              disabled={exportingSummary}
              aria-label={`Export session summary for ${formatDateTime(session.started_at)}`}
            >
              {exportingSummary ? 'Exporting…' : 'Session summary'}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleExportDetail}
              disabled={exportingDetail}
              aria-label={`Export full detail for ${formatDateTime(session.started_at)}`}
            >
              {exportingDetail ? 'Exporting…' : 'Full detail'}
            </Button>
          </div>
          {rowError && (
            <p role="alert" className="text-xs text-red-600">
              {rowError}
            </p>
          )}
        </div>
      </td>
    </tr>
  )
}
