-- ============================================================
-- 002_helpers.sql — SECURITY DEFINER functions and auth trigger
-- Must run after 001_schema.sql and before 003_policies.sql
-- ============================================================

-- is_enrolled_as: checks whether the current user holds any of the given roles
-- in the specified course. SECURITY DEFINER bypasses RLS so that RLS policies
-- on enrollments (and tables joining through enrollments) do not recurse
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
