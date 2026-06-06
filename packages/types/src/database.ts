export type QuestionType = 'MCQ_SINGLE' | 'MCQ_MULTI' | 'FREE_RESPONSE'
export type QuestionStatus = 'PENDING' | 'ACTIVE' | 'CLOSED'
export type EnrollmentRole = 'INSTRUCTOR' | 'TA' | 'STUDENT'

export interface User {
  id: string
  email: string
  name: string
  theme: string
  accent: string
  created_at: string
}

export interface Course {
  id: string
  name: string
  owner_id: string
  join_code: string
  default_option_count: number
  default_multi_answer: boolean
  created_at: string
  institution_id: string | null
  academic_year_term_id: string | null
  archived_at: string | null
}

export interface Enrollment {
  id: string
  course_id: string
  user_id: string
  role: EnrollmentRole
  enrolled_at: string
}

export interface CRSSession {
  id: string
  course_id: string
  started_at: string
  ended_at: string | null
  qr_token: string
  session_code: string
}

export interface CRSQuestion {
  id: string
  session_id: string
  sequence_number: number
  type: QuestionType
  option_count: number | null
  multi_answer: boolean
  status: QuestionStatus
  results_visible: boolean
  parent_question_id: string | null
  is_revote: boolean
  duration_seconds: number | null
  launched_at: string | null
  closed_at: string | null
  screenshot_url: string | null
}

export interface CRSResponse {
  id: string
  question_id: string
  user_id: string
  response: string
  submitted_at: string
}

export interface SessionAttendance {
  id: string
  session_id: string
  user_id: string
  scanned_at: string
  scan_token: string
  method: 'QR' | 'CODE' | null
}

export interface CourseInvitation {
  id: string
  course_id: string
  email: string
  role: 'INSTRUCTOR' | 'TA'
  invited_by: string
  created_at: string
}
