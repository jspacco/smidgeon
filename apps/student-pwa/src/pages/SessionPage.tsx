import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import type { CRSResponse } from '@crs/types'
import { BarChart, CountUpTimer, ReconnectingIndicator } from '@crs/ui'
import { supabase } from '../lib/supabase'
import { useSession } from '../hooks/useSession'
import { useActiveQuestion } from '../hooks/useActiveQuestion'
import { acquireWakeLock, releaseWakeLock } from '../lib/wakeLock'
import { QuestionView } from '../components/QuestionView'

// ─── Vote count hook ──────────────────────────────────────────────────────────

function useVoteCount(questionId: string | undefined): number {
  const [count, setCount] = useState(0)

  useEffect(() => {
    if (!questionId) {
      setCount(0)
      return
    }

    // Initial fetch
    supabase
      .from('crs_responses')
      .select('user_id')
      .eq('question_id', questionId)
      .then(({ data }) => {
        if (!data) return
        const unique = new Set(data.map((r: { user_id: string }) => r.user_id))
        setCount(unique.size)
      })

    // Subscribe to inserts/deletes for live count
    const channel = supabase
      .channel(`responses:count:${questionId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'crs_responses',
          filter: `question_id=eq.${questionId}`,
        },
        () => {
          // Re-fetch distinct count on any change
          supabase
            .from('crs_responses')
            .select('user_id')
            .eq('question_id', questionId)
            .then(({ data }) => {
              if (!data) return
              const unique = new Set(data.map((r: { user_id: string }) => r.user_id))
              setCount(unique.size)
            })
        },
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
      setCount(0)
    }
  }, [questionId])

  return count
}

// ─── Results data hook ────────────────────────────────────────────────────────

function useResults(questionId: string | undefined, enabled: boolean) {
  const [responses, setResponses] = useState<CRSResponse[]>([])

  useEffect(() => {
    if (!questionId || !enabled) {
      setResponses([])
      return
    }

    supabase
      .from('crs_responses')
      .select('*')
      .eq('question_id', questionId)
      .then(({ data }) => {
        setResponses((data ?? []) as CRSResponse[])
      })
  }, [questionId, enabled])

  return responses
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildChartData(responses: CRSResponse[], optionCount: number): Record<string, number> {
  const labels = ['A', 'B', 'C', 'D', 'E'].slice(0, optionCount)
  const data: Record<string, number> = {}
  for (const label of labels) data[label] = 0
  for (const r of responses) {
    if (r.response in data) data[r.response] = (data[r.response] ?? 0) + 1
  }
  return data
}

// ─── SessionPage ──────────────────────────────────────────────────────────────

export default function SessionPage() {
  const { courseId, sessionId } = useParams<{ courseId: string; sessionId: string }>()
  const navigate = useNavigate()
  const { user, loading: authLoading } = useSession()
  const { question, isConnected } = useActiveQuestion(sessionId ?? '')
  const voteCount = useVoteCount(question?.id)
  const resultsEnabled = question?.status === 'CLOSED' && question.results_visible === true
  const responses = useResults(question?.id, resultsEnabled)

  // Track the student's own submitted answers per question
  const [myAnswers, setMyAnswers] = useState<Record<string, string>>({})
  const myAnswersRef = useRef(myAnswers)
  myAnswersRef.current = myAnswers

  // Wake lock: acquire on mount, release on unmount
  useEffect(() => {
    void acquireWakeLock()
    return () => {
      void releaseWakeLock()
    }
  }, [])

  // Track own answer for display in "waiting for results" state
  // Listen for changes to crs_responses from this user for this question
  useEffect(() => {
    if (!question?.id || !user?.id) return
    let cancelled = false

    supabase
      .from('crs_responses')
      .select('response')
      .eq('question_id', question.id)
      .eq('user_id', user.id)
      .order('submitted_at', { ascending: false })
      .then(({ data }) => {
        if (cancelled || !data || data.length === 0) return
        const answers = data.map((r: { response: string }) => r.response)
        setMyAnswers((prev) => ({ ...prev, [question.id]: answers.join(', ') }))
      })

    return () => { cancelled = true }
  }, [question?.id, user?.id])

  if (authLoading) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-gray-50">
        <p className="text-gray-500 text-sm">Loading…</p>
      </main>
    )
  }

  if (!user) {
    navigate('/')
    return null
  }

  const myAnswer = question ? myAnswers[question.id] : undefined

  // Compute chart data for closed + results_visible questions
  const isMCQ =
    question?.type === 'MCQ_SINGLE' || question?.type === 'MCQ_MULTI'
  const chartData =
    isMCQ && resultsEnabled
      ? buildChartData(responses, question?.option_count ?? 4)
      : null
  const chartTotal =
    chartData
      ? new Set(responses.map((r) => r.user_id)).size
      : 0

  return (
    <main className="min-h-screen bg-gray-50 flex flex-col">
      {/* Reconnecting banner */}
      <ReconnectingIndicator isConnected={isConnected} />

      {/* Header */}
      <header className="bg-white border-b border-gray-100 px-4 py-3 flex items-center gap-3 sticky top-0 z-10">
        <button
          onClick={() => navigate(`/courses/${courseId ?? ''}`)}
          aria-label="Back to course"
          className="text-gray-400 hover:text-gray-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h1 className="flex-1 text-base font-semibold text-gray-900">Live session</h1>
        {question?.status === 'ACTIVE' && (
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <span className="inline-block w-2 h-2 bg-green-500 rounded-full" aria-hidden="true" />
            <CountUpTimer startedAt={question.launched_at} running={true} />
          </div>
        )}
      </header>

      {/* Body */}
      <div className="flex-1 px-4 py-6 max-w-lg mx-auto w-full">

        {/* No question / PENDING */}
        {(!question || question.status === 'PENDING') && (
          <div className="flex flex-col items-center justify-center gap-4 py-16" aria-live="polite">
            <div
              className="w-10 h-10 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin"
              aria-hidden="true"
            />
            <p className="text-gray-500 text-base text-center">Waiting for next question…</p>
          </div>
        )}

        {/* ACTIVE */}
        {question?.status === 'ACTIVE' && (
          <div className="flex flex-col gap-6">
            <QuestionView question={question} userId={user.id} />

            {/* Live vote count — no denominator */}
            <p className="text-center text-sm text-gray-400" aria-live="polite" aria-atomic="true">
              {voteCount === 1 ? '1 voted' : `${voteCount} voted`}
            </p>
          </div>
        )}

        {/* CLOSED — results not yet visible */}
        {question?.status === 'CLOSED' && !question.results_visible && (
          <div className="flex flex-col items-center gap-4 py-12 text-center" aria-live="polite">
            <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center" aria-hidden="true">
              <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            {myAnswer ? (
              <p className="text-gray-700 text-base">
                You voted <span className="font-semibold text-blue-600">{myAnswer}</span>.
                Waiting for results…
              </p>
            ) : (
              <p className="text-gray-700 text-base">Response submitted. Waiting for results…</p>
            )}
            <div
              className="w-8 h-8 border-4 border-gray-200 border-t-gray-400 rounded-full animate-spin"
              aria-hidden="true"
            />
          </div>
        )}

        {/* CLOSED — results visible */}
        {question?.status === 'CLOSED' && question.results_visible && (
          <div className="flex flex-col gap-6" aria-live="polite">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-gray-900">
                Results — Q{question.sequence_number}
                {question.is_revote ? ' (Revote)' : ''}
              </h2>
              <span className="text-sm text-gray-400">
                {chartTotal === 1 ? '1 voted' : `${chartTotal} voted`}
              </span>
            </div>

            {/* MCQ bar chart */}
            {isMCQ && chartData && (
              <div className="bg-white rounded-xl px-4 py-5 shadow-sm border border-gray-100">
                <BarChart
                  data={chartData}
                  total={chartTotal}
                  highlightOption={myAnswer?.split(', ')[0]}
                />
              </div>
            )}

            {/* Free response list */}
            {question.type === 'FREE_RESPONSE' && (
              <ul className="flex flex-col gap-2" aria-label="Submitted responses">
                {responses.map((r) => (
                  <li
                    key={r.id}
                    className={[
                      'bg-white rounded-xl px-4 py-3 shadow-sm border text-sm text-gray-800',
                      r.user_id === user.id
                        ? 'border-blue-200 bg-blue-50'
                        : 'border-gray-100',
                    ].join(' ')}
                  >
                    {r.response}
                    {r.user_id === user.id && (
                      <span className="ml-2 text-xs text-blue-500 font-medium">(yours)</span>
                    )}
                  </li>
                ))}
                {responses.length === 0 && (
                  <li className="text-gray-400 text-sm text-center py-4">No responses yet.</li>
                )}
              </ul>
            )}

            {myAnswer && (
              <p className="text-center text-sm text-gray-500">
                Your answer: <span className="font-semibold text-blue-600">{myAnswer}</span>
              </p>
            )}
          </div>
        )}
      </div>
    </main>
  )
}
