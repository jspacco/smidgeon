import { useEffect, useState } from 'react'
import { HashRouter, Route, Routes } from 'react-router-dom'
import { supabase } from './lib/supabase'
import { launchQuestion, closeQuestion, setResultsVisible, launchRevote, endSession } from './lib/session'
import { useCurrentQuestion } from './hooks/useCurrentQuestion'
import { useLiveResponses } from './hooks/useLiveResponses'
import { ControllerToolbar } from './components/ControllerToolbar'
import { LoginView } from './components/LoginView'
import { SessionSelector } from './components/SessionSelector'
import { ResultsWindow } from './windows/ResultsWindow'
import { QRWindow } from './windows/QRWindow'
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
    setResultsWindowOpen(false)
    // The WebviewWindow close is handled by the user; we only need to toggle the DB flag
    // (already done via handleToggleResults calling setResultsVisible(false))
  }

  function handleOpenQR() {
    new WebviewWindow('qr', {
      url: '#/qr',
      title: 'Session QR Code',
      width: 320,
      height: 360,
      resizable: false,
      alwaysOnTop: true,
    })
  }

  async function handleEndSession() {
    if (!activeSession) return
    setActionError(null)
    try {
      await endSession(activeSession.id)
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
    return <LoginView />
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
    <div className="h-screen flex flex-col bg-gray-900 overflow-hidden">
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
        <Route path="/results" element={<ResultsWindow />} />
        <Route path="/qr" element={<QRWindow />} />
      </Routes>
    </HashRouter>
  )
}
