import { useEffect, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import {
  launchQuestion,
  closeQuestion,
  setResultsVisible,
  launchRevote,
  endSession,
} from '../lib/session'
import { acquireWakeLock, releaseWakeLock } from '../lib/wakeLock'
import { useCurrentQuestion } from '../hooks/useCurrentQuestion'
import { useLiveResponses } from '../hooks/useLiveResponses'
import { Button, BarChart, CountUpTimer, ReconnectingIndicator, QRCode } from '@crs/ui'

// Base URL of the student PWA. Self-hosters set VITE_STUDENT_APP_URL in their
// deployment environment; Spacco's own deployment uses the default.
const STUDENT_APP_URL =
  (import.meta.env.VITE_STUDENT_APP_URL as string | undefined)?.replace(/\/$/, '') ??
  'https://smidgeon.app'
import { QuestionTypeSelector } from '../components/QuestionTypeSelector'
import type { Course, CRSSession, CRSQuestion, QuestionType } from '@crs/types'

type ViewMode = 'monitor' | 'control'

interface Settings {
  optionCount: number
  multiAnswer: boolean
}

interface AttendeeRow {
  user_id: string
  name: string
  email: string
  attended: boolean
}

const TYPE_LABELS: Record<CRSQuestion['type'], string> = {
  MCQ_SINGLE: 'MCQ Single',
  MCQ_MULTI: 'MCQ Multi',
  FREE_RESPONSE: 'Free Response',
}

function buildDistribution(rawDist: Record<string, number>, optionCount: number): Record<string, number> {
  const labels = ['A', 'B', 'C', 'D', 'E'].slice(0, optionCount)
  const result: Record<string, number> = {}
  for (const label of labels) {
    result[label] = rawDist[label] ?? 0
  }
  return result
}

function formatDatetime(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

export default function SessionPage() {
  const { courseId, sessionId } = useParams<{ courseId: string; sessionId: string }>()
  const navigate = useNavigate()
  const location = useLocation()

  const autoJoined = (location.state as { autoJoined?: boolean } | null)?.autoJoined ?? false
  const [mode, setMode] = useState<ViewMode>(autoJoined ? 'monitor' : 'control')
  const [course, setCourse] = useState<Course | null>(null)
  const [session, setSession] = useState<CRSSession | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const [questionType, setQuestionType] = useState<QuestionType>('MCQ_SINGLE')
  const [settings, setSettings] = useState<Settings>({ optionCount: 5, multiAnswer: false })
  const [showSettings, setShowSettings] = useState(false)
  const [saveScope, setSaveScope] = useState<'session' | 'course'>('session')
  const [showRevoteButton, setShowRevoteButton] = useState(false)
  const [resultsVisible, setResultsVisibleState] = useState(false)
  const [showFullscreenQR, setShowFullscreenQR] = useState(false)

  const [launching, setLaunching] = useState(false)
  const [stopping, setStopping] = useState(false)
  const [ending, setEnding] = useState(false)

  const [attendees, setAttendees] = useState<AttendeeRow[]>([])
  const [showAttendance, setShowAttendance] = useState(false)
  const [markingPresent, setMarkingPresent] = useState<string | null>(null)

  const { question, isConnected: questionsConnected } = useCurrentQuestion(sessionId ?? null)
  const { respondentCount, distribution, freeResponses, isConnected: responsesConnected } =
    useLiveResponses(question?.id ?? null)

  const isConnected = questionsConnected && (question === null || responsesConnected)
  const isActive = question?.status === 'ACTIVE'
  const isClosed = question?.status === 'CLOSED'

  // Wake lock: keep screen on in monitor mode
  useEffect(() => {
    if (mode !== 'monitor') {
      void releaseWakeLock()
      return
    }
    void acquireWakeLock()
    return () => { void releaseWakeLock() }
  }, [mode])

  // Sync resultsVisible from realtime question state
  useEffect(() => {
    if (question) {
      setResultsVisibleState(question.results_visible)
    }
  }, [question?.results_visible, question?.id])

  // Show revote button when question closes, hide when new one launches
  useEffect(() => {
    if (isClosed) setShowRevoteButton(true)
    if (isActive) setShowRevoteButton(false)
  }, [isActive, isClosed])

  // Load course and session
  useEffect(() => {
    if (!courseId || !sessionId) return

    async function load() {
      try {
        const [{ data: courseData, error: courseError }, { data: sessionData, error: sessionError }] =
          await Promise.all([
            supabase.from('courses').select('*').eq('id', courseId).single(),
            supabase.from('crs_sessions').select('*').eq('id', sessionId).single(),
          ])

        if (courseError) throw new Error(courseError.message)
        if (sessionError) throw new Error(sessionError.message)

        const c = courseData as Course
        setCourse(c)
        setSession(sessionData as CRSSession)
        setSettings({ optionCount: c.default_option_count, multiAnswer: c.default_multi_answer })
      } catch (err) {
        setLoadError(err instanceof Error ? err.message : 'Failed to load session')
      }
    }

    load()
  }, [courseId, sessionId])

  // Load attendance when section is opened
  useEffect(() => {
    if (!showAttendance || !courseId || !sessionId) return

    async function loadAttendance() {
      try {
        const [enrollRes, attendRes] = await Promise.all([
          supabase
            .from('enrollments')
            .select('user_id, users(name, email)')
            .eq('course_id', courseId)
            .eq('role', 'STUDENT'),
          supabase
            .from('session_attendance')
            .select('user_id')
            .eq('session_id', sessionId),
        ])

        const attendedIds = new Set(
          ((attendRes.data ?? []) as Array<{ user_id: string }>).map((r) => r.user_id)
        )

        const rows: AttendeeRow[] = ((enrollRes.data ?? []) as unknown as Array<{
          user_id: string
          users: { name: string; email: string }[] | null
        }>)
          .filter((r) => r.users !== null && r.users.length > 0)
          .map((r) => ({
            user_id: r.user_id,
            name: r.users![0]!.name,
            email: r.users![0]!.email,
            attended: attendedIds.has(r.user_id),
          }))
          .sort((a, b) => a.name.localeCompare(b.name))

        setAttendees(rows)
      } catch {
        // Silently fail — attendance section is non-critical
      }
    }

    void loadAttendance()
  }, [showAttendance, courseId, sessionId])

  async function handleMarkPresent(userId: string) {
    if (!sessionId) return
    setMarkingPresent(userId)
    try {
      const { error } = await supabase
        .from('session_attendance')
        .upsert(
          { session_id: sessionId, user_id: userId, scan_token: 'MANUAL', method: 'CODE' },
          { onConflict: 'session_id,user_id' }
        )
      if (error) throw error
      setAttendees((prev) =>
        prev.map((a) => (a.user_id === userId ? { ...a, attended: true } : a))
      )
    } catch {
      // Non-critical
    } finally {
      setMarkingPresent(null)
    }
  }

  async function handleSaveToCourseDefaults(optionCount: number, multiAnswer: boolean) {
    if (!courseId || !course) return
    try {
      const { error } = await supabase
        .from('courses')
        .update({ default_option_count: optionCount, default_multi_answer: multiAnswer })
        .eq('id', courseId)
      if (error) throw error
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to save course defaults')
    }
  }

  function handleOptionCountChange(n: number) {
    setSettings((s) => {
      const next = { ...s, optionCount: n }
      if (saveScope === 'course') void handleSaveToCourseDefaults(n, next.multiAnswer)
      return next
    })
  }

  function handleMultiAnswerChange(value: boolean) {
    setSettings((s) => {
      const next = { ...s, multiAnswer: value }
      if (saveScope === 'course') void handleSaveToCourseDefaults(next.optionCount, value)
      return next
    })
  }

  async function handleLaunch() {
    if (!sessionId) return
    setActionError(null)
    setLaunching(true)
    try {
      await launchQuestion(
        sessionId,
        questionType,
        questionType === 'FREE_RESPONSE' ? null : settings.optionCount,
        questionType === 'FREE_RESPONSE' ? settings.multiAnswer : false,
      )
      setShowRevoteButton(false)
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to launch question')
    } finally {
      setLaunching(false)
    }
  }

  async function handleStop() {
    if (!question) return
    setActionError(null)
    setStopping(true)
    try {
      await closeQuestion(question.id)
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to stop question')
    } finally {
      setStopping(false)
    }
  }

  async function handleRevote() {
    if (!question) return
    setActionError(null)
    setLaunching(true)
    try {
      await launchRevote(question)
      setShowRevoteButton(false)
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to launch revote')
    } finally {
      setLaunching(false)
    }
  }

  async function handleToggleResults() {
    if (!question) return
    setActionError(null)
    const next = !resultsVisible
    try {
      await setResultsVisible(question.id, next)
      setResultsVisibleState(next)
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to update results visibility')
    }
  }

  async function handleEndSession() {
    if (!sessionId) return
    setActionError(null)
    setEnding(true)
    try {
      await endSession(sessionId)
      navigate(`/courses/${courseId}`)
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to end session')
      setEnding(false)
    }
  }

  function getLaunchLabel(): string {
    if (launching) return 'Launching…'
    switch (questionType) {
      case 'MCQ_SINGLE': return '▶  Launch MCQ Single'
      case 'MCQ_MULTI': return '▶  Launch MCQ Multi'
      case 'FREE_RESPONSE': return '▶  Launch Free Response'
    }
  }

  const currentOptionCount = question?.option_count ?? settings.optionCount
  const isMCQ = question ? question.type !== 'FREE_RESPONSE' : questionType !== 'FREE_RESPONSE'

  const chartData =
    isMCQ && question
      ? buildDistribution(distribution, currentOptionCount)
      : isMCQ
        ? buildDistribution({}, settings.optionCount)
        : {}

  if (loadError) {
    return (
      <main className="flex items-center justify-center min-h-screen px-4">
        <p role="alert" className="text-red-600 text-center">{loadError}</p>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-gray-50 flex flex-col">
      <ReconnectingIndicator isConnected={isConnected} />

      {/* Fullscreen QR overlay */}
      {showFullscreenQR && session && (
        <div
          className="fixed inset-0 bg-white z-50 flex flex-col items-center justify-center gap-6 px-6"
          onClick={() => setShowFullscreenQR(false)}
          role="dialog"
          aria-label="QR code fullscreen — tap to close"
          aria-modal="true"
        >
          <p className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
            Scan to join session
          </p>
          <div onClick={(e) => e.stopPropagation()}>
            <QRCode value={`${STUDENT_APP_URL}/join?token=${session.qr_token}`} size={280} />
          </div>
          <p className="text-5xl font-mono font-bold tracking-widest text-gray-900">
            {session.session_code}
          </p>
          <p className="text-xs text-gray-400 mt-2">Tap anywhere to close</p>
        </div>
      )}

      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-2 shrink-0">
        <button
          onClick={() => navigate(`/courses/${courseId}`)}
          className="text-blue-600 font-medium text-sm shrink-0"
          aria-label="Back to course"
        >
          ←
        </button>
        <h1 className="text-base font-bold text-gray-900 truncate flex-1 min-w-0">
          {course?.name ?? 'Loading…'}
        </h1>

        {/* Monitor / Control toggle */}
        <div
          className="flex rounded-lg border border-gray-200 overflow-hidden shrink-0"
          role="group"
          aria-label="View mode"
        >
          <button
            onClick={() => setMode('monitor')}
            aria-pressed={mode === 'monitor'}
            className={[
              'px-3 py-1.5 text-xs font-semibold transition-colors',
              mode === 'monitor'
                ? 'bg-blue-600 text-white'
                : 'bg-white text-gray-600 hover:bg-gray-50',
            ].join(' ')}
          >
            Monitor
          </button>
          <button
            onClick={() => setMode('control')}
            aria-pressed={mode === 'control'}
            className={[
              'px-3 py-1.5 text-xs font-semibold transition-colors border-l border-gray-200',
              mode === 'control'
                ? 'bg-blue-600 text-white'
                : 'bg-white text-gray-600 hover:bg-gray-50',
            ].join(' ')}
          >
            Control
          </button>
        </div>

        {/* Settings gear — control mode only */}
        {mode === 'control' && (
          <button
            onClick={() => setShowSettings((s) => !s)}
            disabled={isActive}
            aria-label="Settings"
            aria-expanded={showSettings}
            className={[
              'text-xl px-2 py-1 rounded-lg transition-colors shrink-0',
              isActive
                ? 'text-gray-300 cursor-not-allowed'
                : 'text-gray-600 hover:bg-gray-100',
            ].join(' ')}
          >
            ⚙
          </button>
        )}
      </header>

      {/* Session code bar — always visible */}
      {session && (
        <div className="bg-white border-b border-gray-100 px-4 py-3 flex items-center justify-between shrink-0">
          <div>
            <p className="text-xs text-gray-400 uppercase tracking-wide font-semibold">Session</p>
            <p className="text-xs text-gray-500 font-mono">{formatDatetime(session.started_at)}</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <p className="text-xs text-gray-400 uppercase tracking-wide font-semibold">Code</p>
              <p className="text-2xl font-mono font-bold tracking-widest text-gray-900">
                {session.session_code}
              </p>
            </div>
            <button
              onClick={() => setShowFullscreenQR(true)}
              className="flex flex-col items-center justify-center w-14 h-12 rounded-lg bg-gray-100 hover:bg-gray-200 transition-colors text-xs font-medium text-gray-700"
              aria-label="Show QR code fullscreen"
            >
              <span className="text-base" aria-hidden="true">⬛</span>
              <span className="text-xs leading-none">QR</span>
            </button>
          </div>
        </div>
      )}

      {/* Settings panel — control mode only */}
      {mode === 'control' && showSettings && (
        <section
          className="bg-white border-b border-gray-200 px-4 py-4 space-y-4 shrink-0"
          aria-label="Session settings"
        >
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
              Question settings
            </p>

            <div className="mb-3">
              <p className="text-sm font-medium text-gray-700 mb-2">Apply to</p>
              <div className="flex gap-2" role="radiogroup" aria-label="Settings scope">
                {([
                  { value: 'session', label: 'This session' },
                  { value: 'course', label: 'This course' },
                ] as const).map(({ value, label }) => (
                  <label
                    key={value}
                    className={[
                      'flex items-center justify-center px-4 h-9 rounded-lg border-2 cursor-pointer text-sm font-medium transition-colors',
                      saveScope === value
                        ? 'border-blue-600 bg-blue-600 text-white'
                        : 'border-gray-300 bg-white text-gray-700 hover:border-blue-400',
                    ].join(' ')}
                  >
                    <input
                      type="radio"
                      name="settings-scope"
                      checked={saveScope === value}
                      onChange={() => setSaveScope(value)}
                      className="sr-only"
                    />
                    {label}
                  </label>
                ))}
              </div>
            </div>

            <div className="mb-3">
              <p className="text-sm font-medium text-gray-700 mb-2">MCQ option count</p>
              <div className="flex gap-2" role="radiogroup" aria-label="MCQ option count">
                {([2, 3, 4, 5] as const).map((n) => (
                  <label
                    key={n}
                    className={[
                      'flex items-center justify-center w-11 h-11 rounded-lg border-2 cursor-pointer font-semibold text-lg transition-colors',
                      settings.optionCount === n
                        ? 'border-blue-600 bg-blue-600 text-white'
                        : 'border-gray-300 bg-white text-gray-700 hover:border-blue-400',
                    ].join(' ')}
                  >
                    <input
                      type="radio"
                      name="settings-option-count"
                      value={n}
                      checked={settings.optionCount === n}
                      onChange={() => handleOptionCountChange(n)}
                      className="sr-only"
                    />
                    {n}
                  </label>
                ))}
              </div>
            </div>

            <div>
              <p className="text-sm font-medium text-gray-700 mb-2">Free response submissions</p>
              <div className="flex gap-2" role="radiogroup" aria-label="Free response submission mode">
                {([
                  { value: false, label: 'Single' },
                  { value: true, label: 'Multi' },
                ] as const).map(({ value, label }) => (
                  <label
                    key={label}
                    className={[
                      'flex items-center justify-center px-4 h-9 rounded-lg border-2 cursor-pointer text-sm font-medium transition-colors',
                      settings.multiAnswer === value
                        ? 'border-blue-600 bg-blue-600 text-white'
                        : 'border-gray-300 bg-white text-gray-700 hover:border-blue-400',
                    ].join(' ')}
                  >
                    <input
                      type="radio"
                      name="multi-answer"
                      checked={settings.multiAnswer === value}
                      onChange={() => handleMultiAnswerChange(value)}
                      className="sr-only"
                    />
                    {label}
                  </label>
                ))}
              </div>
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
              Session info
            </p>
            <p className="text-sm text-gray-600">
              Join code:{' '}
              <span className="font-mono font-bold tracking-widest text-gray-900">
                {course?.join_code}
              </span>
            </p>
          </div>
        </section>
      )}

      {/* ── MONITOR MODE ─────────────────────────────────────────────────────── */}
      {mode === 'monitor' && (
        <div className="flex-1 flex flex-col min-h-0">

          {/* Question info row */}
          <div className="px-5 pt-3 pb-1 shrink-0">
            {question ? (
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-600">
                  {TYPE_LABELS[question.type]}
                  {' · '}Q{question.sequence_number}
                  {question.is_revote ? ' (Revote)' : ''}
                </span>
                <span className="text-2xl font-mono tabular-nums text-gray-800">
                  <CountUpTimer startedAt={question.launched_at} running={isActive} />
                </span>
              </div>
            ) : (
              <p className="text-sm text-gray-400">No active question</p>
            )}
          </div>

          {/* Chart / responses — takes most of screen */}
          <div className="flex-1 px-4 py-2 min-h-0">
            {question && isMCQ && (
              <div className="h-full bg-white rounded-xl border border-gray-200 p-4">
                <BarChart data={chartData} total={respondentCount} />
              </div>
            )}

            {question && !isMCQ && (
              <div className="h-full bg-white rounded-xl border border-gray-200 p-4 overflow-y-auto">
                {freeResponses.length > 0 ? (
                  <ul className="space-y-2" aria-label="Free responses" aria-live="polite">
                    {freeResponses.map((resp, i) => (
                      <li
                        key={i}
                        className="text-sm text-gray-800 bg-gray-50 rounded-lg px-3 py-2 break-words"
                      >
                        {resp}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-gray-400 text-sm text-center pt-8">No responses yet.</p>
                )}
              </div>
            )}

            {!question && (
              <div className="h-full flex items-center justify-center">
                <div className="text-center space-y-3">
                  <div
                    className="w-10 h-10 border-4 border-gray-200 border-t-gray-400 rounded-full animate-spin mx-auto"
                    aria-hidden="true"
                  />
                  <p className="text-gray-400 text-base">Waiting for next question…</p>
                </div>
              </div>
            )}
          </div>

          {/* Vote count */}
          <div className="px-5 py-2 shrink-0">
            {question && (
              <p
                className="text-lg font-semibold text-gray-700"
                aria-live="polite"
                aria-label={`${respondentCount} voted`}
              >
                {respondentCount} voted
              </p>
            )}
          </div>

          {/* Bottom action buttons — only when question is CLOSED */}
          {isClosed && question && (
            <div className="px-4 pt-2 pb-8 flex gap-3 shrink-0">
              <div className="flex-1 flex flex-col items-center gap-1">
                <Button
                  variant="secondary"
                  size="lg"
                  className="w-full"
                  onClick={handleRevote}
                  disabled={!showRevoteButton || launching}
                  aria-label="Launch revote"
                >
                  ↺ Revote
                </Button>
                <p className="text-xs text-gray-400">needs discussion</p>
              </div>
              <div className="flex-1 flex flex-col items-center gap-1">
                <Button
                  variant="secondary"
                  size="lg"
                  className={[
                    'w-full',
                    resultsVisible ? 'border-blue-500 text-blue-700 bg-blue-50' : '',
                  ].join(' ')}
                  onClick={handleToggleResults}
                  aria-label={resultsVisible ? 'Hide results from students' : 'Show results to students'}
                >
                  {resultsVisible ? '👁 Hide results' : '👁 Show results'}
                </Button>
                <p className="text-xs text-gray-400">
                  {resultsVisible ? 'results shown' : 'clear answer'}
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── CONTROL MODE ─────────────────────────────────────────────────────── */}
      {mode === 'control' && (
        <div className="flex-1 flex flex-col px-4 py-4 gap-4 max-w-lg mx-auto w-full">
          {actionError && (
            <p role="alert" className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">
              {actionError}
            </p>
          )}

          {/* Bar chart — above controls, live updates */}
          {question && isMCQ && (
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <BarChart data={chartData} total={respondentCount} />
            </div>
          )}

          {/* Timer + vote count */}
          {(isActive || isClosed) && question && (
            <div className="flex items-center gap-3 px-1">
              <span className="text-2xl font-mono tabular-nums text-gray-800">
                <CountUpTimer startedAt={question.launched_at} running={isActive} />
              </span>
              <span className="text-gray-400">•</span>
              <span
                className="text-lg font-semibold text-gray-700"
                aria-live="polite"
                aria-label={`${respondentCount} voted`}
              >
                {respondentCount} voted
              </span>
            </div>
          )}

          {/* Free responses */}
          {question && !isMCQ && freeResponses.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
                Free responses
              </p>
              <ul
                className="space-y-2 max-h-64 overflow-y-auto"
                aria-label="Free responses"
                aria-live="polite"
              >
                {freeResponses.map((resp, i) => (
                  <li
                    key={i}
                    className="text-sm text-gray-800 bg-gray-50 rounded-lg px-3 py-2 break-words"
                  >
                    {resp}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Question type selector */}
          <QuestionTypeSelector
            value={questionType}
            onChange={setQuestionType}
            disabled={isActive}
          />

          {/* Primary action button */}
          {isActive ? (
            <Button
              variant="danger"
              size="lg"
              onClick={handleStop}
              disabled={stopping}
              className="w-full text-xl py-5"
              aria-label="Stop question"
            >
              {stopping ? 'Stopping…' : '■  Stop'}
            </Button>
          ) : (
            <Button
              size="lg"
              onClick={handleLaunch}
              disabled={launching}
              className="w-full text-xl py-5 bg-green-600 hover:bg-green-700 active:bg-green-800"
              aria-label={getLaunchLabel()}
            >
              {getLaunchLabel()}
            </Button>
          )}

          {/* Secondary action row: Revote + Show/Hide */}
          <div className="flex gap-3">
            {showRevoteButton && question && (
              <Button
                variant="secondary"
                size="md"
                onClick={handleRevote}
                disabled={launching}
                className="flex-1"
                aria-label="Launch revote"
              >
                ↺ Revote
              </Button>
            )}
            {(isActive || isClosed) && question && (
              <Button
                variant="secondary"
                size="md"
                onClick={handleToggleResults}
                disabled={isActive}
                className="flex-1"
                aria-label={resultsVisible ? 'Hide results from students' : 'Show results to students'}
              >
                {resultsVisible ? '👁 Hide results' : '👁 Show results'}
              </Button>
            )}
          </div>

          {/* Idle state hint */}
          {!question && (
            <div className="text-center py-4">
              <p className="text-gray-400 text-sm">No question active. Launch one above.</p>
            </div>
          )}

          {/* END SESSION */}
          <div className="pt-2">
            <Button
              variant="danger"
              size="lg"
              onClick={handleEndSession}
              disabled={ending || isActive}
              className="w-full"
              aria-label="End session"
            >
              {ending ? 'Ending session…' : '■  End Session'}
            </Button>
            {isActive && (
              <p className="text-xs text-gray-400 text-center mt-1">
                Stop the active question before ending the session.
              </p>
            )}
          </div>

          {/* Attendance section */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <button
              className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
              onClick={() => setShowAttendance((s) => !s)}
              aria-expanded={showAttendance}
            >
              <span>Attendance</span>
              <span className="text-xs text-gray-400">
                {attendees.length > 0
                  ? `${attendees.filter((a) => a.attended).length} / ${attendees.length} present`
                  : ''}
                {showAttendance ? ' ▲' : ' ▼'}
              </span>
            </button>

            {showAttendance && (
              <div className="border-t border-gray-100 px-4 py-3">
                {attendees.length === 0 && (
                  <p className="text-sm text-gray-400 text-center py-2">Loading…</p>
                )}
                <ul className="space-y-2 max-h-64 overflow-y-auto">
                  {attendees.map((a) => (
                    <li key={a.user_id} className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{a.name}</p>
                        <p className="text-xs text-gray-400 truncate">{a.email}</p>
                      </div>
                      {a.attended ? (
                        <span className="text-xs font-semibold text-green-600 shrink-0">✓ Present</span>
                      ) : (
                        <button
                          onClick={() => void handleMarkPresent(a.user_id)}
                          disabled={markingPresent === a.user_id}
                          className="text-xs font-medium text-blue-600 hover:text-blue-800 shrink-0 disabled:opacity-50"
                          aria-label={`Mark ${a.name} present`}
                        >
                          {markingPresent === a.user_id ? 'Marking…' : 'Mark present'}
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}
    </main>
  )
}
