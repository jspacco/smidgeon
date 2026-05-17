-- Enable Realtime on tables subscribed to by students and faculty
ALTER PUBLICATION supabase_realtime ADD TABLE public.crs_questions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.crs_responses;
