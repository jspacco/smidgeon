-- ============================================================
-- 003_policies.sql — All RLS policies
-- Depends on: 001_schema.sql, 002_helpers.sql (is_enrolled_as)
--
-- Permission model:
--   INSTRUCTOR — full access including enrollment management and course deletion
--   TA         — run sessions and download data; no enrollment management, no course deletion
--   STUDENT    — respond to questions only
-- ============================================================

-- ---- users ----
-- Each user sees and manages only their own row.

CREATE POLICY "users: read own" ON public.users
  FOR SELECT USING (id = auth.uid());

CREATE POLICY "users: insert own" ON public.users
  FOR INSERT WITH CHECK (id = auth.uid());

-- ---- courses ----
-- Rule 1: any authenticated user can create a course
CREATE POLICY "courses: any auth insert" ON public.courses
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- Rule 2: enrolled users OR owner can read
CREATE POLICY "courses: enrolled or owner select" ON public.courses
  FOR SELECT USING (
    owner_id = auth.uid()
    OR id IN (
      SELECT course_id FROM public.enrollments WHERE user_id = auth.uid()
    )
  );

-- Rule 3: owner only
CREATE POLICY "courses: owner update" ON public.courses
  FOR UPDATE USING (owner_id = auth.uid());

CREATE POLICY "courses: owner delete" ON public.courses
  FOR DELETE USING (owner_id = auth.uid());

-- ---- enrollments ----
-- Rule 4+5: self as STUDENT; owner bootstraps as INSTRUCTOR; INSTRUCTOR adds INSTRUCTOR/TA
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

-- Rule 6: own enrollment OR INSTRUCTOR of that course
CREATE POLICY "enrollments: select" ON public.enrollments
  FOR SELECT USING (
    user_id = auth.uid()
    OR public.is_enrolled_as(course_id, ARRAY['INSTRUCTOR'])
  );

-- Rule 7: INSTRUCTOR only
CREATE POLICY "enrollments: instructor update" ON public.enrollments
  FOR UPDATE USING (
    public.is_enrolled_as(course_id, ARRAY['INSTRUCTOR'])
  );

CREATE POLICY "enrollments: instructor delete" ON public.enrollments
  FOR DELETE USING (
    public.is_enrolled_as(course_id, ARRAY['INSTRUCTOR'])
  );

-- ---- course_invitations ----
-- INSTRUCTOR-only management

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
-- Rule 8: any enrolled user can read
CREATE POLICY "sessions: enrolled select" ON public.crs_sessions
  FOR SELECT USING (
    public.is_enrolled_as(course_id, ARRAY['INSTRUCTOR', 'TA', 'STUDENT'])
  );

-- Rule 9: INSTRUCTOR or TA can write
CREATE POLICY "sessions: instructor or ta insert" ON public.crs_sessions
  FOR INSERT WITH CHECK (
    public.is_enrolled_as(course_id, ARRAY['INSTRUCTOR', 'TA'])
  );

CREATE POLICY "sessions: instructor or ta update" ON public.crs_sessions
  FOR UPDATE USING (
    public.is_enrolled_as(course_id, ARRAY['INSTRUCTOR', 'TA'])
  );

-- ---- crs_questions ----
-- (no direct course_id — join through crs_sessions)
-- Rule 10: any enrolled user can read
CREATE POLICY "questions: enrolled select" ON public.crs_questions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.crs_sessions s
      WHERE s.id = session_id
        AND public.is_enrolled_as(s.course_id, ARRAY['INSTRUCTOR', 'TA', 'STUDENT'])
    )
  );

-- Rule 11: INSTRUCTOR or TA can write
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
-- Rule 12: own rows only for insert/update
CREATE POLICY "responses: own insert" ON public.crs_responses
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "responses: own update" ON public.crs_responses
  FOR UPDATE USING (user_id = auth.uid());

-- Rule 13: own rows OR INSTRUCTOR/TA of the course
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
-- Rule 14: own rows only for insert
CREATE POLICY "attendance: own insert" ON public.session_attendance
  FOR INSERT WITH CHECK (user_id = auth.uid());

-- Rule 15: own rows OR INSTRUCTOR/TA of the course
CREATE POLICY "attendance: select" ON public.session_attendance
  FOR SELECT USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.crs_sessions s
      WHERE s.id = session_id
        AND public.is_enrolled_as(s.course_id, ARRAY['INSTRUCTOR', 'TA'])
    )
  );
