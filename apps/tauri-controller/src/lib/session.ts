import { supabase } from './supabase'
import type { CRSQuestion, CRSSession, Course, QuestionType } from '@crs/types'

export function generateQRToken(): string {
  return crypto.randomUUID()
}

// Generate a short random join code like "X7K2M"
export function generateJoinCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  return Array.from({ length: 5 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
}

export async function createCourse(
  name: string,
  defaultOptionCount: number,
  ownerId: string,
): Promise<Course> {
  const joinCode = generateJoinCode()
  const { data, error } = await supabase
    .from('courses')
    .insert({
      name,
      default_option_count: defaultOptionCount,
      owner_id: ownerId,
      join_code: joinCode,
    })
    .select()
    .single()

  if (error) throw new Error(`Failed to create course: ${error.message}`)
  if (!data) throw new Error('No data returned after creating course')
  return data as Course
}

export async function enrollInstructor(courseId: string, userId: string): Promise<void> {
  const { error } = await supabase.from('enrollments').insert({
    course_id: courseId,
    user_id: userId,
    role: 'INSTRUCTOR',
  })
  if (error) throw new Error(`Failed to enroll instructor: ${error.message}`)
}

// Generate a random 6-digit session code (100000–999999)
export function generateSessionCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000))
}

export async function startSession(courseId: string): Promise<CRSSession> {
  // Auto-close any open sessions for this course
  await supabase
    .from('crs_sessions')
    .update({ ended_at: new Date().toISOString() })
    .eq('course_id', courseId)
    .is('ended_at', null)

  const { data, error } = await supabase
    .from('crs_sessions')
    .insert({
      course_id: courseId,
      qr_token: generateQRToken(),
      session_code: generateSessionCode(),
    })
    .select()
    .single()

  if (error) throw new Error(`Failed to start session: ${error.message}`)
  if (!data) throw new Error('No data returned after starting session')
  return data as CRSSession
}

export async function reopenSession(sessionId: string): Promise<CRSSession> {
  const { data: row, error: fetchError } = await supabase
    .from('crs_sessions')
    .select('course_id')
    .eq('id', sessionId)
    .single()

  if (fetchError || !row) throw new Error('Session not found')

  await supabase
    .from('crs_sessions')
    .update({ ended_at: new Date().toISOString() })
    .eq('course_id', (row as { course_id: string }).course_id)
    .is('ended_at', null)
    .neq('id', sessionId)

  const { data, error } = await supabase
    .from('crs_sessions')
    .update({ ended_at: null })
    .eq('id', sessionId)
    .select()
    .single()

  if (error) throw new Error(`Failed to reopen session: ${error.message}`)
  if (!data) throw new Error('No data returned after reopening session')
  return data as CRSSession
}

export async function endSession(sessionId: string): Promise<void> {
  const { error } = await supabase
    .from('crs_sessions')
    .update({ ended_at: new Date().toISOString() })
    .eq('id', sessionId)

  if (error) throw new Error(`Failed to end session: ${error.message}`)
}

export async function getNextSequenceNumber(sessionId: string): Promise<number> {
  const { data, error } = await supabase
    .from('crs_questions')
    .select('sequence_number')
    .eq('session_id', sessionId)
    .order('sequence_number', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) throw new Error(`Failed to get sequence number: ${error.message}`)
  if (!data) return 1
  return (data as { sequence_number: number }).sequence_number + 1
}

export async function launchQuestion(
  sessionId: string,
  type: QuestionType,
  optionCount: number | null,
  multiAnswer: boolean,
): Promise<CRSQuestion> {
  const seq = await getNextSequenceNumber(sessionId)

  const { data, error } = await supabase
    .from('crs_questions')
    .insert({
      session_id: sessionId,
      sequence_number: seq,
      type,
      option_count: type === 'FREE_RESPONSE' ? null : optionCount,
      multi_answer: multiAnswer,
      status: 'ACTIVE',
      launched_at: new Date().toISOString(),
      results_visible: false,
    })
    .select()
    .single()

  if (error) throw new Error(`Failed to launch question: ${error.message}`)
  if (!data) throw new Error('No data returned after launching question')
  return data as CRSQuestion
}

export async function closeQuestion(questionId: string): Promise<void> {
  const { data: existing, error: fetchError } = await supabase
    .from('crs_questions')
    .select('launched_at')
    .eq('id', questionId)
    .single()

  if (fetchError) throw new Error(`Failed to fetch question for closing: ${fetchError.message}`)

  const launchedAt = (existing as { launched_at: string | null }).launched_at
  const closedAt = new Date()
  const durationSeconds =
    launchedAt ? Math.floor((closedAt.getTime() - new Date(launchedAt).getTime()) / 1000) : null

  const { error } = await supabase
    .from('crs_questions')
    .update({
      status: 'CLOSED',
      closed_at: closedAt.toISOString(),
      duration_seconds: durationSeconds,
    })
    .eq('id', questionId)

  if (error) throw new Error(`Failed to close question: ${error.message}`)
}

export async function setResultsVisible(questionId: string, visible: boolean): Promise<void> {
  const { error } = await supabase
    .from('crs_questions')
    .update({ results_visible: visible })
    .eq('id', questionId)

  if (error) throw new Error(`Failed to set results visibility: ${error.message}`)
}

export async function launchRevote(parent: CRSQuestion): Promise<CRSQuestion> {
  const seq = await getNextSequenceNumber(parent.session_id)

  const { data, error } = await supabase
    .from('crs_questions')
    .insert({
      session_id: parent.session_id,
      sequence_number: seq,
      type: parent.type,
      option_count: parent.option_count,
      multi_answer: parent.multi_answer,
      status: 'ACTIVE',
      launched_at: new Date().toISOString(),
      results_visible: false,
      is_revote: true,
      parent_question_id: parent.id,
    })
    .select()
    .single()

  if (error) throw new Error(`Failed to launch revote: ${error.message}`)
  if (!data) throw new Error('No data returned after launching revote')
  return data as CRSQuestion
}
