-- ============================================================
-- 006_session_code_and_themes.sql
-- Adds: theme/accent to users, session_code to crs_sessions,
--       method to session_attendance.
-- Note: one_active_session_per_course index already exists in 001_schema.sql.
-- ============================================================

-- Users: faculty theme and accent color
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS theme  text NOT NULL DEFAULT 'clean'
    CHECK (theme IN ('clean', 'terminal')),
  ADD COLUMN IF NOT EXISTS accent text NOT NULL DEFAULT '#06B6D4';

-- crs_sessions: 4-digit session code for code-based entry
ALTER TABLE public.crs_sessions
  ADD COLUMN IF NOT EXISTS session_code text;

-- Backfill existing rows with random 4-digit codes (1000–9999)
UPDATE public.crs_sessions
  SET session_code = lpad((1000 + (random() * 8999)::integer)::text, 4, '0')
  WHERE session_code IS NULL;

ALTER TABLE public.crs_sessions
  ALTER COLUMN session_code SET NOT NULL;

ALTER TABLE public.crs_sessions
  ADD CONSTRAINT crs_sessions_session_code_key UNIQUE (session_code);

-- session_attendance: track how the student entered (QR scan vs code)
ALTER TABLE public.session_attendance
  ADD COLUMN IF NOT EXISTS method text
    CHECK (method IN ('QR', 'CODE'));
