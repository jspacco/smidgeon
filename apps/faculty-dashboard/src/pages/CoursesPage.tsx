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

export function CoursesPage() {
  const { user } = useSession()
  const navigate = useNavigate()

  const [courses, setCourses] = useState<Course[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)
  const [loadingCourses, setLoadingCourses] = useState(true)

  // Create-course form state
  const [newName, setNewName] = useState('')
  const [newOptionCount, setNewOptionCount] = useState<number>(5)
  const [createError, setCreateError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    if (!user) return
    loadCourses()
  }, [user])

  async function loadCourses() {
    setLoadingCourses(true)
    setLoadError(null)
    try {
      // Find course IDs where the current user is INSTRUCTOR
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
      // Insert course
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

      // Enroll creator as INSTRUCTOR
      const { error: enrollErr } = await supabase.from('enrollments').insert({
        course_id: (courseData as Course).id,
        user_id: user!.id,
        role: 'INSTRUCTOR',
      })
      if (enrollErr) throw enrollErr

      setNewName('')
      setNewOptionCount(5)
      await loadCourses()
      navigate(`/courses/${(courseData as Course).id}`)
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Failed to create course.')
    } finally {
      setCreating(false)
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
        {/* Create course */}
        <section aria-labelledby="create-course-heading">
          <h2 id="create-course-heading" className="text-lg font-semibold text-gray-900 mb-4">
            Create a course
          </h2>
          <form
            onSubmit={handleCreateCourse}
            className="bg-white border border-gray-200 rounded-xl p-6 flex flex-col gap-4"
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
        </section>

        {/* Courses list */}
        <section aria-labelledby="courses-heading">
          <h2 id="courses-heading" className="text-lg font-semibold text-gray-900 mb-4">
            Your courses
          </h2>

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
                  <Link
                    to={`/courses/${course.id}`}
                    className="flex items-center justify-between bg-white border border-gray-200 rounded-xl px-6 py-4 hover:border-blue-400 hover:shadow-sm transition-all group"
                  >
                    <div className="flex flex-col gap-0.5">
                      <span className="font-semibold text-gray-900 group-hover:text-blue-700">
                        {course.name}
                      </span>
                      <span className="text-xs text-gray-400">
                        Join code:{' '}
                        <span className="font-mono font-semibold text-gray-600">
                          {course.join_code}
                        </span>
                      </span>
                    </div>
                    <span className="text-gray-400 text-sm">View →</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  )
}
