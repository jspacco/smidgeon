import { useEffect, useState } from 'react'
import type { Course } from '@crs/types'
import { supabase } from '../lib/supabase'

interface UseCourseResult {
  courses: Course[]
  loading: boolean
  error: string | null
}

export function useCourses(): UseCourseResult {
  const [courses, setCourses] = useState<Course[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function fetchCourses() {
      setLoading(true)
      setError(null)
      try {
        // Join enrollments → courses for the current authenticated user.
        // Show courses for any role (STUDENT, TA, INSTRUCTOR) so faculty
        // and TAs see their courses when using the student-pwa.
        const { data, error: fetchError } = await supabase
          .from('enrollments')
          .select('course:courses(*)')

        if (fetchError) throw fetchError
        if (cancelled) return

        const enrolled: Course[] = (data ?? [])
          .map((row: { course: Course | null }) => row.course)
          .filter((c): c is Course => c !== null)

        setCourses(enrolled)
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load courses')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void fetchCourses()
    return () => {
      cancelled = true
    }
  }, [])

  return { courses, loading, error }
}
