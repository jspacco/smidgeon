// Is this page still necessary?

import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { JoinCourseResponse } from '@crs/types'
import { Button } from '@crs/ui'
import { useCourses } from '../hooks/useCourses'
import { useSession } from '../hooks/useSession'
import { supabase } from '../lib/supabase'
import { signOut } from '../lib/auth'

export default function CoursesPage() {
  const navigate = useNavigate()
  const { user } = useSession()
  const { courses, loading, error: coursesError } = useCourses()
  const username = user?.email?.split('@')[0] ?? 'My'
  const [joinCode, setJoinCode] = useState('')
  const [joinError, setJoinError] = useState<string | null>(null)
  const [joinLoading, setJoinLoading] = useState(false)
  // Map of courseId → sessionId for courses with an active session
  const [liveMap, setLiveMap] = useState<Record<string, string>>({})

  // After courses load, check which have active sessions
  useEffect(() => {
    if (courses.length === 0) return

    const ids = courses.map((c) => c.id)
    supabase
      .from('crs_sessions')
      .select('id, course_id')
      .in('course_id', ids)
      .is('ended_at', null)
      .then(({ data }) => {
        const map: Record<string, string> = {}
        for (const s of (data ?? []) as Array<{ id: string; course_id: string }>) {
          map[s.course_id] = s.id
        }
        setLiveMap(map)
      })
  }, [courses])

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

  function handleCourseTap(courseId: string) {
    const sessionId = liveMap[courseId]
    if (sessionId) {
      // Live course → go directly to QR scan screen
      navigate('/scan', { state: { courseId } })
    } else {
      navigate(`/courses/${courseId}`)
    }
  }

  return (
    <main className="min-h-screen bg-gray-50 px-4 py-6 max-w-lg mx-auto">
      <header className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-gray-900">{username}'s Courses</h1>
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
          {courses.map((course) => {
            const isLive = Boolean(liveMap[course.id])
            return (
              <li key={course.id}>
                <button
                  onClick={() => handleCourseTap(course.id)}
                  className={[
                    'w-full text-left bg-white rounded-xl px-4 py-4 shadow-sm border transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500',
                    isLive
                      ? 'border-green-400 hover:border-green-500 hover:shadow-md'
                      : 'border-gray-100 hover:border-blue-200 hover:shadow-md',
                  ].join(' ')}
                  aria-label={`${course.name}${isLive ? ' — session in progress, tap to join' : ''}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold text-gray-900 truncate">{course.name}</p>
                      <p className="text-sm text-gray-400 mt-0.5">Code: {course.join_code}</p>
                    </div>
                    {isLive && (
                      <span
                        className="shrink-0 text-xs font-bold text-white bg-green-500 px-2 py-1 rounded-md"
                        aria-label="Live session in progress"
                      >
                        LIVE
                      </span>
                    )}
                  </div>
                </button>
              </li>
            )
          })}
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
