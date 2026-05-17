import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useSession } from './hooks/useSession'
import LoginPage from './pages/LoginPage'
import CoursesPage from './pages/CoursesPage'
import CourseHomePage from './pages/CourseHomePage'
import SessionPage from './pages/SessionPage'
import QRScanPage from './pages/QRScanPage'

function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, loading } = useSession()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <p className="text-gray-500 text-sm">Loading…</p>
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/" replace />
  }

  return <>{children}</>
}

function RootRedirect() {
  const { user, loading } = useSession()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <p className="text-gray-500 text-sm">Loading…</p>
      </div>
    )
  }

  return user ? <Navigate to="/courses" replace /> : <LoginPage />
}

export default function App() {
  return (
    <BrowserRouter>
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
        <Route
          path="/scan"
          element={
            <ProtectedRoute>
              <QRScanPage />
            </ProtectedRoute>
          }
        />
      </Routes>
    </BrowserRouter>
  )
}
