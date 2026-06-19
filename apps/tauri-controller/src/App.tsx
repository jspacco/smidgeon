import { useEffect, useRef, useState } from 'react'
import { HashRouter, Route, Routes } from 'react-router-dom'
import { supabase } from './lib/supabase'
import {
  launchQuestion,
  closeQuestion,
  setResultsVisible,
  launchRevote,
  endSession,
  uploadScreenshot,
  updateScreenshotUrl,
} from './lib/session'
import { useCurrentQuestion } from './hooks/useCurrentQuestion'
import { useLiveResponses } from './hooks/useLiveResponses'
import { ControllerToolbar } from './components/ControllerToolbar'
import { SessionSelector } from './components/SessionSelector'
import { LoginView } from './components/LoginView'
import { ResultsWindow } from './windows/ResultsWindow'
import { QRWindow } from './windows/QRWindow'
import type { User } from '@supabase/supabase-js'
import type { Course, CRSSession, CRSQuestion, QuestionType } from '@crs/types'
import { WebviewWindow } from '@tauri-apps/api/webviewWindow'
import { getCurrentWindow, LogicalSize } from '@tauri-apps/api/window'
import { listen } from '@tauri-apps/api/event'
import { invoke } from '@tauri-apps/api/core'

interface AppSettings {
  optionCount: number
  multiAnswer: boolean
  screenshotsOn: boolean
  selectedDisplayId: number | null
}

function ToolbarApp() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedCourse, setSelectedCourse] = useState<Course | null>(null)
  const [activeSession, setActiveSession] = useState<CRSSession | null>(null)
  const [settings, setSettings] = useState<AppSettings>({
    optionCount: 5,
    multiAnswer: true,
    screenshotsOn: false,
    selectedDisplayId: null,
  })
  const [selectedType, setSelectedType] = useState<QuestionType>('MCQ_SINGLE')
  const [authError, setAuthError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [screenshotWarning, setScreenshotWarning] = useState<string | null>(null)
  // Avoid nagging on every launch if capture is broken; warn once per session.
  const screenshotWarnedRef = useRef(false)
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

  // Auth listener + oauth-callback handler + window resize
  useEffect(() => {
    const win = getCurrentWindow()

    const oauthUnlistenPromise = listen<string>('oauth-callback', async (event) => {
      const url = new URL(event.payload)
      const code = url.searchParams.get('code')
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code)
        if (error) {
          setAuthError(error.message)
        }
      }
    })

    supabase.auth.getSession().then(async ({ data }) => {
      const u = data.session?.user ?? null
      setUser(u)
      setLoading(false)
      if (u) {
        await win.setSize(new LogicalSize(480, 60))
      } else {
        await win.setSize(new LogicalSize(480, 340))
      }
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, session) => {
      const u = session?.user ?? null
      setUser(u)
      setLoading(false)
      if (u) {
        await win.setSize(new LogicalSize(480, 60))
      } else {
        await win.setSize(new LogicalSize(480, 340))
      }
    })

    return () => {
      subscription.unsubscribe()
      oauthUnlistenPromise.then((unlisten) => unlisten())
    }
  }, [])

  // Sync defaults from selected course
  useEffect(() => {
    if (selectedCourse) {
      setSettings((s) => ({
        ...s,
        optionCount: selectedCourse.default_option_count,
        multiAnswer: selectedCourse.default_multi_answer,
      }))
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

    // --- Screenshot capture (before launch so we have the bytes ready) ---
    // Failure here must never block the question from launching.
    // null selectedDisplayId = auto mode: capture whichever display the toolbar is on.
    let capturedJpeg: string | null = null
    if (settings.screenshotsOn) {
      try {
        if (settings.selectedDisplayId === null) {
          // Auto: detect from toolbar window position
          capturedJpeg = await invoke<string>('capture_controller_display')
        } else {
          // Manual: specific display
          capturedJpeg = await invoke<string>('capture_display', {
            displayId: settings.selectedDisplayId,
          })
        }
      } catch (err) {
        console.error('Screenshot capture failed:', err)
        if (!screenshotWarnedRef.current) {
          screenshotWarnedRef.current = true
          setScreenshotWarning(
            'Screenshot capture failed — check Screen Recording permission in System Settings',
          )
        }
      }
    }

    // --- Launch the question (must succeed regardless of screenshot outcome) ---
    try {
      const newQuestion = await launchQuestion(
        activeSession.id,
        selectedType,
        selectedType === 'FREE_RESPONSE' ? null : settings.optionCount,
        selectedType === 'FREE_RESPONSE' ? settings.multiAnswer : false,
      )
      setShowRevoteButton(false)
      if (resultsWindowOpen) closeResultsWindow()

      // --- Upload screenshot asynchronously (do NOT await — never blocks UI) ---
      if (capturedJpeg !== null && selectedCourse !== null) {
        uploadAndAttachScreenshot(capturedJpeg, selectedCourse.id, activeSession.id, newQuestion.id)
      }
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to launch question')
    }
  }

  /** Fire-and-forget: upload JPEG bytes to Storage, then write path to screenshot_url. */
  function uploadAndAttachScreenshot(
    base64Jpeg: string,
    courseId: string,
    sessionId: string,
    questionId: string,
  ) {
    uploadScreenshot(base64Jpeg, courseId, sessionId, questionId)
      .then((path) => updateScreenshotUrl(questionId, path))
      .catch((err: unknown) => {
        console.error('Screenshot upload/attach failed:', err)
        if (!screenshotWarnedRef.current) {
          screenshotWarnedRef.current = true
          setScreenshotWarning('Screenshot upload failed — question saved without screenshot')
        }
      })
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
      setScreenshotWarning(null)
      screenshotWarnedRef.current = false
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
    return <LoginView initialError={authError} onClearError={() => setAuthError(null)} />
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
      {screenshotWarning && (
        <div
          role="status"
          className="absolute top-0 left-0 right-0 flex items-center justify-between text-xs text-amber-200 bg-amber-900 px-3 py-1 z-40"
        >
          <span>{screenshotWarning}</span>
          <button
            onClick={() => setScreenshotWarning(null)}
            className="ml-2 text-amber-300 hover:text-white font-bold"
            aria-label="Dismiss screenshot warning"
          >
            ×
          </button>
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
