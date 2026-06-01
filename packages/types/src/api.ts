export interface ValidateQRRequest {
  qr_token?: string     // UUID from QR code scan
  session_code?: string // 4-digit code typed manually
}

export interface ValidateQRResponse {
  success: boolean
  session_id?: string   // returned on success so client can navigate to session
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
