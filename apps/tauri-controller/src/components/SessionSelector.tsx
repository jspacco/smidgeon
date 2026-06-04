import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { startSession } from '../lib/session'
import type { User } from '@supabase/supabase-js'
import type { Course, CRSSession } from '@crs/types'

interface SessionSelectorProps {
  user: User
  onSessionStarted: (course: Course, session: CRSSession) => void
}

export function SessionSelector({ user, onSessionStarted }: SessionSelectorProps) {
  const [courses, setCourses] = useState<Course[]>([])
  const [loading, setLoading] = useState(true)
  const [starting, setStarting] = useState<string | null>(null) // courseId being started
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function loadCourses() {
      setLoading(true)
      setError(null)
      try {
        // Load courses where user is INSTRUCTOR
        const { data, error: fetchError } = await supabase
          .from('enrollments')
          .select('course_id, courses(*)')
          .eq('user_id', user.id)
          .eq('role', 'INSTRUCTOR')

        if (fetchError) throw new Error(fetchError.message)

        const fetched = (data ?? []) as Array<{ course_id: string; courses: Course }>
        setCourses(fetched.map((e) => e.courses).filter(Boolean))
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load courses')
      } finally {
        setLoading(false)
      }
    }

    loadCourses()
  }, [user.id])

  async function handleStartSession(course: Course) {
    setStarting(course.id)
    setError(null)
    try {
      const session = await startSession(course.id)
      onSessionStarted(course, session)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start session')
    } finally {
      setStarting(null)
    }
  }

  if (loading) {
    return (
      <div data-tauri-drag-region className="flex items-center justify-center bg-gray-900 px-4 cursor-move" style={{ height: 60 }}>
        <p data-tauri-drag-region className="text-gray-400 text-sm">Loading courses…</p>
      </div>
    )
  }

  if (courses.length === 0) {
    return (
      <div data-tauri-drag-region className="flex items-center justify-center bg-gray-900 px-4 cursor-move" style={{ height: 60 }}>
        <p data-tauri-drag-region className="text-gray-400 text-sm">
          No courses found. Create one in the Faculty PWA first.
        </p>
      </div>
    )
  }

  return (
    <div data-tauri-drag-region className="flex items-center bg-gray-900 px-3 gap-2 overflow-x-auto cursor-move" style={{ height: 60 }}>
      <span data-tauri-drag-region className="text-xs font-medium text-gray-400 shrink-0">Start session:</span>
      {error && (
        <span data-tauri-drag-region role="alert" className="text-xs text-red-400 shrink-0">
          {error}
        </span>
      )}
      {courses.map((course) => (
        <button
          key={course.id}
          onClick={() => handleStartSession(course)}
          disabled={starting === course.id}
          className="flex items-center px-3 h-9 rounded-lg bg-gray-700 hover:bg-gray-600 text-gray-200 text-sm font-medium shrink-0 transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
          aria-label={`Start session for ${course.name}`}
        >
          {starting === course.id ? 'Starting…' : course.name}
        </button>
      ))}
    </div>
  )
}
