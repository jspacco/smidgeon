import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Types inlined — Deno edge functions can't resolve npm workspace packages

interface ValidateQRRequest {
  qr_token?: string     // UUID from QR scan
  session_code?: string // 6-digit code typed manually
}

interface ValidateQRResponse {
  success: boolean
  session_id?: string
  course_id?: string
  course_name?: string
  error?: string
}

interface SessionRow {
  id: string
  course_id: string
  qr_token: string
  session_code: string
  ended_at: string | null
}

interface CourseRow {
  id: string
  name: string
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(body: ValidateQRResponse, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')
    if (!supabaseUrl || !supabaseServiceKey || !supabaseAnonKey) {
      throw new Error('Missing Supabase environment variables')
    }

    // Authenticate the student
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return json({ success: false, error: 'Not authenticated' }, 401)
    }

    const anonClient = createClient(supabaseUrl, supabaseAnonKey)
    const { data: { user }, error: authError } = await anonClient.auth.getUser(
      authHeader.replace('Bearer ', '')
    )
    if (authError || !user) {
      return json({ success: false, error: 'Invalid token' }, 401)
    }

    // Use service role for all DB writes (bypasses RLS for attendance + enrollment)
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    const body: ValidateQRRequest = await req.json()
    const { qr_token, session_code } = body

    if (!qr_token && !session_code) {
      return json({ success: false, error: 'qr_token or session_code is required' }, 400)
    }

    // Determine entry method and find the session
    const method: 'QR' | 'CODE' = qr_token ? 'QR' : 'CODE'
    const scan_token = (qr_token ?? session_code) as string

    let session: SessionRow | null = null

    if (qr_token) {
      // QR path: look up by qr_token (globally unique)
      const { data, error } = await supabase
        .from('crs_sessions')
        .select('id, course_id, qr_token, session_code, ended_at')
        .eq('qr_token', qr_token)
        .maybeSingle()

      if (error) {
        console.error('Session lookup error:', error)
        return json({ success: false, error: 'Failed to look up session' }, 500)
      }
      session = data as SessionRow | null
      if (!session) {
        return json({ success: false, error: 'Invalid QR code' }, 400)
      }
    } else {
      // Code path: look up active session by 6-digit session_code
      const { data, error } = await supabase
        .from('crs_sessions')
        .select('id, course_id, qr_token, session_code, ended_at')
        .eq('session_code', session_code)
        .is('ended_at', null)
        .maybeSingle()

      if (error) {
        console.error('Session lookup error:', error)
        return json({ success: false, error: 'Failed to look up session' }, 500)
      }
      session = data as SessionRow | null
      if (!session) {
        return json({ success: false, error: 'Invalid session code' }, 400)
      }
    }

    // Gate: session must be active
    if (session.ended_at !== null) {
      return json({ success: false, error: 'Session has ended' }, 400)
    }

    // Fetch course info
    const { data: courseData, error: courseError } = await supabase
      .from('courses')
      .select('id, name')
      .eq('id', session.course_id)
      .single()

    if (courseError || !courseData) {
      console.error('Course lookup error:', courseError)
      return json({ success: false, error: 'Failed to look up course' }, 500)
    }
    const course = courseData as CourseRow

    // Auto-enroll student in course if not already enrolled (role: STUDENT)
    const { error: enrollError } = await supabase
      .from('enrollments')
      .upsert(
        {
          course_id: session.course_id,
          user_id: user.id,
          role: 'STUDENT',
        },
        { onConflict: 'course_id,user_id', ignoreDuplicates: true }
      )

    if (enrollError) {
      // Log but don't fail — attendance is the critical write
      console.error('Auto-enrollment error:', enrollError)
    }

    // Write attendance — UNIQUE (session_id, user_id) makes duplicate scans safe
    const { error: attendanceError } = await supabase
      .from('session_attendance')
      .upsert(
        {
          session_id: session.id,
          user_id: user.id,
          scan_token,
          method,
        },
        { onConflict: 'session_id,user_id' }
      )

    if (attendanceError) {
      console.error('Attendance write error:', attendanceError)
      return json({ success: false, error: 'Failed to record attendance' }, 500)
    }

    return json({
      success: true,
      session_id: session.id,
      course_id: course.id,
      course_name: course.name,
    })
  } catch (err) {
    console.error('validate-qr error:', err)
    return json({ success: false, error: 'Internal server error' }, 500)
  }
})
