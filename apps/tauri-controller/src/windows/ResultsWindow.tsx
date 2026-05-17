import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { setResultsVisible } from '../lib/session'
import { BarChart } from '@crs/ui'
import type { CRSQuestion, CRSResponse } from '@crs/types'
import type { QuestionChangedEvent } from '@crs/types'
import { getCurrentWindow } from '@tauri-apps/api/window'

function buildDistribution(
  responses: CRSResponse[],
  optionCount: number,
): Record<string, number> {
  const labels = ['A', 'B', 'C', 'D', 'E'].slice(0, optionCount)
  const dist: Record<string, number> = {}
  for (const label of labels) {
    dist[label] = 0
  }
  for (const r of responses) {
    if (r.response in dist) {
      dist[r.response] = (dist[r.response] ?? 0) + 1
    }
  }
  return dist
}

interface QuestionData {
  question: CRSQuestion
  responses: CRSResponse[]
}

export function ResultsWindow() {
  const [currentData, setCurrentData] = useState<QuestionData | null>(null)
  const [parentData, setParentData] = useState<QuestionData | null>(null)
  const [error, setError] = useState<string | null>(null)

  // On mount, find the active/most-recent-closed question for whatever session is active.
  // We read it from Supabase (no sessionId passed — the results window is always for the
  // most recently active question visible to this instructor).
  useEffect(() => {
    async function loadLatestQuestion() {
      try {
        // Find the most recent ACTIVE or CLOSED question across all active sessions
        // (instructor is always using just one session at a time)
        const { data, error: fetchError } = await supabase
          .from('crs_questions')
          .select('*')
          .in('status', ['ACTIVE', 'CLOSED'])
          .order('launched_at', { ascending: false })
          .limit(1)
          .maybeSingle()

        if (fetchError) throw new Error(fetchError.message)
        if (!data) return

        const q = data as CRSQuestion
        await loadQuestionData(q)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load results')
      }
    }

    loadLatestQuestion()
  }, [])

  async function loadQuestionData(q: CRSQuestion) {
    const { data: respData, error: respError } = await supabase
      .from('crs_responses')
      .select('*')
      .eq('question_id', q.id)

    if (respError) throw new Error(respError.message)
    const responses = (respData ?? []) as CRSResponse[]

    setCurrentData({ question: q, responses })

    // Load parent question data if this is a revote
    if (q.is_revote && q.parent_question_id) {
      const { data: parentQ, error: parentErr } = await supabase
        .from('crs_questions')
        .select('*')
        .eq('id', q.parent_question_id)
        .single()

      if (parentErr) {
        console.error('Failed to load parent question:', parentErr.message)
        return
      }

      const { data: parentResp, error: parentRespErr } = await supabase
        .from('crs_responses')
        .select('*')
        .eq('question_id', q.parent_question_id)

      if (parentRespErr) {
        console.error('Failed to load parent responses:', parentRespErr.message)
        return
      }

      setParentData({
        question: parentQ as CRSQuestion,
        responses: (parentResp ?? []) as CRSResponse[],
      })
    } else {
      setParentData(null)
    }
  }

  // Subscribe to question changes to keep results live
  useEffect(() => {
    if (!currentData) return

    const { question } = currentData
    const channel = supabase
      .channel(`results-responses:${question.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'crs_responses',
          filter: `question_id=eq.${question.id}`,
        },
        (payload) => {
          const newResp = payload.new as CRSResponse
          setCurrentData((prev) => {
            if (!prev) return prev
            return { ...prev, responses: [...prev.responses, newResp] }
          })
        },
      )
      .subscribe()

    // Also subscribe to question updates (e.g. results_visible changes)
    const qChannel = supabase
      .channel(`results-question:${question.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'crs_questions',
          filter: `id=eq.${question.id}`,
        },
        (payload) => {
          const event = payload as unknown as QuestionChangedEvent
          const updated = event.new
          if (updated) {
            setCurrentData((prev) => {
              if (!prev) return prev
              return { ...prev, question: updated }
            })
          }
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
      supabase.removeChannel(qChannel)
    }
  }, [currentData?.question.id])

  // When this window closes, set results_visible = false
  useEffect(() => {
    let unlisten: (() => void) | undefined

    getCurrentWindow()
      .onCloseRequested(async () => {
        if (currentData?.question) {
          try {
            await setResultsVisible(currentData.question.id, false)
          } catch (err) {
            console.error('Failed to hide results on window close:', err)
          }
        }
      })
      .then((fn) => {
        unlisten = fn
      })
      .catch((err) => {
        console.error('Failed to register close handler:', err)
      })

    return () => {
      if (unlisten) unlisten()
    }
  }, [currentData?.question.id])

  if (error) {
    return (
      <main className="flex items-center justify-center min-h-screen bg-white px-4">
        <p role="alert" className="text-red-600 text-sm text-center">
          {error}
        </p>
      </main>
    )
  }

  if (!currentData) {
    return (
      <main className="flex items-center justify-center min-h-screen bg-white">
        <p className="text-gray-400 text-sm">Loading results…</p>
      </main>
    )
  }

  const { question, responses } = currentData
  const isMCQ = question.type !== 'FREE_RESPONSE'
  const optionCount = question.option_count ?? 5

  // Count unique respondents
  const respondentIds = new Set(responses.map((r) => r.user_id))
  const total = respondentIds.size

  const dist = isMCQ ? buildDistribution(responses, optionCount) : {}

  // Parent question data for side-by-side revote display
  const parentIsMCQ = parentData ? parentData.question.type !== 'FREE_RESPONSE' : false
  const parentDist =
    parentData && parentIsMCQ
      ? buildDistribution(parentData.responses, parentData.question.option_count ?? 5)
      : {}
  const parentTotal = parentData
    ? new Set(parentData.responses.map((r) => r.user_id)).size
    : 0

  // Free responses
  const freeResponses = responses.map((r) => r.response)
  const parentFreeResponses = parentData?.responses.map((r) => r.response) ?? []

  return (
    <main className="min-h-screen bg-white p-4">
      <header className="mb-4">
        <h1 className="text-lg font-bold text-gray-900">
          {question.type === 'MCQ_SINGLE'
            ? 'MCQ Single'
            : question.type === 'MCQ_MULTI'
              ? 'MCQ Multi'
              : 'Free Response'}
          {question.is_revote && (
            <span className="ml-2 text-sm font-normal text-gray-500">— Round 2</span>
          )}
        </h1>
        <p className="text-sm text-gray-500 mt-0.5" aria-live="polite">
          {total} responded
        </p>
      </header>

      {isMCQ ? (
        <div
          className={
            parentData && parentIsMCQ ? 'grid grid-cols-2 gap-6' : 'max-w-md'
          }
        >
          {parentData && parentIsMCQ && (
            <section>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
                Round 1
              </p>
              <BarChart data={parentDist} total={parentTotal} />
            </section>
          )}
          <section>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
              {parentData && parentIsMCQ ? 'Round 2' : 'Results'}
            </p>
            <BarChart data={dist} total={total} />
          </section>
        </div>
      ) : (
        <div className={parentData ? 'grid grid-cols-2 gap-6' : ''}>
          {parentData && !parentIsMCQ && (
            <section>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
                Round 1
              </p>
              <FreeResponseList responses={parentFreeResponses} />
            </section>
          )}
          <section>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
              {parentData ? 'Round 2' : 'Responses'}
            </p>
            <FreeResponseList responses={freeResponses} />
          </section>
        </div>
      )}
    </main>
  )
}

function FreeResponseList({ responses }: { responses: string[] }) {
  if (responses.length === 0) {
    return <p className="text-gray-400 text-sm">No responses yet.</p>
  }
  return (
    <ul className="space-y-2 max-h-96 overflow-y-auto" aria-label="Free responses">
      {responses.map((resp, i) => (
        <li
          key={i}
          className="text-sm text-gray-800 bg-gray-50 rounded-lg px-3 py-2 break-words"
        >
          {resp}
        </li>
      ))}
    </ul>
  )
}
