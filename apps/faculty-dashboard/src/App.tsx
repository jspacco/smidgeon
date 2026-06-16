import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { useSession } from './hooks/useSession'
import { LoginPage } from './pages/LoginPage'
import { CoursesPage } from './pages/CoursesPage'
import { CourseView } from './pages/CourseView'
import { SessionDetailPage } from './pages/SessionDetailPage'
import { AuthCallback } from './pages/AuthCallback'
import { DashboardLayout } from './components/DashboardLayout'

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useSession()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-gray-500">
        Loading...
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" replace />
  }

  return <>{children}</>
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/courses"
          element={
            <ProtectedRoute>
              <DashboardLayout>
                <CoursesPage />
              </DashboardLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/courses/:courseId"
          element={
            <ProtectedRoute>
              <DashboardLayout>
                <CourseView />
              </DashboardLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/courses/:courseId/sessions/:sessionId"
          element={
            <ProtectedRoute>
              <DashboardLayout>
                <SessionDetailPage />
              </DashboardLayout>
            </ProtectedRoute>
          }
        />
        <Route path="/auth/callback" element={<AuthCallback />} />
        <Route path="/" element={<Navigate to="/courses" replace />} />
        <Route path="*" element={<Navigate to="/courses" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
