-- ============================================================
-- Migration 07: Replace RLS policies with full permission model
--
-- Roles:
--   INSTRUCTOR — full access including enrollment management and course deletion
--   TA         — run sessions and download data; no enrollment management, no course deletion
--   STUDENT    — respond to questions only
--
-- Depends on: public.is_enrolled_as() from migration 06
-- ============================================================

-- ---- Drop all existing policies from migration 02 ----

DROP POLICY IF EXISTS "courses: enrolled read"       ON public.courses;
DROP POLICY IF EXISTS "courses: owner write"         ON public.courses;
DROP POLICY IF EXISTS "courses: owner update"        ON public.courses;
DROP POLICY IF EXISTS "courses: owner delete"        ON public.courses;

DROP POLICY IF EXISTS "enrollments: self read"       ON public.enrollments;
DROP POLICY IF EXISTS "enrollments: self insert"     ON public.enrollments;

DROP POLICY IF EXISTS "sessions: enrolled read"      ON public.crs_sessions;
DROP POLICY IF EXISTS "sessions: instructor insert"  ON public.crs_sessions;
DROP POLICY IF EXISTS "sessions: instructor update"  ON public.crs_sessions;

DROP POLICY IF EXISTS "questions: enrolled read"     ON public.crs_questions;
DROP POLICY IF EXISTS "questions: instructor insert" ON public.crs_questions;
DROP POLICY IF EXISTS "questions: instructor update" ON public.crs_questions;

DROP POLICY IF EXISTS "responses: student insert"    ON public.crs_responses;
DROP POLICY IF EXISTS "responses: student update own" ON public.crs_responses;
DROP POLICY IF EXISTS "responses: read"              ON public.crs_responses;

DROP POLICY IF EXISTS "attendance: read"             ON public.session_attendance;
DROP POLICY IF EXISTS "attendance: student insert"   ON public.session_attendance;

-- ============================================================
-- COURSES
-- ============================================================

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

-- Rule 3: only owner can update or delete
CREATE POLICY "courses: owner update" ON public.courses
  FOR UPDATE USING (owner_id = auth.uid());

CREATE POLICY "courses: owner delete" ON public.courses
  FOR DELETE USING (owner_id = auth.uid());

-- ============================================================
-- ENROLLMENTS
-- ============================================================

-- Rule 4 + 5 (combined):
--   STUDENT self-enrollment: user_id = caller AND role = 'STUDENT'
--   Owner bootstrap:         caller enrolls themselves as INSTRUCTOR for a course they own
--   INSTRUCTOR adds others:  existing INSTRUCTOR of the course adds any INSTRUCTOR/TA row
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

-- Rule 7: INSTRUCTOR of that course only
CREATE POLICY "enrollments: instructor update" ON public.enrollments
  FOR UPDATE USING (
    public.is_enrolled_as(course_id, ARRAY['INSTRUCTOR'])
  );

CREATE POLICY "enrollments: instructor delete" ON public.enrollments
  FOR DELETE USING (
    public.is_enrolled_as(course_id, ARRAY['INSTRUCTOR'])
  );

-- ============================================================
-- CRS_SESSIONS
-- ============================================================

-- Rule 8: any enrolled user (any role) can read sessions
CREATE POLICY "sessions: enrolled select" ON public.crs_sessions
  FOR SELECT USING (
    public.is_enrolled_as(course_id, ARRAY['INSTRUCTOR', 'TA', 'STUDENT'])
  );

-- Rule 9: INSTRUCTOR or TA can insert/update sessions
CREATE POLICY "sessions: instructor or ta insert" ON public.crs_sessions
  FOR INSERT WITH CHECK (
    public.is_enrolled_as(course_id, ARRAY['INSTRUCTOR', 'TA'])
  );

CREATE POLICY "sessions: instructor or ta update" ON public.crs_sessions
  FOR UPDATE USING (
    public.is_enrolled_as(course_id, ARRAY['INSTRUCTOR', 'TA'])
  );

-- ============================================================
-- CRS_QUESTIONS
-- (no direct course_id — must join to crs_sessions)
-- ============================================================

-- Rule 10: any enrolled user can read questions
CREATE POLICY "questions: enrolled select" ON public.crs_questions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.crs_sessions s
      WHERE s.id = session_id
        AND public.is_enrolled_as(s.course_id, ARRAY['INSTRUCTOR', 'TA', 'STUDENT'])
    )
  );

-- Rule 11: INSTRUCTOR or TA can insert/update questions
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

-- ============================================================
-- CRS_RESPONSES
-- ============================================================

-- Rule 12: students insert/update only their own rows
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

-- ============================================================
-- SESSION_ATTENDANCE
-- ============================================================

-- Rule 14: students insert only their own attendance rows
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
