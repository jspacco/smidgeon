import { useEffect, useState } from 'react'
import { HashRouter, Route, Routes } from 'react-router-dom'
import { supabase } from './lib/supabase'
import { launchQuestion, closeQuestion, setResultsVisible, launchRevote, endSession } from './lib/session'
import { useCurrentQuestion } from './hooks/useCurrentQuestion'
import { useLiveResponses } from './hooks/useLiveResponses'
import { ControllerToolbar } from './components/ControllerToolbar'
import { SessionSelector } from './components/SessionSelector'
import { ResultsWindow } from './windows/ResultsWindow'
import { QRWindow } from './windows/QRWindow'
import { LoginWindow } from './windows/LoginWindow'
import type { User } from '@supabase/supabase-js'
import type { Course, CRSSession, CRSQuestion, QuestionType } from '@crs/types'
import { WebviewWindow } from '@tauri-apps/api/webviewWindow'

interface AppSettings {
  optionCount: number
  multiAnswer: boolean
  screenshotsOn: boolean
}

function ToolbarApp() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedCourse, setSelectedCourse] = useState<Course | null>(null)
  const [activeSession, setActiveSession] = useState<CRSSession | null>(null)
  const [settings, setSettings] = useState<AppSettings>({
    optionCount: 5,
    multiAnswer: false,
    screenshotsOn: false,
  })
  const [selectedType, setSelectedType] = useState<QuestionType>('MCQ_SINGLE')
  const [actionError, setActionError] = useState<string | null>(null)
  const [showRevoteButton, setShowRevoteButton] = useState(false)
  const [resultsWindowOpen, setResultsWindowOpen] = useState(false)
  const [loginWindowOpen, setLoginWindowOpen] = useState(false)

  const { question, isConnected: questionsConnected } = useCurrentQuestion(
    activeSession?.id ?? null,
  )
  const { respondentCount, isConnected: responsesConnected } = useLiveResponses(
    question?.id ?? null,
  )

  const isConnected = questionsConnected && (question === null || responsesConnected)
  const isActive = question?.status === 'ACTIVE'
  const isClosed = question?.status === 'CLOSED'

  // Auth listener
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setUser(data.session?.user ?? null)
      setLoading(false)
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
      setLoading(false)
    })

    return () => subscription.unsubscribe()
  }, [])

  function openLoginWindow() {
    const win = new WebviewWindow('login', {
      url: '#/login',
      title: 'Smidgeon — Sign In',
      width: 480,
      height: 340,
      resizable: false,
      center: true,
      alwaysOnTop: true,
    })
    setLoginWindowOpen(true)
    win.onCloseRequested(() => setLoginWindowOpen(false))
  }

  async function handleSignInClick() {
    if (loginWindowOpen) {
      // Window is open but may be behind other windows — bring it to front
      const win = await WebviewWindow.getByLabel('login')
      await win?.setFocus()
      return
    }
    openLoginWindow()
  }

  // Open login popup when unauthenticated; close it when auth succeeds
  useEffect(() => {
    if (loading) return

    if (!user && !loginWindowOpen) {
      openLoginWindow()
    }

    if (user && loginWindowOpen) {
      WebviewWindow.getByLabel('login').then((win) => win?.close())
      setLoginWindowOpen(false)
    }
  }, [user, loading])

  // Sync default option count from selected course
  useEffect(() => {
    if (selectedCourse) {
      setSettings((s) => ({ ...s, optionCount: selectedCourse.default_option_count }))
    }
  }, [selectedCourse?.id])

  // Revote button visibility: show when closed, hide when new question active
  useEffect(() => {
    if (isClosed) setShowRevoteButton(true)
    if (isActive) setShowRevoteButton(false)
  }, [isActive, isClosed])

  async function handleLaunch() {
    if (!activeSession) return
    setActionError(null)

    // TODO: Screenshot capture on question launch
    // When screenshotsOn=true, capture the screen via Tauri native plugin (requires
    // tauri-plugin-screenshot or similar), upload PNG to Supabase Storage at path:
    //   screenshots/{course_id}/{session_id}/{question_id}.png
    // Then store the public URL in crs_questions.screenshot_url via a follow-up update.
    // Native plugin setup is outside the scope of this build — stub left here intentionally.

    try {
      await launchQuestion(
        activeSession.id,
        selectedType,
        selectedType === 'FREE_RESPONSE' ? null : settings.optionCount,
        selectedType === 'FREE_RESPONSE' ? settings.multiAnswer : false,
      )
      setShowRevoteButton(false)
      // Close results window from previous question if still open
      if (resultsWindowOpen) closeResultsWindow()
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to launch question')
    }
  }

  async function handleStop() {
    if (!question) return
    setActionError(null)
    try {
      await closeQuestion(question.id)
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to stop question')
    }
  }

  async function handleRevote() {
    if (!question) return
    setActionError(null)
    try {
      await launchRevote(question)
      setShowRevoteButton(false)
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to launch revote')
    }
  }

  async function handleToggleResults(currentQuestion: CRSQuestion) {
    setActionError(null)
    const next = !currentQuestion.results_visible
    try {
      await setResultsVisible(currentQuestion.id, next)
      if (next) {
        openResultsWindow()
      } else {
        closeResultsWindow()
      }
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to update results visibility')
    }
  }

  function openResultsWindow() {
    if (resultsWindowOpen) return
    const win = new WebviewWindow('results', {
      url: '#/results',
      title: 'Results',
      width: 600,
      height: 500,
      resizable: true,
      alwaysOnTop: false,
    })
    setResultsWindowOpen(true)
    win.onCloseRequested(async () => {
      setResultsWindowOpen(false)
      // Closing the results window hides results from students
      if (question) {
        try {
          await setResultsVisible(question.id, false)
        } catch (err) {
          console.error('Failed to hide results on window close:', err)
        }
      }
    })
  }

  function closeResultsWindow() {
    WebviewWindow.getByLabel('results').then((win) => win?.close())
    setResultsWindowOpen(false)
  }

  async function handleOpenQR() {
    const existing = await WebviewWindow.getByLabel('qr')
    if (existing) {
      await existing.destroy()
      return
    }
    const win = new WebviewWindow('qr', {
      url: '#/qr',
      title: 'Session QR Code',
      width: 600,
      height: 680,
      minWidth: 400,
      minHeight: 460,
      resizable: true,
      alwaysOnTop: true,
      closable: true,
    })
    win.once('tauri://error', (e) => console.error('QR window error:', e))
  }

  async function handleEndSession() {
    if (!activeSession) return
    setActionError(null)
    try {
      await endSession(activeSession.id)
      // Close any open popup windows
      WebviewWindow.getByLabel('qr').then((win) => win?.close())
      WebviewWindow.getByLabel('results').then((win) => win?.close())
      setResultsWindowOpen(false)
      setActiveSession(null)
      setSelectedCourse(null)
      setShowRevoteButton(false)
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to end session')
    }
  }

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center bg-gray-900">
        <p className="text-gray-400 text-sm">Loading…</p>
      </div>
    )
  }

  if (!user) {
    return (
      <button
        onClick={() => void handleSignInClick()}
        className="w-full flex items-center justify-center bg-gray-900 hover:bg-gray-800 transition-colors cursor-pointer"
        style={{ height: 60 }}
        aria-label={loginWindowOpen ? 'Bring sign-in window to front' : 'Open sign-in window'}
      >
        <p className="text-xs text-gray-500 select-none">
          {loginWindowOpen
            ? 'Smidgeon Controller — click to show sign-in window'
            : 'Smidgeon Controller — click to sign in'}
        </p>
      </button>
    )
  }

  if (!activeSession || !selectedCourse) {
    return (
      <SessionSelector
        user={user}
        onSessionStarted={(course, session) => {
          setSelectedCourse(course)
          setActiveSession(session)
        }}
      />
    )
  }

  return (
    <div className="h-screen flex flex-col bg-gray-900">
      {actionError && (
        <div
          role="alert"
          className="absolute top-0 left-0 right-0 text-xs text-red-200 bg-red-900 px-3 py-1 z-50"
        >
          {actionError}
        </div>
      )}
      <ControllerToolbar
        session={activeSession}
        course={selectedCourse}
        currentQuestion={question}
        respondentCount={respondentCount}
        isConnected={isConnected}
        selectedType={selectedType}
        onTypeChange={setSelectedType}
        settings={settings}
        onSettingsChange={setSettings}
        onLaunch={handleLaunch}
        onStop={handleStop}
        onRevote={handleRevote}
        onToggleResults={() => question && handleToggleResults(question)}
        onOpenQR={handleOpenQR}
        onEndSession={handleEndSession}
        showRevoteButton={showRevoteButton}
        resultsVisible={question?.results_visible ?? false}
      />
    </div>
  )
}

export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<ToolbarApp />} />
        <Route path="/login" element={<LoginWindow />} />
        <Route path="/results" element={<ResultsWindow />} />
        <Route path="/qr" element={<QRWindow />} />
      </Routes>
    </HashRouter>
  )
}
