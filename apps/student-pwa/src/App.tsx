import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useSession } from './hooks/useSession'
import LoginPage from './pages/LoginPage'
import LandingPage from './pages/LandingPage'
import SessionPage from './pages/SessionPage'
import AuthCallback from './pages/AuthCallback'
import JoinPage from './pages/JoinPage'

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

  return user ? <LandingPage /> : <LoginPage />
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<RootRedirect />} />
        <Route path="/auth/callback" element={<AuthCallback />} />
        {/* /join?token=<qr_token> — entry point for stock camera app scans */}
        <Route path="/join" element={<JoinPage />} />
        <Route
          path="/courses/:courseId/session/:sessionId"
          element={
            <ProtectedRoute>
              <SessionPage />
            </ProtectedRoute>
          }
        />
      </Routes>
    </BrowserRouter>
  )
}
