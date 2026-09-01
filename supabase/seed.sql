-- Seed initial whitelist entry.
-- Bootstrap: add instance administrator to faculty whitelist
-- Edit this file before running on a fresh installation
INSERT INTO public.faculty_whitelist (email, note, added_by)
VALUES ('jspacco@knox.edu', 'Project owner', 'seed')
ON CONFLICT (email) DO NOTHING;
