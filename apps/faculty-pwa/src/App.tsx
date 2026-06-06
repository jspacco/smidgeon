import { useEffect, useState } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { supabase } from './lib/supabase'
import { useSession } from './hooks/useSession'
import { useActiveSessionRedirect } from './hooks/useActiveSessionRedirect'
import LoginPage from './pages/LoginPage'
import CoursesPage from './pages/CoursesPage'
import CreateCoursePage from './pages/CreateCoursePage'
import CourseHomePage from './pages/CourseHomePage'
import SessionPage from './pages/SessionPage'

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useSession()

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-gray-500 text-lg">Loading…</p>
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/" replace />
  }

  return <>{children}</>
}

interface ActiveSession {
  id: string
  course_id: string
}

function RootRedirect() {
  const { user, loading } = useSession()
  const [activeSession, setActiveSession] = useState<ActiveSession | null>(null)
  const [sessionChecked, setSessionChecked] = useState(false)

  useEffect(() => {
    if (!user) return

    async function checkActiveSession() {
      const { data: enrollments } = await supabase
        .from('enrollments')
        .select('course_id')
        .eq('user_id', user!.id)
        .in('role', ['INSTRUCTOR', 'TA'])

      const courseIds = (enrollments ?? []).map((e: { course_id: string }) => e.course_id)

      if (courseIds.length > 0) {
        const { data: session } = await supabase
          .from('crs_sessions')
          .select('id, course_id')
          .in('course_id', courseIds)
          .is('ended_at', null)
          .limit(1)
          .maybeSingle()

        setActiveSession(session as ActiveSession | null)
      }

      setSessionChecked(true)
    }

    checkActiveSession()
  }, [user])

  if (loading || (user && !sessionChecked)) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-gray-500 text-lg">Loading…</p>
      </div>
    )
  }

  if (user) {
    if (activeSession) {
      return <Navigate to={`/courses/${activeSession.course_id}/session/${activeSession.id}`} replace />
    }
    return <Navigate to="/courses" replace />
  }

  return <LoginPage />
}

// AppShell lives inside BrowserRouter so useNavigate is available for the hook
function AppShell() {
  const { user } = useSession()
  useActiveSessionRedirect(user)

  return (
    <Routes>
      <Route path="/" element={<RootRedirect />} />
      <Route
        path="/courses"
        element={
          <ProtectedRoute>
            <CoursesPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/courses/new"
        element={
          <ProtectedRoute>
            <CreateCoursePage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/courses/:courseId"
        element={
          <ProtectedRoute>
            <CourseHomePage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/courses/:courseId/session/:sessionId"
        element={
          <ProtectedRoute>
            <SessionPage />
          </ProtectedRoute>
        }
      />
    </Routes>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AppShell />
    </BrowserRouter>
  )
}
