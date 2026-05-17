import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { JoinCourseResponse } from '@crs/types'
import { Button } from '@crs/ui'
import { useCourses } from '../hooks/useCourses'
import { supabase } from '../lib/supabase'
import { signOut } from '../lib/auth'

export default function CoursesPage() {
  const navigate = useNavigate()
  const { courses, loading, error: coursesError } = useCourses()
  const [joinCode, setJoinCode] = useState('')
  const [joinError, setJoinError] = useState<string | null>(null)
  const [joinLoading, setJoinLoading] = useState(false)

  async function handleJoin(e: React.FormEvent) {
    e.preventDefault()
    const code = joinCode.trim().toUpperCase()
    if (!code) return

    setJoinError(null)
    setJoinLoading(true)
    try {
      const { data, error } = await supabase.functions.invoke<JoinCourseResponse>('join-course', {
        body: { join_code: code },
      })
      if (error) throw error
      if (data?.error) throw new Error(data.error)
      if (!data?.course_id) throw new Error('Unexpected response from server')
      setJoinCode('')
      navigate(`/courses/${data.course_id}`)
    } catch (err) {
      setJoinError(err instanceof Error ? err.message : 'Failed to join course')
    } finally {
      setJoinLoading(false)
    }
  }

  async function handleSignOut() {
    await signOut()
    navigate('/')
  }

  return (
    <main className="min-h-screen bg-gray-50 px-4 py-6 max-w-lg mx-auto">
      <header className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-gray-900">My Courses</h1>
        <button
          onClick={() => void handleSignOut()}
          className="text-sm text-gray-500 hover:text-gray-700"
        >
          Sign out
        </button>
      </header>

      {/* Course list */}
      {loading && (
        <p className="text-gray-500 text-sm text-center py-8">Loading courses…</p>
      )}

      {coursesError && (
        <p role="alert" className="text-red-600 text-sm bg-red-50 rounded-lg px-4 py-3 mb-4">
          {coursesError}
        </p>
      )}

      {!loading && courses.length === 0 && !coursesError && (
        <p className="text-gray-400 text-sm text-center py-8">
          You're not enrolled in any courses yet. Use the join code below to get started.
        </p>
      )}

      {courses.length > 0 && (
        <ul className="flex flex-col gap-3 mb-8" aria-label="Enrolled courses">
          {courses.map((course) => (
            <li key={course.id}>
              <button
                onClick={() => navigate(`/courses/${course.id}`)}
                className="w-full text-left bg-white rounded-xl px-4 py-4 shadow-sm border border-gray-100 hover:border-blue-200 hover:shadow-md transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              >
                <p className="font-semibold text-gray-900">{course.name}</p>
                <p className="text-sm text-gray-400 mt-0.5">Code: {course.join_code}</p>
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* Join course */}
      <section aria-labelledby="join-heading" className="bg-white rounded-xl px-4 py-5 shadow-sm border border-gray-100">
        <h2 id="join-heading" className="text-base font-semibold text-gray-900 mb-3">
          Join a course
        </h2>
        <form onSubmit={(e) => void handleJoin(e)} className="flex flex-col gap-3">
          <div>
            <label htmlFor="join-code" className="block text-sm text-gray-700 mb-1">
              Join code
            </label>
            <input
              id="join-code"
              type="text"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value)}
              placeholder="e.g. X7K2M"
              maxLength={10}
              autoCapitalize="characters"
              autoCorrect="off"
              autoComplete="off"
              spellCheck={false}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          {joinError && (
            <p role="alert" className="text-red-600 text-sm">
              {joinError}
            </p>
          )}

          <Button
            type="submit"
            disabled={joinLoading || !joinCode.trim()}
            className="w-full"
          >
            {joinLoading ? 'Joining…' : 'Join course'}
          </Button>
        </form>
      </section>
    </main>
  )
}
