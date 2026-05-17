export interface ValidateQRRequest {
  qr_token: string
  session_id: string
}

export interface ValidateQRResponse {
  success: boolean
  error?: string
}

export interface JoinCourseRequest {
  join_code: string
}

export interface JoinCourseResponse {
  course_id: string
  enrollment_id: string
  error?: string
}
