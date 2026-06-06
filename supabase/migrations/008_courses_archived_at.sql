ALTER TABLE public.courses
ADD COLUMN archived_at timestamptz DEFAULT NULL;
