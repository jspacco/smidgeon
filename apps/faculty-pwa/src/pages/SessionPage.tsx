import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import {
  launchQuestion,
  closeQuestion,
  setResultsVisible,
  launchRevote,
  endSession,
} from '../lib/session'
import { useCurrentQuestion } from '../hooks/useCurrentQuestion'
import { useLiveResponses } from '../hooks/useLiveResponses'
import { Button, BarChart, CountUpTimer, ReconnectingIndicator, QRCode } from '@crs/ui'
import { QuestionTypeSelector } from '../components/QuestionTypeSelector'
import type { Course, CRSSession, QuestionType } from '@crs/types'

interface Settings {
  optionCount: number
  multiAnswer: boolean
}

function buildDistribution(rawDist: Record<string, number>, optionCount: number): Record<string, number> {
  const labels = ['A', 'B', 'C', 'D', 'E'].slice(0, optionCount)
  const result: Record<string, number> = {}
  for (const label of labels) {
    result[label] = rawDist[label] ?? 0
  }
  return result
}

export default function SessionPage() {
  const { courseId, sessionId } = useParams<{ courseId: string; sessionId: string }>()
  const navigate = useNavigate()

  const [course, setCourse] = useState<Course | null>(null)
  const [session, setSession] = useState<CRSSession | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const [questionType, setQuestionType] = useState<QuestionType>('MCQ_SINGLE')
  const [settings, setSettings] = useState<Settings>({ optionCount: 5, multiAnswer: false })
  const [showSettings, setShowSettings] = useState(false)
  const [showRevoteButton, setShowRevoteButton] = useState(false)
  const [resultsVisible, setResultsVisibleState] = useState(false)

  const [launching, setLaunching] = useState(false)
  const [stopping, setStopping] = useState(false)
  const [ending, setEnding] = useState(false)

  const { question, isConnected: questionsConnected } = useCurrentQuestion(sessionId ?? null)
  const { respondentCount, distribution, freeResponses, isConnected: responsesConnected } =
    useLiveResponses(question?.id ?? null)

  const isConnected = questionsConnected && (question === null || responsesConnected)
  const isActive = question?.status === 'ACTIVE'
  const isClosed = question?.status === 'CLOSED'

  // Sync resultsVisible from realtime question state
  useEffect(() => {
    if (question) {
      setResultsVisibleState(question.results_visible)
    }
  }, [question?.results_visible, question?.id])

  // Show revote button when question closes, hide when new one launches
  useEffect(() => {
    if (isClosed) {
      setShowRevoteButton(true)
    }
    if (isActive) {
      setShowRevoteButton(false)
    }
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
        setSettings((prev) => ({ ...prev, optionCount: c.default_option_count }))
      } catch (err) {
        setLoadError(err instanceof Error ? err.message : 'Failed to load session')
      }
    }

    load()
  }, [courseId, sessionId])

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

      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <button
            onClick={() => navigate(`/courses/${courseId}`)}
            className="text-blue-600 font-medium text-sm shrink-0"
            aria-label="Back to course"
          >
            ←
          </button>
          <h1 className="text-base font-bold text-gray-900 truncate">
            {course?.name ?? 'Loading…'}
          </h1>
        </div>
        <button
          onClick={() => setShowSettings((s) => !s)}
          disabled={isActive}
          aria-label="Settings"
          aria-expanded={showSettings}
          className={[
            'text-xl px-2 py-1 rounded-lg transition-colors',
            isActive
              ? 'text-gray-300 cursor-not-allowed'
              : 'text-gray-600 hover:bg-gray-100',
          ].join(' ')}
        >
          ⚙
        </button>
      </header>

      {/* Settings panel — inline, not modal */}
      {showSettings && (
        <section
          className="bg-white border-b border-gray-200 px-4 py-4 space-y-4 shrink-0"
          aria-label="Session settings"
        >
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
              Question settings
            </p>

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
                      onChange={() => setSettings((s) => ({ ...s, optionCount: n }))}
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
                      onChange={() => setSettings((s) => ({ ...s, multiAnswer: value }))}
                      className="sr-only"
                    />
                    {label}
                  </label>
                ))}
              </div>
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
              Session
            </p>
            {session && (
              <p className="text-sm text-gray-600 mb-2">
                Join code:{' '}
                <span className="font-mono font-bold tracking-widest text-gray-900">
                  {course?.join_code}
                </span>
              </p>
            )}
            {session && (
              <div className="mb-3 flex justify-center">
                <QRCode value={session.qr_token} size={140} />
              </div>
            )}
            <Button
              variant="danger"
              size="sm"
              onClick={handleEndSession}
              disabled={ending || isActive}
              className="w-full"
            >
              {ending ? 'Ending session…' : 'End session'}
            </Button>
          </div>
        </section>
      )}

      {/* Main controller area */}
      <div className="flex-1 flex flex-col px-4 py-4 gap-4 max-w-lg mx-auto w-full">
        {actionError && (
          <p role="alert" className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">
            {actionError}
          </p>
        )}

        {/* Question type selector — disabled while active */}
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

        {/* Timer + vote count */}
        {(isActive || isClosed) && question && (
          <div className="flex items-center gap-3 px-1">
            <span className="text-2xl font-mono tabular-nums text-gray-800">
              <CountUpTimer
                startedAt={question.launched_at}
                running={isActive}
              />
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

        {/* Live results — always visible to instructor */}
        {question && isMCQ && (
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <BarChart
              data={chartData}
              total={respondentCount}
            />
          </div>
        )}

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

        {/* Idle state hint */}
        {!question && !isActive && (
          <div className="text-center py-8">
            <p className="text-gray-400 text-sm">No question active. Launch one above.</p>
          </div>
        )}
      </div>
    </main>
  )
}

