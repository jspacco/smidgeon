import { supabase } from './supabase'
import type { CRSQuestion, CRSResponse, CRSSession, Enrollment, SessionAttendance, User } from '@crs/types'

// ---------------------------------------------------------------------------
// CSV helpers
// ---------------------------------------------------------------------------

function escapeCell(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined) return ''
  const str = String(value)
  // Wrap in double-quotes if the value contains commas, quotes, or newlines
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return '"' + str.replace(/"/g, '""') + '"'
  }
  return str
}

function buildCSV(headers: string[], rows: (string | number | boolean | null | undefined)[][]): string {
  const headerLine = headers.map(escapeCell).join(',')
  const dataLines = rows.map((row) => row.map(escapeCell).join(','))
  return [headerLine, ...dataLines].join('\r\n')
}

function downloadCSV(filename: string, csv: string): void {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

function formatDate(iso: string): string {
  return new Date(iso).toISOString().slice(0, 10)
}

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9_-]/g, '_')
}

// ---------------------------------------------------------------------------
// 1. Session summary — one row per student per session
// Columns: student_name, email, session_date, questions_active,
//          questions_answered, was_present, participation_pct
// ---------------------------------------------------------------------------

export async function exportSessionSummary(sessionId: string, courseName: string): Promise<void> {
  // Fetch session
  const { data: sessionData, error: sessionError } = await supabase
    .from('crs_sessions')
    .select('*')
    .eq('id', sessionId)
    .single()
  if (sessionError) throw sessionError
  const session = sessionData as CRSSession

  // Fetch all questions for this session
  const { data: questionsData, error: questionsError } = await supabase
    .from('crs_questions')
    .select('*')
    .eq('session_id', sessionId)
  if (questionsError) throw questionsError
  const questions = (questionsData ?? []) as CRSQuestion[]
  const questionIds = questions.map((q) => q.id)
  const questionsActive = questions.length

  // Fetch all responses for this session's questions
  let responses: (CRSResponse & { user_id: string })[] = []
  if (questionIds.length > 0) {
    const { data: responsesData, error: responsesError } = await supabase
      .from('crs_responses')
      .select('question_id, user_id')
      .in('question_id', questionIds)
    if (responsesError) throw responsesError
    responses = (responsesData ?? []) as (CRSResponse & { user_id: string })[]
  }

  // Fetch attendance
  const { data: attendanceData, error: attendanceError } = await supabase
    .from('session_attendance')
    .select('user_id')
    .eq('session_id', sessionId)
  if (attendanceError) throw attendanceError
  const attendanceUserIds = new Set((attendanceData ?? []).map((a: Pick<SessionAttendance, 'user_id'>) => a.user_id))

  // Fetch enrollments (students only) with user info
  const { data: enrollmentData, error: enrollmentError } = await supabase
    .from('enrollments')
    .select('user_id, users(id, name, email)')
    .eq('course_id', session.course_id)
    .eq('role', 'STUDENT')
  if (enrollmentError) throw enrollmentError

  interface EnrollmentWithUser {
    user_id: string
    users: { id: string; name: string; email: string } | null
  }

  const enrollments = (enrollmentData ?? []) as unknown as EnrollmentWithUser[]

  // Build per-student response counts: count distinct questions answered per student
  // "questions_answered" = number of distinct question_ids where this student has a response
  const studentQuestionsAnswered = new Map<string, Set<string>>()
  for (const r of responses) {
    let qs = studentQuestionsAnswered.get(r.user_id)
    if (!qs) {
      qs = new Set()
      studentQuestionsAnswered.set(r.user_id, qs)
    }
    qs.add(r.question_id)
  }

  const sessionDate = formatDate(session.started_at)

  const rows = enrollments.map(({ user_id, users }) => {
    const name = users?.name ?? ''
    const email = users?.email ?? ''
    const questionsAnswered = studentQuestionsAnswered.get(user_id)?.size ?? 0
    const wasPresent = attendanceUserIds.has(user_id)
    const participationPct =
      questionsActive > 0 ? Math.round((questionsAnswered / questionsActive) * 100) : 0

    return [
      name,
      email,
      sessionDate,
      questionsActive,
      questionsAnswered,
      wasPresent ? 'yes' : 'no',
      participationPct,
    ]
  })

  const csv = buildCSV(
    ['student_name', 'email', 'session_date', 'questions_active', 'questions_answered', 'was_present', 'participation_pct'],
    rows,
  )

  const filename = `session-summary_${sanitizeFilename(courseName)}_${sessionDate}.csv`
  downloadCSV(filename, csv)
}

// ---------------------------------------------------------------------------
// 2. Full response detail — one row per response
// Columns: student_name, email, session_date, question_sequence, question_type,
//          is_revote, parent_question_sequence, response, submitted_at,
//          duration_open_seconds
// ---------------------------------------------------------------------------

export async function exportFullResponseDetail(sessionId: string, courseName: string): Promise<void> {
  // Fetch session
  const { data: sessionData, error: sessionError } = await supabase
    .from('crs_sessions')
    .select('*')
    .eq('id', sessionId)
    .single()
  if (sessionError) throw sessionError
  const session = sessionData as CRSSession

  // Fetch all questions
  const { data: questionsData, error: questionsError } = await supabase
    .from('crs_questions')
    .select('*')
    .eq('session_id', sessionId)
    .order('sequence_number', { ascending: true })
  if (questionsError) throw questionsError
  const questions = (questionsData ?? []) as CRSQuestion[]
  const questionIds = questions.map((q) => q.id)

  // Build lookup maps
  const questionById = new Map<string, CRSQuestion>()
  for (const q of questions) {
    questionById.set(q.id, q)
  }

  // Fetch responses with user info
  let responseRows: Array<{
    id: string
    question_id: string
    user_id: string
    response: string
    submitted_at: string
    users: { name: string; email: string } | null
  }> = []

  if (questionIds.length > 0) {
    const { data: responsesData, error: responsesError } = await supabase
      .from('crs_responses')
      .select('id, question_id, user_id, response, submitted_at, users(name, email)')
      .in('question_id', questionIds)
      .order('submitted_at', { ascending: true })
    if (responsesError) throw responsesError
    responseRows = (responsesData ?? []) as unknown as typeof responseRows
  }

  const sessionDate = formatDate(session.started_at)

  const rows = responseRows.map((r) => {
    const question = questionById.get(r.question_id)
    const parentQuestion = question?.parent_question_id
      ? questionById.get(question.parent_question_id)
      : null

    return [
      r.users?.name ?? '',
      r.users?.email ?? '',
      sessionDate,
      question?.sequence_number ?? '',
      question?.type ?? '',
      question?.is_revote ? 'yes' : 'no',
      parentQuestion?.sequence_number ?? '',
      r.response,
      r.submitted_at,
      question?.duration_seconds ?? '',
    ]
  })

  const csv = buildCSV(
    [
      'student_name',
      'email',
      'session_date',
      'question_sequence',
      'question_type',
      'is_revote',
      'parent_question_sequence',
      'response',
      'submitted_at',
      'duration_open_seconds',
    ],
    rows,
  )

  const filename = `response-detail_${sanitizeFilename(courseName)}_${sessionDate}.csv`
  downloadCSV(filename, csv)
}

// ---------------------------------------------------------------------------
// 3. Course summary — one row per student for the whole term
// Columns: student_name, email, sessions_attended, sessions_total,
//          total_questions, total_answered, overall_participation_pct
// ---------------------------------------------------------------------------

export async function exportCourseSummary(courseId: string, courseName: string): Promise<void> {
  // Fetch all sessions for this course
  const { data: sessionsData, error: sessionsError } = await supabase
    .from('crs_sessions')
    .select('id, started_at')
    .eq('course_id', courseId)
    .order('started_at', { ascending: true })
  if (sessionsError) throw sessionsError
  const sessions = (sessionsData ?? []) as Pick<CRSSession, 'id' | 'started_at'>[]
  const sessionIds = sessions.map((s) => s.id)
  const sessionsTotal = sessions.length

  // Fetch enrollments (students only) with user info
  const { data: enrollmentData, error: enrollmentError } = await supabase
    .from('enrollments')
    .select('user_id, users(id, name, email)')
    .eq('course_id', courseId)
    .eq('role', 'STUDENT')
  if (enrollmentError) throw enrollmentError

  interface EnrollmentWithUser {
    user_id: string
    users: { id: string; name: string; email: string } | null
  }
  const enrollments = (enrollmentData ?? []) as unknown as EnrollmentWithUser[]

  if (sessionIds.length === 0) {
    // No sessions — export just the student list with zeros
    const rows = enrollments.map(({ users }) => [
      users?.name ?? '',
      users?.email ?? '',
      0,
      0,
      0,
      0,
      0,
    ])
    const csv = buildCSV(
      ['student_name', 'email', 'sessions_attended', 'sessions_total', 'total_questions', 'total_answered', 'overall_participation_pct'],
      rows,
    )
    downloadCSV(`course-summary_${sanitizeFilename(courseName)}.csv`, csv)
    return
  }

  // Fetch all questions across all sessions
  const { data: questionsData, error: questionsError } = await supabase
    .from('crs_questions')
    .select('id, session_id')
    .in('session_id', sessionIds)
  if (questionsError) throw questionsError
  const questions = (questionsData ?? []) as Pick<CRSQuestion, 'id' | 'session_id'>[]
  const questionIds = questions.map((q) => q.id)

  // Count questions per session
  const questionsPerSession = new Map<string, number>()
  for (const q of questions) {
    questionsPerSession.set(q.session_id, (questionsPerSession.get(q.session_id) ?? 0) + 1)
  }
  const totalQuestionsAllSessions = questions.length

  // Fetch attendance across all sessions
  let attendanceRows: Pick<SessionAttendance, 'session_id' | 'user_id'>[] = []
  if (sessionIds.length > 0) {
    const { data: attendanceData, error: attendanceError } = await supabase
      .from('session_attendance')
      .select('session_id, user_id')
      .in('session_id', sessionIds)
    if (attendanceError) throw attendanceError
    attendanceRows = (attendanceData ?? []) as Pick<SessionAttendance, 'session_id' | 'user_id'>[]
  }

  // sessions_attended per student = distinct session_ids where they have attendance
  const studentAttendedSessions = new Map<string, Set<string>>()
  for (const a of attendanceRows) {
    let s = studentAttendedSessions.get(a.user_id)
    if (!s) {
      s = new Set()
      studentAttendedSessions.set(a.user_id, s)
    }
    s.add(a.session_id)
  }

  // Fetch responses across all questions — distinct question_id per student
  let responseRows: { question_id: string; user_id: string }[] = []
  if (questionIds.length > 0) {
    const { data: responsesData, error: responsesError } = await supabase
      .from('crs_responses')
      .select('question_id, user_id')
      .in('question_id', questionIds)
    if (responsesError) throw responsesError
    responseRows = (responsesData ?? []) as { question_id: string; user_id: string }[]
  }

  // total_answered per student = COUNT(DISTINCT question_id)
  const studentAnsweredQuestions = new Map<string, Set<string>>()
  for (const r of responseRows) {
    let qs = studentAnsweredQuestions.get(r.user_id)
    if (!qs) {
      qs = new Set()
      studentAnsweredQuestions.set(r.user_id, qs)
    }
    qs.add(r.question_id)
  }

  const rows = enrollments.map(({ user_id, users }) => {
    const sessionsAttended = studentAttendedSessions.get(user_id)?.size ?? 0
    const totalAnswered = studentAnsweredQuestions.get(user_id)?.size ?? 0
    const overallParticipationPct =
      totalQuestionsAllSessions > 0
        ? Math.round((totalAnswered / totalQuestionsAllSessions) * 100)
        : 0

    return [
      users?.name ?? '',
      users?.email ?? '',
      sessionsAttended,
      sessionsTotal,
      totalQuestionsAllSessions,
      totalAnswered,
      overallParticipationPct,
    ]
  })

  const csv = buildCSV(
    [
      'student_name',
      'email',
      'sessions_attended',
      'sessions_total',
      'total_questions',
      'total_answered',
      'overall_participation_pct',
    ],
    rows,
  )

  downloadCSV(`course-summary_${sanitizeFilename(courseName)}.csv`, csv)
}
