import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useSession } from '../hooks/useSession'
import { Button } from '@crs/ui'
import type { Course } from '@crs/types'

export default function CoursesPage() {
  const { user } = useSession()
  const navigate = useNavigate()
  const [courses, setCourses] = useState<Course[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!user) return

    async function loadCourses() {
      setLoading(true)
      setError(null)
      try {
        // Get courses where user is owner or enrolled as INSTRUCTOR
        const { data, error: fetchError } = await supabase
          .from('courses')
          .select(`
            *,
            enrollments!inner(role, user_id)
          `)
          .eq('enrollments.user_id', user!.id)
          .eq('enrollments.role', 'INSTRUCTOR')
          .order('created_at', { ascending: false })

        if (fetchError) {
          // Fallback: query by owner_id directly
          const { data: owned, error: ownedError } = await supabase
            .from('courses')
            .select('*')
            .eq('owner_id', user!.id)
            .order('created_at', { ascending: false })

          if (ownedError) throw new Error(ownedError.message)
          setCourses((owned ?? []) as Course[])
        } else {
          setCourses((data ?? []) as Course[])
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load courses')
      } finally {
        setLoading(false)
      }
    }

    loadCourses()
  }, [user])

  return (
    <main className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-4 py-4 flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">My Courses</h1>
        <Button size="sm" onClick={() => navigate('/courses/new')}>
          + Create course
        </Button>
      </header>

      <div className="px-4 py-4 max-w-lg mx-auto">
        {error && (
          <p role="alert" className="mb-4 text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">
            {error}
          </p>
        )}

        {loading ? (
          <p className="text-gray-500 text-center py-12">Loading courses…</p>
        ) : courses.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-500 mb-4">No courses yet.</p>
            <Button onClick={() => navigate('/courses/new')}>Create your first course</Button>
          </div>
        ) : (
          <ul className="space-y-3" aria-label="Your courses">
            {courses.map((course) => (
              <li key={course.id}>
                <Link
                  to={`/courses/${course.id}`}
                  className="block bg-white rounded-xl border border-gray-200 p-4 hover:border-blue-300 hover:shadow-sm transition-all"
                >
                  <p className="font-semibold text-gray-900">{course.name}</p>
                  <p className="text-sm text-gray-500 mt-1">
                    Join code: <span className="font-mono font-bold tracking-widest">{course.join_code}</span>
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  )
}
