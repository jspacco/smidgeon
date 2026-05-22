-- ============================================================
-- Migration 06: TA role, course_invitations, enrollment helper
-- ============================================================

-- 1. Extend enrollments.role to include TA
ALTER TABLE public.enrollments
  DROP CONSTRAINT enrollments_role_check;
ALTER TABLE public.enrollments
  ADD CONSTRAINT enrollments_role_check CHECK (role IN ('INSTRUCTOR', 'TA', 'STUDENT'));

-- 2. course_invitations — pre-invited INSTRUCTOR/TA enrollments auto-applied on first login
CREATE TABLE public.course_invitations (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id   uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  email       text NOT NULL,
  role        text NOT NULL CHECK (role IN ('INSTRUCTOR', 'TA')),
  invited_by  uuid NOT NULL REFERENCES public.users(id),
  created_at  timestamptz DEFAULT now(),
  UNIQUE (course_id, email)
);
ALTER TABLE public.course_invitations ENABLE ROW LEVEL SECURITY;

-- 3. SECURITY DEFINER helper — avoids RLS recursion when enrollment policies
--    need to query enrollments to determine the caller's own role.
--    Used by all policies that check "is the current user INSTRUCTOR or TA".
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

-- 4. RLS policies for course_invitations
--    Only INSTRUCTORs of a course can manage invitations for it.

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

-- 5. Update auth trigger to auto-enroll new users from course_invitations.
--    Runs SECURITY DEFINER so it can bypass RLS to write both users and enrollments.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  -- Create the public.users mirror row
  INSERT INTO public.users (id, email, name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1))
  )
  ON CONFLICT (id) DO NOTHING;

  -- Auto-enroll from any matching course_invitations for this email.
  -- ON CONFLICT DO NOTHING: if they already self-enrolled as STUDENT via join_code,
  -- the invitation role is not applied (contact INSTRUCTOR to update manually).
  INSERT INTO public.enrollments (course_id, user_id, role)
  SELECT ci.course_id, NEW.id, ci.role
  FROM public.course_invitations ci
  WHERE ci.email = NEW.email
  ON CONFLICT (course_id, user_id) DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
