export interface ValidateQRRequest {
  qr_token?: string     // UUID from QR code scan
  session_code?: string // 6-digit code typed manually
}

export interface ValidateQRResponse {
  success: boolean
  session_id?: string   // returned on success so client can navigate to session
  course_id?: string    // course the session belongs to
  course_name?: string  // display name of the course
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
