import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { BarChart, Button } from '@crs/ui'
import type { CRSQuestion, CRSResponse, CRSSession, SessionAttendance } from '@crs/types'
import { supabase } from '../lib/supabase'
import { exportFullResponseDetail, exportSessionSummary } from '../lib/exports'
import { SessionSummaryTable } from '../components/SessionSummaryTable'

// ---- types for joined data -----------------------------------------------

interface ResponseWithUser extends CRSResponse {
  users: { name: string; email: string } | null
}

interface AttendanceWithUser extends SessionAttendance {
  users: { name: string; email: string } | null
}

// ---- helpers ---------------------------------------------------------------

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

function formatDuration(started: string, ended: string | null): string {
  if (!ended) return 'In progress'
  const ms = new Date(ended).getTime() - new Date(started).getTime()
  const totalSeconds = Math.round(ms / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}m ${seconds}s`
}

function questionTypeLabel(type: CRSQuestion['type']): string {
  switch (type) {
    case 'MCQ_SINGLE': return 'MCQ Single'
    case 'MCQ_MULTI': return 'MCQ Multi'
    case 'FREE_RESPONSE': return 'Free Response'
  }
}

/** Build label → count map for MCQ responses on a single question */
function buildDistribution(
  responses: ResponseWithUser[],
  questionId: string,
  optionCount: number,
): Record<string, number> {
  const labels = 'ABCDE'.slice(0, optionCount).split('')
  const dist: Record<string, number> = {}
  for (const l of labels) dist[l] = 0
  for (const r of responses) {
    if (r.question_id !== questionId) continue
    // MCQ_MULTI may store comma-separated e.g. "A,C" — count each token
    for (const token of r.response.split(',')) {
      const t = token.trim().toUpperCase()
      if (t in dist) dist[t] = (dist[t] ?? 0) + 1
    }
  }
  return dist
}

/** COUNT DISTINCT user_id for a question */
function distinctRespondents(responses: ResponseWithUser[], questionId: string): number {
  const seen = new Set<string>()
  for (const r of responses) {
    if (r.question_id === questionId) seen.add(r.user_id)
  }
  return seen.size
}

// ---- component -------------------------------------------------------------

export function SessionDetailPage() {
  const { courseId, sessionId } = useParams<{ courseId: string; sessionId: string }>()

  const [session, setSession] = useState<CRSSession | null>(null)
  const [courseName, setCourseName] = useState<string>('')
  const [questions, setQuestions] = useState<CRSQuestion[]>([])
  const [responses, setResponses] = useState<ResponseWithUser[]>([])
  const [attendance, setAttendance] = useState<AttendanceWithUser[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [exportingSummary, setExportingSummary] = useState(false)
  const [exportingDetail, setExportingDetail] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)

  useEffect(() => {
    if (!sessionId || !courseId) return
    loadAll(sessionId, courseId)
  }, [sessionId, courseId])

  async function loadAll(sid: string, cid: string) {
    setLoading(true)
    setError(null)
    try {
      // Session
      const { data: sessionData, error: sessErr } = await supabase
        .from('crs_sessions')
        .select('*')
        .eq('id', sid)
        .single()
      if (sessErr) throw sessErr
      setSession(sessionData as CRSSession)

      // Course name
      const { data: courseData, error: courseErr } = await supabase
        .from('courses')
        .select('name')
        .eq('id', cid)
        .single()
      if (courseErr) throw courseErr
      setCourseName((courseData as { name: string }).name)

      // Questions ordered by sequence_number
      const { data: questionsData, error: questErr } = await supabase
        .from('crs_questions')
        .select('*')
        .eq('session_id', sid)
        .order('sequence_number', { ascending: true })
      if (questErr) throw questErr
      const qs = (questionsData ?? []) as CRSQuestion[]
      setQuestions(qs)

      const questionIds = qs.map((q) => q.id)

      // Responses with user info
      if (questionIds.length > 0) {
        const { data: responseData, error: respErr } = await supabase
          .from('crs_responses')
          .select('id, question_id, user_id, response, submitted_at, users(name, email)')
          .in('question_id', questionIds)
          .order('submitted_at', { ascending: true })
        if (respErr) throw respErr
        setResponses((responseData ?? []) as unknown as ResponseWithUser[])
      } else {
        setResponses([])
      }

      // Attendance with user info
      const { data: attData, error: attErr } = await supabase
        .from('session_attendance')
        .select('id, session_id, user_id, scanned_at, scan_token, users(name, email)')
        .eq('session_id', sid)
        .order('scanned_at', { ascending: true })
      if (attErr) throw attErr
      setAttendance((attData ?? []) as unknown as AttendanceWithUser[])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load session.')
    } finally {
      setLoading(false)
    }
  }

  async function handleExportSummary() {
    if (!sessionId) return
    setExportingSummary(true)
    setExportError(null)
    try {
      await exportSessionSummary(sessionId, courseName)
    } catch (err) {
      setExportError(err instanceof Error ? err.message : 'Export failed.')
    } finally {
      setExportingSummary(false)
    }
  }

  async function handleExportDetail() {
    if (!sessionId) return
    setExportingDetail(true)
    setExportError(null)
    try {
      await exportFullResponseDetail(sessionId, courseName)
    } catch (err) {
      setExportError(err instanceof Error ? err.message : 'Export failed.')
    } finally {
      setExportingDetail(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-gray-500">
        Loading…
      </div>
    )
  }

  if (error || !session) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p role="alert" className="text-red-600">
          {error ?? 'Session not found.'}
        </p>
      </div>
    )
  }

  // Build a quick lookup: questionId → distinct respondent count
  const responseCounts: Record<string, number> = {}
  for (const q of questions) {
    responseCounts[q.id] = distinctRespondents(responses, q.id)
  }

  // Build map: questionId → CRSQuestion (for revote lookup)
  const questionById = new Map<string, CRSQuestion>()
  for (const q of questions) questionById.set(q.id, q)

  const attendanceCount = new Set(attendance.map((a) => a.user_id)).size

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center gap-3 flex-wrap">
          <Link to="/courses" className="text-sm text-blue-600 hover:underline">
            ← Courses
          </Link>
          <span className="text-gray-300">/</span>
          <Link to={`/courses/${courseId}`} className="text-sm text-blue-600 hover:underline">
            {courseName}
          </Link>
          <span className="text-gray-300">/</span>
          <h1 className="text-sm font-semibold text-gray-700">
            Session {formatDateTime(session.started_at)}
          </h1>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8 flex flex-col gap-8">
        {/* Session meta */}
        <section aria-labelledby="session-meta-heading" className="bg-white border border-gray-200 rounded-xl p-6">
          <h2 id="session-meta-heading" className="sr-only">Session information</h2>
          <dl className="flex gap-8 flex-wrap">
            <div className="flex flex-col gap-0.5">
              <dt className="text-xs text-gray-500 font-medium uppercase tracking-wide">Started</dt>
              <dd className="text-gray-900 font-semibold">{formatDateTime(session.started_at)}</dd>
            </div>
            <div className="flex flex-col gap-0.5">
              <dt className="text-xs text-gray-500 font-medium uppercase tracking-wide">Duration</dt>
              <dd className="text-gray-900 font-semibold">
                {formatDuration(session.started_at, session.ended_at)}
              </dd>
            </div>
            <div className="flex flex-col gap-0.5">
              <dt className="text-xs text-gray-500 font-medium uppercase tracking-wide">Attendance</dt>
              <dd className="text-gray-900 font-semibold">{attendanceCount} scanned</dd>
            </div>
            <div className="flex flex-col gap-0.5">
              <dt className="text-xs text-gray-500 font-medium uppercase tracking-wide">Questions</dt>
              <dd className="text-gray-900 font-semibold">{questions.length}</dd>
            </div>
          </dl>
        </section>

        {/* Export buttons */}
        <div className="flex items-center gap-3 flex-wrap">
          <Button
            variant="secondary"
            size="sm"
            onClick={handleExportSummary}
            disabled={exportingSummary}
            aria-label="Export session summary CSV"
          >
            {exportingSummary ? 'Exporting…' : 'Export session summary CSV'}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={handleExportDetail}
            disabled={exportingDetail}
            aria-label="Export full response detail CSV"
          >
            {exportingDetail ? 'Exporting…' : 'Export full response detail CSV'}
          </Button>
          {exportError && (
            <p role="alert" className="text-sm text-red-600">
              {exportError}
            </p>
          )}
        </div>

        {/* Question summary table */}
        <section aria-labelledby="summary-table-heading" className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <h2 id="summary-table-heading" className="px-6 py-4 text-base font-semibold text-gray-900 border-b border-gray-100">
            Question summary
          </h2>
          <SessionSummaryTable questions={questions} responseCounts={responseCounts} />
        </section>

        {/* Per-question breakdown */}
        <section aria-labelledby="question-detail-heading">
          <h2 id="question-detail-heading" className="text-lg font-semibold text-gray-900 mb-4">
            Question detail
          </h2>
          <div className="flex flex-col gap-6">
            {questions.map((q) => {
              const respondentCount = responseCounts[q.id] ?? 0
              const parentQ = q.parent_question_id ? questionById.get(q.parent_question_id) : null

              // Find if this question has a revote child
              const revoteChild = questions.find(
                (child) => child.parent_question_id === q.id && child.is_revote,
              )

              return (
                <QuestionCard
                  key={q.id}
                  question={q}
                  respondentCount={respondentCount}
                  responses={responses}
                  parentQuestion={parentQ ?? null}
                  revoteChild={revoteChild ?? null}
                  allResponses={responses}
                />
              )
            })}
          </div>
        </section>

        {/* Attendance */}
        <section aria-labelledby="attendance-heading" className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <h2 id="attendance-heading" className="px-6 py-4 text-base font-semibold text-gray-900 border-b border-gray-100">
            Attendance ({attendanceCount} students)
          </h2>
          {attendance.length === 0 ? (
            <p className="px-6 py-4 text-sm text-gray-400">No attendance records for this session.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm" aria-label="Attendance list">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th scope="col" className="text-left px-4 py-3 font-medium text-gray-600">Name</th>
                    <th scope="col" className="text-left px-4 py-3 font-medium text-gray-600">Email</th>
                    <th scope="col" className="text-left px-4 py-3 font-medium text-gray-600">Scanned at</th>
                  </tr>
                </thead>
                <tbody>
                  {attendance.map((a) => (
                    <tr key={a.id} className="border-b border-gray-100 last:border-0">
                      <td className="px-4 py-3 text-gray-900">{a.users?.name ?? '—'}</td>
                      <td className="px-4 py-3 text-gray-500">{a.users?.email ?? '—'}</td>
                      <td className="px-4 py-3 text-gray-400 whitespace-nowrap">
                        {formatDateTime(a.scanned_at)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
    </div>
  )
}

// ---- QuestionCard ----------------------------------------------------------

interface QuestionCardProps {
  question: CRSQuestion
  respondentCount: number
  responses: ResponseWithUser[]
  parentQuestion: CRSQuestion | null
  revoteChild: CRSQuestion | null
  allResponses: ResponseWithUser[]
}

function QuestionCard({
  question,
  respondentCount,
  responses,
  parentQuestion,
  revoteChild,
  allResponses,
}: QuestionCardProps) {
  const isMCQ = question.type === 'MCQ_SINGLE' || question.type === 'MCQ_MULTI'
  const optionCount = question.option_count ?? 5

  // Build round-1 distribution for this question
  const round1Data = isMCQ ? buildDistribution(responses, question.id, optionCount) : null
  const round1Total = respondentCount

  // Build round-2 distribution if this question has a revote child
  const round2Data =
    isMCQ && revoteChild
      ? buildDistribution(allResponses, revoteChild.id, optionCount)
      : null
  const round2Total = revoteChild ? distinctRespondents(allResponses, revoteChild.id) : undefined

  // Free-response answers for this question only
  const freeResponses = responses.filter((r) => r.question_id === question.id)

  return (
    <article
      aria-labelledby={`q-heading-${question.id}`}
      className="bg-white border border-gray-200 rounded-xl overflow-hidden"
    >
      {/* Question header */}
      <header className="px-6 py-4 border-b border-gray-100 flex items-center gap-3 flex-wrap">
        <h3 id={`q-heading-${question.id}`} className="text-base font-semibold text-gray-900">
          #{question.sequence_number} — {questionTypeLabel(question.type)}
        </h3>
        {question.is_revote && (
          <span className="inline-block rounded-full bg-blue-100 text-blue-700 px-2 py-0.5 text-xs font-medium">
            Revote
          </span>
        )}
        {question.multi_answer && (
          <span className="inline-block rounded-full bg-purple-100 text-purple-700 px-2 py-0.5 text-xs font-medium">
            Multi-answer
          </span>
        )}
        {parentQuestion && (
          <span className="text-xs text-gray-400">
            (revote of #{parentQuestion.sequence_number})
          </span>
        )}
        <span className="ml-auto text-sm text-gray-500 font-medium">
          {respondentCount} responded
        </span>
      </header>

      <div className="px-6 py-5 flex flex-col gap-5">
        {/* Screenshot */}
        {question.screenshot_url && (
          <div>
            <a
              href={question.screenshot_url}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`Full-size screenshot for question ${question.sequence_number}`}
            >
              <img
                src={question.screenshot_url}
                alt={`Screenshot for question ${question.sequence_number}`}
                className="max-w-[200px] rounded border border-gray-200 hover:opacity-90 transition-opacity"
              />
            </a>
          </div>
        )}

        {/* MCQ bar chart */}
        {isMCQ && round1Data && (
          <div>
            {revoteChild ? (
              <div className="flex flex-col gap-1">
                <p className="text-xs text-gray-500 mb-2">
                  Round 1 (gray) vs Round 2 (blue) — side by side
                </p>
                <BarChart
                  data={round1Data}
                  total={round1Total}
                  round2Data={round2Data ?? undefined}
                  round2Total={round2Total}
                />
              </div>
            ) : (
              <BarChart data={round1Data} total={round1Total} />
            )}
          </div>
        )}

        {/* Free response table */}
        {question.type === 'FREE_RESPONSE' && (
          <div className="overflow-x-auto">
            {freeResponses.length === 0 ? (
              <p className="text-sm text-gray-400">No responses.</p>
            ) : (
              <table className="w-full text-sm" aria-label={`Free responses for question ${question.sequence_number}`}>
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th scope="col" className="text-left px-3 py-2 font-medium text-gray-600">Student</th>
                    <th scope="col" className="text-left px-3 py-2 font-medium text-gray-600">Response</th>
                    <th scope="col" className="text-left px-3 py-2 font-medium text-gray-600">Submitted</th>
                  </tr>
                </thead>
                <tbody>
                  {freeResponses.map((r) => (
                    <tr key={r.id} className="border-b border-gray-100 last:border-0">
                      <td className="px-3 py-2 text-gray-700 whitespace-nowrap">
                        {r.users?.name ?? r.users?.email ?? '—'}
                      </td>
                      <td className="px-3 py-2 text-gray-900">{r.response}</td>
                      <td className="px-3 py-2 text-gray-400 whitespace-nowrap">
                        {formatDateTime(r.submitted_at)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>
    </article>
  )
}
