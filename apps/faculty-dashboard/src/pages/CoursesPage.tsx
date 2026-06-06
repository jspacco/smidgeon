import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Button } from '@crs/ui'
import type { Course } from '@crs/types'
import { supabase } from '../lib/supabase'
import { signOut } from '../lib/auth'
import { useSession } from '../hooks/useSession'

function generateJoinCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = ''
  for (let i = 0; i < 5; i++) {
    code += chars[Math.floor(Math.random() * chars.length)]
  }
  return code
}

function ArchiveIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <line x1="12" y1="20" x2="12" y2="10" />
      <line x1="12" y1="20" x2="8" y2="16" />
      <line x1="12" y1="20" x2="16" y2="16" />
      <line x1="4" y1="4" x2="20" y2="4" />
    </svg>
  )
}

export function CoursesPage() {
  const { user } = useSession()
  const navigate = useNavigate()

  const [courses, setCourses] = useState<Course[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)
  const [loadingCourses, setLoadingCourses] = useState(true)

  // Create-course form state
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [newName, setNewName] = useState('')
  const [newOptionCount, setNewOptionCount] = useState<number>(5)
  const [createError, setCreateError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)

  // Archive confirmation state: holds the course id pending confirmation, or null
  const [archiveConfirmId, setArchiveConfirmId] = useState<string | null>(null)
  const [archiving, setArchiving] = useState(false)

  useEffect(() => {
    if (!user) return
    loadCourses()
  }, [user])

  async function loadCourses() {
    setLoadingCourses(true)
    setLoadError(null)
    try {
      const { data: enrollments, error: enrollErr } = await supabase
        .from('enrollments')
        .select('course_id')
        .eq('user_id', user!.id)
        .eq('role', 'INSTRUCTOR')
      if (enrollErr) throw enrollErr

      const courseIds = (enrollments ?? []).map((e: { course_id: string }) => e.course_id)

      if (courseIds.length === 0) {
        setCourses([])
        return
      }

      const { data: coursesData, error: coursesErr } = await supabase
        .from('courses')
        .select('*')
        .in('id', courseIds)
        .is('archived_at', null)
        .order('created_at', { ascending: false })
      if (coursesErr) throw coursesErr
      setCourses((coursesData ?? []) as Course[])
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Failed to load courses.')
    } finally {
      setLoadingCourses(false)
    }
  }

  async function handleCreateCourse(e: React.FormEvent) {
    e.preventDefault()
    if (!newName.trim()) return
    setCreateError(null)
    setCreating(true)
    try {
      const joinCode = generateJoinCode()
      const { data: courseData, error: courseErr } = await supabase
        .from('courses')
        .insert({
          name: newName.trim(),
          owner_id: user!.id,
          join_code: joinCode,
          default_option_count: newOptionCount,
        })
        .select()
        .single()
      if (courseErr) throw courseErr

      const { error: enrollErr } = await supabase.from('enrollments').insert({
        course_id: (courseData as Course).id,
        user_id: user!.id,
        role: 'INSTRUCTOR',
      })
      if (enrollErr) throw enrollErr

      setNewName('')
      setNewOptionCount(5)
      setShowCreateForm(false)
      await loadCourses()
      navigate(`/courses/${(courseData as Course).id}`)
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Failed to create course.')
    } finally {
      setCreating(false)
    }
  }

  async function handleArchive(courseId: string) {
    setArchiving(true)
    try {
      const { error } = await supabase
        .from('courses')
        .update({ archived_at: new Date().toISOString() })
        .eq('id', courseId)
      if (error) throw error
      setCourses((prev) => prev.filter((c) => c.id !== courseId))
      setArchiveConfirmId(null)
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Failed to archive course.')
      setArchiveConfirmId(null)
    } finally {
      setArchiving(false)
    }
  }

  async function handleSignOut() {
    await signOut()
    navigate('/login')
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Smidgeon Dashboard</h1>
          <p className="text-sm text-gray-500">{user?.email}</p>
        </div>
        <Button variant="ghost" size="sm" onClick={handleSignOut}>
          Sign out
        </Button>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8 flex flex-col gap-8">
        {/* Courses list */}
        <section aria-labelledby="courses-heading">
          <div className="flex items-center justify-between mb-4">
            <h2 id="courses-heading" className="text-lg font-semibold text-gray-900">
              Your courses
            </h2>
            <Button
              variant="primary"
              size="sm"
              onClick={() => {
                setShowCreateForm((v) => !v)
                setCreateError(null)
              }}
            >
              {showCreateForm ? 'Cancel' : '+ Create Course'}
            </Button>
          </div>

          {/* Create course form (toggled) */}
          {showCreateForm && (
            <form
              onSubmit={handleCreateCourse}
              className="bg-white border border-gray-200 rounded-xl p-6 flex flex-col gap-4 mb-4"
              aria-label="Create course form"
            >
              <div className="flex gap-4 items-end flex-wrap">
                <div className="flex flex-col gap-1 flex-1 min-w-48">
                  <label htmlFor="course-name" className="text-sm font-medium text-gray-700">
                    Course name
                  </label>
                  <input
                    id="course-name"
                    type="text"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="e.g. CSCI 241 Databases Winter 26"
                    className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label htmlFor="option-count" className="text-sm font-medium text-gray-700">
                    Default MCQ options
                  </label>
                  <select
                    id="option-count"
                    value={newOptionCount}
                    onChange={(e) => setNewOptionCount(Number(e.target.value))}
                    className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {[2, 3, 4, 5].map((n) => (
                      <option key={n} value={n}>
                        {n} options
                      </option>
                    ))}
                  </select>
                </div>
                <Button type="submit" variant="primary" disabled={creating || !newName.trim()}>
                  {creating ? 'Creating…' : 'Create course'}
                </Button>
              </div>
              {createError && (
                <p role="alert" className="text-sm text-red-600">
                  {createError}
                </p>
              )}
            </form>
          )}

          {loadError && (
            <p role="alert" className="text-sm text-red-600 mb-4">
              {loadError}
            </p>
          )}

          {loadingCourses ? (
            <p className="text-gray-500 text-sm">Loading courses…</p>
          ) : courses.length === 0 ? (
            <p className="text-gray-500 text-sm">No courses yet. Create one above.</p>
          ) : (
            <ul className="flex flex-col gap-3" aria-label="Course list">
              {courses.map((course) => (
                <li key={course.id}>
                  {archiveConfirmId === course.id ? (
                    <div className="flex items-center justify-between bg-white border border-yellow-300 rounded-xl px-6 py-4 gap-4">
                      <span className="text-sm text-gray-700">Archive this course?</span>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleArchive(course.id)}
                          disabled={archiving}
                          className="text-sm font-medium text-white bg-red-600 hover:bg-red-700 px-3 py-1.5 rounded-lg disabled:opacity-50"
                        >
                          {archiving ? 'Archiving…' : 'Confirm'}
                        </button>
                        <button
                          onClick={() => setArchiveConfirmId(null)}
                          disabled={archiving}
                          className="text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 px-3 py-1.5 rounded-lg disabled:opacity-50"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center bg-white border border-gray-200 rounded-xl hover:border-blue-400 hover:shadow-sm transition-all group">
                      <Link
                        to={`/courses/${course.id}`}
                        className="flex items-center justify-between flex-1 px-6 py-4 min-w-0"
                      >
                        <div className="flex flex-col gap-0.5 min-w-0">
                          <span className="font-semibold text-gray-900 group-hover:text-blue-700 truncate">
                            {course.name}
                          </span>
                          <span className="text-xs text-gray-400">
                            Join code:{' '}
                            <span className="font-mono font-semibold text-gray-600">
                              {course.join_code}
                            </span>
                          </span>
                        </div>
                        <span className="text-gray-400 text-sm ml-4 shrink-0">View →</span>
                      </Link>
                      <button
                        aria-label="Archive course"
                        onClick={() => setArchiveConfirmId(course.id)}
                        className="shrink-0 p-3 mr-2 text-gray-300 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors"
                      >
                        <ArchiveIcon />
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  )
}
