import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Types inlined — Deno edge functions can't resolve npm workspace packages
interface ValidateQRRequest {
  qr_token: string
  session_id: string
}

interface ValidateQRResponse {
  success: boolean
  error?: string
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Missing Supabase environment variables')
    }

    // Use service role to bypass RLS for attendance write
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Get the authenticated user from the JWT in the Authorization header
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: 'Not authenticated' } satisfies ValidateQRResponse),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const anonClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY') ?? '')
    const { data: { user }, error: authError } = await anonClient.auth.getUser(
      authHeader.replace('Bearer ', '')
    )
    if (authError || !user) {
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid token' } satisfies ValidateQRResponse),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const body: ValidateQRRequest = await req.json()
    const { qr_token, session_id } = body

    if (!qr_token || !session_id) {
      return new Response(
        JSON.stringify({ success: false, error: 'qr_token and session_id are required' } satisfies ValidateQRResponse),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Verify the session exists, is active, and the qr_token matches
    const { data: session, error: sessionError } = await supabase
      .from('crs_sessions')
      .select('id, qr_token, ended_at')
      .eq('id', session_id)
      .single()

    if (sessionError || !session) {
      return new Response(
        JSON.stringify({ success: false, error: 'Session not found' } satisfies ValidateQRResponse),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (session.ended_at !== null) {
      return new Response(
        JSON.stringify({ success: false, error: 'Session has ended' } satisfies ValidateQRResponse),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (session.qr_token !== qr_token) {
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid QR code' } satisfies ValidateQRResponse),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Write attendance — UNIQUE (session_id, user_id) so duplicate scans are safe
    const { error: attendanceError } = await supabase
      .from('session_attendance')
      .upsert(
        { session_id, user_id: user.id, scan_token: qr_token },
        { onConflict: 'session_id,user_id' }
      )

    if (attendanceError) {
      console.error('Attendance write error:', attendanceError)
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to record attendance' } satisfies ValidateQRResponse),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
      JSON.stringify({ success: true } satisfies ValidateQRResponse),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    console.error('validate-qr error:', err)
    return new Response(
      JSON.stringify({ success: false, error: 'Internal server error' } satisfies ValidateQRResponse),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
