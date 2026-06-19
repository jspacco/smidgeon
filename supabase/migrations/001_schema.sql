-- ============================================================
-- 001_schema.sql — Complete schema for a fresh Smidgeon instance
--
-- Consolidated from migrations 001–010. Designed to be applied
-- once to an empty database (self-hosting, local dev, CI).
--
-- Sections:
--   1. Tables
--   2. Indexes
--   3. Role grants
--   4. Helper functions and auth trigger
--   5. RLS policies
--   6. Realtime
--   7. Storage
--   8. Faculty whitelist + Before User Created auth hook
--
-- MANUAL DASHBOARD STEP REQUIRED after applying this migration:
--   Authentication > Hooks > Before User Created
--   → select hook_restrict_signup_to_whitelist
--   Until that step is done, signups are unrestricted.
-- ============================================================


-- ============================================================
-- 1. TABLES
-- ============================================================

-- Users (mirrors Supabase Auth; row created automatically via trigger below)
CREATE TABLE public.users (
  id                    uuid        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email                 text        NOT NULL,
  name                  text        NOT NULL,
  theme                 text        NOT NULL DEFAULT 'clean' CHECK (theme IN ('clean', 'terminal')),
  accent                text        NOT NULL DEFAULT '#06B6D4',
  default_option_count  integer     NOT NULL DEFAULT 5,
  default_multi_answer  boolean     NOT NULL DEFAULT true,
  default_screenshots_on boolean    NOT NULL DEFAULT false,
  created_at            timestamptz DEFAULT now()
);
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- Courses
CREATE TABLE public.courses (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name                  text        NOT NULL,
  owner_id              uuid        NOT NULL REFERENCES public.users(id),
  join_code             text        NOT NULL UNIQUE,
  default_option_count  integer     NOT NULL DEFAULT 5,
  default_multi_answer  boolean     NOT NULL DEFAULT true,
  default_screenshots_on boolean    NOT NULL DEFAULT false,
  archived_at           timestamptz DEFAULT NULL,
  created_at            timestamptz DEFAULT now(),
  institution_id        uuid,
  academic_year_term_id uuid
);
ALTER TABLE public.courses ENABLE ROW LEVEL SECURITY;

-- Enrollments
CREATE TABLE public.enrollments (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id   uuid        NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  user_id     uuid        NOT NULL REFERENCES public.users(id)   ON DELETE CASCADE,
  role        text        NOT NULL CHECK (role IN ('INSTRUCTOR', 'TA', 'STUDENT')),
  enrolled_at timestamptz DEFAULT now(),
  UNIQUE (course_id, user_id)
);
ALTER TABLE public.enrollments ENABLE ROW LEVEL SECURITY;

-- Course invitations — pre-invite INSTRUCTOR/TA before they first log in
CREATE TABLE public.course_invitations (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id   uuid        NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  email       text        NOT NULL,
  role        text        NOT NULL CHECK (role IN ('INSTRUCTOR', 'TA')),
  invited_by  uuid        NOT NULL REFERENCES public.users(id),
  created_at  timestamptz DEFAULT now(),
  UNIQUE (course_id, email)
);
ALTER TABLE public.course_invitations ENABLE ROW LEVEL SECURITY;

-- CRS Sessions
CREATE TABLE public.crs_sessions (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id    uuid        NOT NULL REFERENCES public.courses(id),
  started_at   timestamptz DEFAULT now(),
  ended_at     timestamptz,
  qr_token     text        NOT NULL UNIQUE,
  session_code text        NOT NULL UNIQUE  -- 6-digit numeric code (100000–999999)
);
ALTER TABLE public.crs_sessions ENABLE ROW LEVEL SECURITY;

-- CRS Questions
CREATE TABLE public.crs_questions (
  id                 uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id         uuid    NOT NULL REFERENCES public.crs_sessions(id),
  sequence_number    integer NOT NULL,
  type               text    NOT NULL CHECK (type IN ('MCQ_SINGLE', 'MCQ_MULTI', 'FREE_RESPONSE')),
  option_count       integer CHECK (option_count BETWEEN 2 AND 5),
  multi_answer       boolean NOT NULL DEFAULT false,
  status             text    NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'ACTIVE', 'CLOSED')),
  results_visible    boolean NOT NULL DEFAULT false,
  parent_question_id uuid    REFERENCES public.crs_questions(id),
  is_revote          boolean NOT NULL DEFAULT false,
  duration_seconds   integer,
  launched_at        timestamptz,
  closed_at          timestamptz,
  screenshot_url     text
);
ALTER TABLE public.crs_questions ENABLE ROW LEVEL SECURITY;

-- CRS Responses — NO UNIQUE constraint; single-answer MCQ enforced at application level
CREATE TABLE public.crs_responses (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id  uuid        NOT NULL REFERENCES public.crs_questions(id),
  user_id      uuid        NOT NULL REFERENCES public.users(id),
  response     text        NOT NULL,
  submitted_at timestamptz DEFAULT now()
);
ALTER TABLE public.crs_responses ENABLE ROW LEVEL SECURITY;

-- Session Attendance
CREATE TABLE public.session_attendance (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid        NOT NULL REFERENCES public.crs_sessions(id),
  user_id    uuid        NOT NULL REFERENCES public.users(id),
  scanned_at timestamptz DEFAULT now(),
  scan_token text        NOT NULL,
  method     text        CHECK (method IN ('QR', 'CODE')),
  UNIQUE (session_id, user_id)
);
ALTER TABLE public.session_attendance ENABLE ROW LEVEL SECURITY;

-- Faculty whitelist — read only by the Before User Created auth hook
CREATE TABLE public.faculty_whitelist (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  email      text        NOT NULL UNIQUE,
  note       text,
  added_by   text,
  created_at timestamptz NOT NULL DEFAULT now()
);
-- Not accessible via the normal Supabase client from any app role;
-- only supabase_auth_admin (granted below) can read it.
REVOKE ALL ON public.faculty_whitelist FROM authenticated, anon, public;


-- ============================================================
-- 2. INDEXES
-- ============================================================

-- At most one active (ended_at IS NULL) session per course at a time
CREATE UNIQUE INDEX one_active_session_per_course
  ON public.crs_sessions (course_id)
  WHERE ended_at IS NULL;


-- ============================================================
-- 3. ROLE GRANTS
-- Required after any DROP SCHEMA public CASCADE wipes default grants.
-- ============================================================
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA public TO anon;
GRANT USAGE ON SCHEMA public TO service_role;

GRANT ALL ON ALL TABLES    IN SCHEMA public TO authenticated;
GRANT ALL ON ALL TABLES    IN SCHEMA public TO anon;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon;
GRANT ALL ON ALL TABLES    IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;


-- ============================================================
-- 4. HELPER FUNCTIONS AND AUTH TRIGGER
-- ============================================================

-- is_enrolled_as: checks whether the current user holds any of the given roles
-- in the specified course. SECURITY DEFINER bypasses RLS so that RLS policies
-- on enrollments (and tables that join through enrollments) do not recurse
-- infinitely when they call this function.
CREATE OR REPLACE FUNCTION public.is_enrolled_as(p_course_id uuid, p_roles text[])
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.enrollments
    WHERE course_id = p_course_id
      AND user_id = auth.uid()
      AND role = ANY(p_roles)
  );
$$;

-- handle_new_user: fires on every new auth.users INSERT (first Google SSO login).
-- Creates the public.users mirror row, then auto-enrolls the user in any courses
-- for which a course_invitation exists matching their email.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.users (id, email, name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1))
  )
  ON CONFLICT (id) DO NOTHING;

  -- Auto-enroll from matching course_invitations.
  -- ON CONFLICT DO NOTHING: if they already self-enrolled as STUDENT via join_code,
  -- the invitation role is not applied (INSTRUCTOR can update the enrollment manually).
  INSERT INTO public.enrollments (course_id, user_id, role)
  SELECT ci.course_id, NEW.id, ci.role
  FROM public.course_invitations ci
  WHERE ci.email = NEW.email
  ON CONFLICT (course_id, user_id) DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


-- ============================================================
-- 5. RLS POLICIES
--
-- Permission model:
--   INSTRUCTOR — full access including enrollment management and course deletion
--   TA         — run sessions and download data; no enrollment management, no deletion
--   STUDENT    — respond to questions only
-- ============================================================

-- ---- users ----
CREATE POLICY "users: read own" ON public.users
  FOR SELECT USING (id = auth.uid());

CREATE POLICY "users: insert own" ON public.users
  FOR INSERT WITH CHECK (id = auth.uid());

CREATE POLICY "users: update own" ON public.users
  FOR UPDATE USING (id = auth.uid());

-- ---- courses ----
CREATE POLICY "courses: any auth insert" ON public.courses
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "courses: enrolled or owner select" ON public.courses
  FOR SELECT USING (
    owner_id = auth.uid()
    OR id IN (
      SELECT course_id FROM public.enrollments WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "courses: owner update" ON public.courses
  FOR UPDATE USING (owner_id = auth.uid());

CREATE POLICY "courses: owner delete" ON public.courses
  FOR DELETE USING (owner_id = auth.uid());

-- ---- enrollments ----
CREATE POLICY "enrollments: insert" ON public.enrollments
  FOR INSERT WITH CHECK (
    -- Any authenticated user can self-enroll as STUDENT (open enrollment via join_code)
    (user_id = auth.uid() AND role = 'STUDENT')
    -- Course owner can enroll themselves as INSTRUCTOR (first enrollment bootstrapping)
    OR (
      user_id = auth.uid()
      AND role = 'INSTRUCTOR'
      AND course_id IN (SELECT id FROM public.courses WHERE owner_id = auth.uid())
    )
    -- An existing INSTRUCTOR can add any INSTRUCTOR or TA enrollment
    OR (
      role IN ('INSTRUCTOR', 'TA')
      AND public.is_enrolled_as(course_id, ARRAY['INSTRUCTOR'])
    )
  );

CREATE POLICY "enrollments: select" ON public.enrollments
  FOR SELECT USING (
    user_id = auth.uid()
    OR public.is_enrolled_as(course_id, ARRAY['INSTRUCTOR'])
  );

CREATE POLICY "enrollments: instructor update" ON public.enrollments
  FOR UPDATE USING (
    public.is_enrolled_as(course_id, ARRAY['INSTRUCTOR'])
  );

CREATE POLICY "enrollments: instructor delete" ON public.enrollments
  FOR DELETE USING (
    public.is_enrolled_as(course_id, ARRAY['INSTRUCTOR'])
  );

-- ---- course_invitations ----
CREATE POLICY "invitations: instructor select" ON public.course_invitations
  FOR SELECT USING (
    public.is_enrolled_as(course_id, ARRAY['INSTRUCTOR'])
  );

CREATE POLICY "invitations: instructor insert" ON public.course_invitations
  FOR INSERT WITH CHECK (
    public.is_enrolled_as(course_id, ARRAY['INSTRUCTOR'])
    AND invited_by = auth.uid()
  );

CREATE POLICY "invitations: instructor delete" ON public.course_invitations
  FOR DELETE USING (
    public.is_enrolled_as(course_id, ARRAY['INSTRUCTOR'])
  );

-- ---- crs_sessions ----
CREATE POLICY "sessions: enrolled select" ON public.crs_sessions
  FOR SELECT USING (
    public.is_enrolled_as(course_id, ARRAY['INSTRUCTOR', 'TA', 'STUDENT'])
  );

CREATE POLICY "sessions: instructor or ta insert" ON public.crs_sessions
  FOR INSERT WITH CHECK (
    public.is_enrolled_as(course_id, ARRAY['INSTRUCTOR', 'TA'])
  );

CREATE POLICY "sessions: instructor or ta update" ON public.crs_sessions
  FOR UPDATE USING (
    public.is_enrolled_as(course_id, ARRAY['INSTRUCTOR', 'TA'])
  );

-- ---- crs_questions ----
CREATE POLICY "questions: enrolled select" ON public.crs_questions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.crs_sessions s
      WHERE s.id = session_id
        AND public.is_enrolled_as(s.course_id, ARRAY['INSTRUCTOR', 'TA', 'STUDENT'])
    )
  );

CREATE POLICY "questions: instructor or ta insert" ON public.crs_questions
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.crs_sessions s
      WHERE s.id = session_id
        AND public.is_enrolled_as(s.course_id, ARRAY['INSTRUCTOR', 'TA'])
    )
  );

CREATE POLICY "questions: instructor or ta update" ON public.crs_questions
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.crs_sessions s
      WHERE s.id = session_id
        AND public.is_enrolled_as(s.course_id, ARRAY['INSTRUCTOR', 'TA'])
    )
  );

-- ---- crs_responses ----
CREATE POLICY "responses: own insert" ON public.crs_responses
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "responses: own update" ON public.crs_responses
  FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "responses: select" ON public.crs_responses
  FOR SELECT USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.crs_questions q
      JOIN public.crs_sessions s ON s.id = q.session_id
      WHERE q.id = question_id
        AND public.is_enrolled_as(s.course_id, ARRAY['INSTRUCTOR', 'TA'])
    )
  );

-- ---- session_attendance ----
CREATE POLICY "attendance: own insert" ON public.session_attendance
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "attendance: select" ON public.session_attendance
  FOR SELECT USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.crs_sessions s
      WHERE s.id = session_id
        AND public.is_enrolled_as(s.course_id, ARRAY['INSTRUCTOR', 'TA'])
    )
  );


-- ============================================================
-- 6. REALTIME
-- ============================================================

ALTER PUBLICATION supabase_realtime ADD TABLE public.crs_questions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.crs_responses;
ALTER PUBLICATION supabase_realtime ADD TABLE public.crs_sessions;


-- ============================================================
-- 7. STORAGE
-- ============================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('screenshots', 'screenshots', false);

CREATE POLICY "screenshots: instructor upload" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'screenshots'
    AND auth.uid() IS NOT NULL
  );

CREATE POLICY "screenshots: instructor read" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'screenshots'
    AND auth.uid() IS NOT NULL
  );


-- ============================================================
-- 8. FACULTY WHITELIST + BEFORE USER CREATED AUTH HOOK
--
-- The hook_restrict_signup_to_whitelist function is called by
-- Supabase Auth before a new auth.users row is created. If the
-- incoming email is not in faculty_whitelist, signup is rejected
-- and the user never receives a valid session.
--
-- Payload path verified against live Supabase docs (April 2025):
--   event->'user'->>'email'   ← correct
--   event->'claims'->>'email' ← WRONG (do not use)
--
-- MANUAL STEP: enable this hook in the Supabase dashboard at
--   Authentication > Hooks > Before User Created
-- This migration creates the function but cannot activate it.
-- ============================================================

CREATE OR REPLACE FUNCTION public.hook_restrict_signup_to_whitelist(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  user_email text;
BEGIN
  user_email := lower(event->'user'->>'email');

  IF NOT EXISTS (
    SELECT 1 FROM public.faculty_whitelist
    WHERE lower(email) = user_email
  ) THEN
    RETURN jsonb_build_object(
      'error', jsonb_build_object(
        'http_code', 403,
        'message',   'This Smidgeon instance is restricted to invited faculty during the pilot. Contact Jaime Spacco to be added.'
      )
    );
  END IF;

  -- Email is in the whitelist — allow signup to proceed.
  RETURN jsonb_build_object();
END;
$$;

GRANT EXECUTE ON FUNCTION public.hook_restrict_signup_to_whitelist TO supabase_auth_admin;
GRANT SELECT  ON public.faculty_whitelist                           TO supabase_auth_admin;
REVOKE EXECUTE ON FUNCTION public.hook_restrict_signup_to_whitelist FROM authenticated, anon, public;

-- Seed initial whitelist entry.
-- VERIFY: update jspacco@knox.edu if this is not the correct address.
-- To add more faculty, run in the Supabase dashboard SQL editor:
--   INSERT INTO public.faculty_whitelist (email, note, added_by)
--   VALUES ('faculty@knox.edu', 'Pilot participant', 'jspacco@knox.edu');
INSERT INTO public.faculty_whitelist (email, note, added_by)
VALUES ('jspacco@knox.edu', 'Project owner', 'seed')
ON CONFLICT (email) DO NOTHING;
