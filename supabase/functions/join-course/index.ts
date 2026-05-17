import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Types inlined — Deno edge functions can't resolve npm workspace packages
interface JoinCourseRequest {
  join_code: string
}

interface JoinCourseResponse {
  course_id: string
  enrollment_id: string
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
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')
    if (!supabaseUrl || !supabaseServiceKey || !supabaseAnonKey) {
      throw new Error('Missing Supabase environment variables')
    }

    // Authenticate the caller
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Not authenticated' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const anonClient = createClient(supabaseUrl, supabaseAnonKey)
    const { data: { user }, error: authError } = await anonClient.auth.getUser(
      authHeader.replace('Bearer ', '')
    )
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const body: JoinCourseRequest = await req.json()
    const { join_code } = body

    if (!join_code) {
      return new Response(
        JSON.stringify({ error: 'join_code is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Look up the course by join_code
    const { data: course, error: courseError } = await supabase
      .from('courses')
      .select('id')
      .eq('join_code', join_code.trim().toUpperCase())
      .single()

    if (courseError || !course) {
      return new Response(
        JSON.stringify({ error: 'Course not found. Check the join code and try again.' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Check the user isn't already enrolled (idempotent — return existing enrollment)
    const { data: existing } = await supabase
      .from('enrollments')
      .select('id')
      .eq('course_id', course.id)
      .eq('user_id', user.id)
      .single()

    if (existing) {
      return new Response(
        JSON.stringify({ course_id: course.id, enrollment_id: existing.id } satisfies JoinCourseResponse),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Create enrollment as STUDENT
    const { data: enrollment, error: enrollError } = await supabase
      .from('enrollments')
      .insert({ course_id: course.id, user_id: user.id, role: 'STUDENT' })
      .select('id')
      .single()

    if (enrollError || !enrollment) {
      console.error('Enrollment error:', enrollError)
      return new Response(
        JSON.stringify({ error: 'Failed to enroll. Please try again.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
      JSON.stringify({ course_id: course.id, enrollment_id: enrollment.id } satisfies JoinCourseResponse),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    console.error('join-course error:', err)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
