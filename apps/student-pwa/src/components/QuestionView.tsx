import { useEffect, useState } from 'react'
import type { CRSQuestion } from '@crs/types'
import { Button } from '@crs/ui'
import { supabase } from '../lib/supabase'

interface QuestionViewProps {
  question: CRSQuestion
  userId: string
}

const OPTION_LABELS = ['A', 'B', 'C', 'D', 'E'] as const

// ─── MCQ Single ──────────────────────────────────────────────────────────────

function MCQSingleView({ question, userId }: QuestionViewProps) {
  const [selected, setSelected] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const optionCount = question.option_count ?? 4
  const options = OPTION_LABELS.slice(0, optionCount)

  // Load any existing answer for this question on mount
  useEffect(() => {
    let cancelled = false
    supabase
      .from('crs_responses')
      .select('response')
      .eq('question_id', question.id)
      .eq('user_id', userId)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled && data) setSelected(data.response as string)
      })
    return () => { cancelled = true }
  }, [question.id, userId])

  async function handleSelect(option: string) {
    if (submitting) return
    setSubmitError(null)
    setSubmitting(true)
    try {
      const { data: existing } = await supabase
        .from('crs_responses')
        .select('id')
        .eq('question_id', question.id)
        .eq('user_id', userId)
        .maybeSingle()

      if (existing) {
        const { error } = await supabase
          .from('crs_responses')
          .update({ response: option })
          .eq('id', existing.id as string)
        if (error) throw error
      } else {
        const { error } = await supabase
          .from('crs_responses')
          .insert({ question_id: question.id, user_id: userId, response: option })
        if (error) throw error
      }
      setSelected(option)
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Something went wrong, please refresh')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-gray-500 mb-1">Select one answer</p>
      <ul className="flex flex-col gap-2" role="list">
        {options.map((opt) => {
          const isSelected = selected === opt
          return (
            <li key={opt}>
              <button
                onClick={() => void handleSelect(opt)}
                disabled={submitting}
                aria-pressed={isSelected}
                className={[
                  'w-full text-left rounded-xl px-4 py-3 text-base font-medium border-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500',
                  isSelected
                    ? 'bg-blue-600 border-blue-600 text-white'
                    : 'bg-white border-gray-200 text-gray-900 hover:border-blue-400',
                  submitting ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer',
                ].join(' ')}
              >
                {opt}
              </button>
            </li>
          )
        })}
      </ul>
      {submitError && (
        <p role="alert" className="text-red-600 text-sm mt-1">
          {submitError}
        </p>
      )}
      {selected && (
        <p className="text-sm text-gray-500 text-center">
          You selected <span className="font-semibold text-blue-600">{selected}</span>.
          Tap another to change.
        </p>
      )}
    </div>
  )
}

// ─── MCQ Multi ───────────────────────────────────────────────────────────────

function MCQMultiView({ question, userId }: QuestionViewProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [submitted, setSubmitted] = useState(false)

  const optionCount = question.option_count ?? 4
  const options = OPTION_LABELS.slice(0, optionCount)

  // Load any existing answers on mount
  useEffect(() => {
    let cancelled = false
    supabase
      .from('crs_responses')
      .select('response')
      .eq('question_id', question.id)
      .eq('user_id', userId)
      .then(({ data }) => {
        if (!cancelled && data && data.length > 0) {
          setSelected(new Set(data.map((r: { response: string }) => r.response)))
          setSubmitted(true)
        }
      })
    return () => { cancelled = true }
  }, [question.id, userId])

  function toggleOption(opt: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(opt)) {
        next.delete(opt)
      } else {
        next.add(opt)
      }
      return next
    })
    setSubmitted(false)
  }

  async function handleSubmit() {
    if (submitting || selected.size === 0) return
    setSubmitError(null)
    setSubmitting(true)
    try {
      // Delete all existing responses for this question+user, then insert fresh selections
      const { error: deleteError } = await supabase
        .from('crs_responses')
        .delete()
        .eq('question_id', question.id)
        .eq('user_id', userId)
      if (deleteError) throw deleteError

      const rows = Array.from(selected).map((opt) => ({
        question_id: question.id,
        user_id: userId,
        response: opt,
      }))
      const { error: insertError } = await supabase.from('crs_responses').insert(rows)
      if (insertError) throw insertError

      setSubmitted(true)
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Something went wrong, please refresh')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-gray-500 mb-1">Select all that apply</p>
      <ul className="flex flex-col gap-2" role="list">
        {options.map((opt) => {
          const isSelected = selected.has(opt)
          return (
            <li key={opt}>
              <label
                className={[
                  'flex items-center gap-3 w-full rounded-xl px-4 py-3 border-2 transition-colors cursor-pointer focus-within:ring-2 focus-within:ring-blue-500',
                  isSelected
                    ? 'bg-blue-600 border-blue-600 text-white'
                    : 'bg-white border-gray-200 text-gray-900 hover:border-blue-400',
                  submitting ? 'opacity-60 cursor-not-allowed' : '',
                ].join(' ')}
              >
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => toggleOption(opt)}
                  disabled={submitting}
                  className="sr-only"
                  aria-label={`Option ${opt}`}
                />
                <span
                  className={[
                    'w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0',
                    isSelected ? 'bg-white border-white' : 'border-gray-300',
                  ].join(' ')}
                  aria-hidden="true"
                >
                  {isSelected && (
                    <svg className="w-3 h-3 text-blue-600" fill="currentColor" viewBox="0 0 12 12">
                      <path d="M10 3L5 8.5 2 5.5 1 6.5l4 4 6-7z" />
                    </svg>
                  )}
                </span>
                <span className="text-base font-medium">{opt}</span>
              </label>
            </li>
          )
        })}
      </ul>

      {submitError && (
        <p role="alert" className="text-red-600 text-sm">
          {submitError}
        </p>
      )}

      <Button
        onClick={() => void handleSubmit()}
        disabled={submitting || selected.size === 0}
        className="w-full mt-1"
      >
        {submitting ? 'Submitting…' : submitted ? 'Update selection' : 'Submit'}
      </Button>

      {submitted && (
        <p className="text-sm text-gray-500 text-center">
          Submitted: <span className="font-semibold text-blue-600">{Array.from(selected).sort().join(', ')}</span>.
          Change selections and submit again to update.
        </p>
      )}
    </div>
  )
}

// ─── Free Response ────────────────────────────────────────────────────────────

function FreeResponseView({ question, userId }: QuestionViewProps) {
  const [text, setText] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [submittedAnswers, setSubmittedAnswers] = useState<string[]>([])

  // Load existing responses on mount
  useEffect(() => {
    let cancelled = false
    supabase
      .from('crs_responses')
      .select('response')
      .eq('question_id', question.id)
      .eq('user_id', userId)
      .order('submitted_at', { ascending: true })
      .then(({ data }) => {
        if (!cancelled && data && data.length > 0) {
          setSubmittedAnswers(data.map((r: { response: string }) => r.response))
        }
      })
    return () => { cancelled = true }
  }, [question.id, userId])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = text.trim()
    if (!trimmed || submitting) return

    setSubmitError(null)
    setSubmitting(true)
    try {
      if (question.multi_answer) {
        // Each submit is a new row
        const { error } = await supabase
          .from('crs_responses')
          .insert({ question_id: question.id, user_id: userId, response: trimmed })
        if (error) throw error
        setSubmittedAnswers((prev) => [...prev, trimmed])
      } else {
        // Single answer: delete old row, insert new
        const { error: deleteError } = await supabase
          .from('crs_responses')
          .delete()
          .eq('question_id', question.id)
          .eq('user_id', userId)
        if (deleteError) throw deleteError

        const { error: insertError } = await supabase
          .from('crs_responses')
          .insert({ question_id: question.id, user_id: userId, response: trimmed })
        if (insertError) throw insertError

        setSubmittedAnswers([trimmed])
      }
      setText('')
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Something went wrong, please refresh')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-gray-500 mb-1">
        {question.multi_answer ? 'You may submit multiple responses' : 'Type your response'}
      </p>

      {submittedAnswers.length > 0 && (
        <ul className="flex flex-col gap-1 mb-1" aria-label="Your submitted responses">
          {submittedAnswers.map((ans, i) => (
            <li key={i} className="text-sm text-gray-700 bg-blue-50 rounded-lg px-3 py-2">
              {ans}
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={(e) => void handleSubmit(e)} className="flex flex-col gap-2">
        <label htmlFor="free-response-input" className="sr-only">
          Your response
        </label>
        <textarea
          id="free-response-input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={3}
          placeholder="Type your answer…"
          disabled={submitting}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none disabled:opacity-60"
        />

        {submitError && (
          <p role="alert" className="text-red-600 text-sm">
            {submitError}
          </p>
        )}

        <Button
          type="submit"
          disabled={submitting || !text.trim()}
          className="w-full"
        >
          {submitting
            ? 'Submitting…'
            : question.multi_answer && submittedAnswers.length > 0
              ? 'Add another response'
              : submittedAnswers.length > 0
                ? 'Update response'
                : 'Submit'}
        </Button>
      </form>
    </div>
  )
}

// ─── Main export ─────────────────────────────────────────────────────────────

export function QuestionView({ question, userId }: QuestionViewProps) {
  return (
    <section aria-labelledby="question-label" className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
          Question {question.sequence_number}
          {question.is_revote && ' (Revote)'}
        </span>
      </div>

      {question.screenshot_url && (
        <img
          src={question.screenshot_url}
          alt={`Question ${question.sequence_number} screenshot`}
          className="w-full rounded-xl object-contain max-h-64 bg-gray-100"
        />
      )}

      <div id="question-label" aria-label={`Question type: ${question.type}`} />

      {question.type === 'MCQ_SINGLE' && (
        <MCQSingleView question={question} userId={userId} />
      )}
      {question.type === 'MCQ_MULTI' && (
        <MCQMultiView question={question} userId={userId} />
      )}
      {question.type === 'FREE_RESPONSE' && (
        <FreeResponseView question={question} userId={userId} />
      )}
    </section>
  )
}
