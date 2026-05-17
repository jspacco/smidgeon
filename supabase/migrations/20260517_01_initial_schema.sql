-- Users (mirrors Supabase Auth; row created automatically via trigger)
CREATE TABLE public.users (
  id         uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email      text NOT NULL,
  name       text NOT NULL,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- Courses
CREATE TABLE public.courses (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                  text NOT NULL,
  owner_id              uuid NOT NULL REFERENCES public.users(id),
  join_code             text NOT NULL UNIQUE,
  default_option_count  integer NOT NULL DEFAULT 5,
  created_at            timestamptz DEFAULT now(),
  institution_id        uuid,
  academic_year_term_id uuid
);
ALTER TABLE public.courses ENABLE ROW LEVEL SECURITY;

-- Enrollments
CREATE TABLE public.enrollments (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id   uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  role        text NOT NULL CHECK (role IN ('INSTRUCTOR', 'STUDENT')),
  enrolled_at timestamptz DEFAULT now(),
  UNIQUE (course_id, user_id)
);
ALTER TABLE public.enrollments ENABLE ROW LEVEL SECURITY;

-- CRS Sessions
CREATE TABLE public.crs_sessions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id   uuid NOT NULL REFERENCES public.courses(id),
  started_at  timestamptz DEFAULT now(),
  ended_at    timestamptz,
  qr_token    text NOT NULL UNIQUE
);
ALTER TABLE public.crs_sessions ENABLE ROW LEVEL SECURITY;

-- CRS Questions
CREATE TABLE public.crs_questions (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id         uuid NOT NULL REFERENCES public.crs_sessions(id),
  sequence_number    integer NOT NULL,
  type               text NOT NULL CHECK (type IN ('MCQ_SINGLE', 'MCQ_MULTI', 'FREE_RESPONSE')),
  option_count       integer CHECK (option_count BETWEEN 2 AND 5),
  multi_answer       boolean NOT NULL DEFAULT false,
  status             text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'ACTIVE', 'CLOSED')),
  results_visible    boolean NOT NULL DEFAULT false,
  parent_question_id uuid REFERENCES public.crs_questions(id),
  is_revote          boolean NOT NULL DEFAULT false,
  duration_seconds   integer,
  launched_at        timestamptz,
  closed_at          timestamptz,
  screenshot_url     text
);
ALTER TABLE public.crs_questions ENABLE ROW LEVEL SECURITY;

-- CRS Responses — NO UNIQUE constraint on (question_id, user_id); enforced at application level
CREATE TABLE public.crs_responses (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id  uuid NOT NULL REFERENCES public.crs_questions(id),
  user_id      uuid NOT NULL REFERENCES public.users(id),
  response     text NOT NULL,
  submitted_at timestamptz DEFAULT now()
);
ALTER TABLE public.crs_responses ENABLE ROW LEVEL SECURITY;

-- Session Attendance
CREATE TABLE public.session_attendance (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id  uuid NOT NULL REFERENCES public.crs_sessions(id),
  user_id     uuid NOT NULL REFERENCES public.users(id),
  scanned_at  timestamptz DEFAULT now(),
  scan_token  text NOT NULL,
  UNIQUE (session_id, user_id)
);
ALTER TABLE public.session_attendance ENABLE ROW LEVEL SECURITY;
