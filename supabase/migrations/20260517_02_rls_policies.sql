-- users: each user sees and manages only their own row
CREATE POLICY "users: read own" ON public.users
  FOR SELECT USING (id = auth.uid());

CREATE POLICY "users: insert own" ON public.users
  FOR INSERT WITH CHECK (id = auth.uid());

-- courses: owner has full access; enrolled students/instructors can read
CREATE POLICY "courses: enrolled read" ON public.courses
  FOR SELECT USING (
    owner_id = auth.uid()
    OR id IN (
      SELECT course_id FROM public.enrollments WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "courses: owner write" ON public.courses
  FOR INSERT WITH CHECK (owner_id = auth.uid());

CREATE POLICY "courses: owner update" ON public.courses
  FOR UPDATE USING (owner_id = auth.uid());

CREATE POLICY "courses: owner delete" ON public.courses
  FOR DELETE USING (owner_id = auth.uid());

-- enrollments: self-enrollment as STUDENT is open; instructors see all in their courses
CREATE POLICY "enrollments: self read" ON public.enrollments
  FOR SELECT USING (
    user_id = auth.uid()
    OR course_id IN (
      SELECT id FROM public.courses WHERE owner_id = auth.uid()
    )
  );

CREATE POLICY "enrollments: self insert" ON public.enrollments
  FOR INSERT WITH CHECK (user_id = auth.uid());

-- crs_sessions: enrolled users (any role) can read; course owners can write
CREATE POLICY "sessions: enrolled read" ON public.crs_sessions
  FOR SELECT USING (
    course_id IN (
      SELECT course_id FROM public.enrollments WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "sessions: instructor insert" ON public.crs_sessions
  FOR INSERT WITH CHECK (
    course_id IN (SELECT id FROM public.courses WHERE owner_id = auth.uid())
  );

CREATE POLICY "sessions: instructor update" ON public.crs_sessions
  FOR UPDATE USING (
    course_id IN (SELECT id FROM public.courses WHERE owner_id = auth.uid())
  );

-- crs_questions: enrolled users can read; course owners can write
CREATE POLICY "questions: enrolled read" ON public.crs_questions
  FOR SELECT USING (
    session_id IN (
      SELECT s.id FROM public.crs_sessions s
      JOIN public.enrollments e ON e.course_id = s.course_id
      WHERE e.user_id = auth.uid()
    )
  );

CREATE POLICY "questions: instructor insert" ON public.crs_questions
  FOR INSERT WITH CHECK (
    session_id IN (
      SELECT s.id FROM public.crs_sessions s
      JOIN public.courses c ON c.id = s.course_id
      WHERE c.owner_id = auth.uid()
    )
  );

CREATE POLICY "questions: instructor update" ON public.crs_questions
  FOR UPDATE USING (
    session_id IN (
      SELECT s.id FROM public.crs_sessions s
      JOIN public.courses c ON c.id = s.course_id
      WHERE c.owner_id = auth.uid()
    )
  );

-- crs_responses: students insert own; students read own; instructors read all for their courses
CREATE POLICY "responses: student insert" ON public.crs_responses
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "responses: student update own" ON public.crs_responses
  FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "responses: read" ON public.crs_responses
  FOR SELECT USING (
    user_id = auth.uid()
    OR question_id IN (
      SELECT q.id FROM public.crs_questions q
      JOIN public.crs_sessions s ON s.id = q.session_id
      JOIN public.courses c ON c.id = s.course_id
      WHERE c.owner_id = auth.uid()
    )
  );

-- session_attendance: written by edge function (service role); students/instructors read
CREATE POLICY "attendance: read" ON public.session_attendance
  FOR SELECT USING (
    user_id = auth.uid()
    OR session_id IN (
      SELECT s.id FROM public.crs_sessions s
      JOIN public.courses c ON c.id = s.course_id
      WHERE c.owner_id = auth.uid()
    )
  );

CREATE POLICY "attendance: student insert" ON public.session_attendance
  FOR INSERT WITH CHECK (user_id = auth.uid());
