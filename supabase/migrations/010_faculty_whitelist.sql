-- =============================================================================
-- 010_faculty_whitelist.sql
-- Faculty email whitelist + Before User Created auth hook
--
-- PURPOSE:
--   Adds a server-side allowlist so that only specific email addresses can
--   create new Supabase Auth accounts. This replaces the client-side `hd`
--   hint (VITE_ALLOWED_DOMAIN) as the real access boundary during the pilot.
--   The `hd` hint is NOT removed — it remains for self-hosting use.
--
-- HOW IT WORKS:
--   A Postgres function (hook_restrict_signup_to_whitelist) is called by
--   Supabase Auth BEFORE a new auth.users row is created. If the incoming
--   email is not in faculty_whitelist, the signup is rejected outright and
--   the user never gets a valid session.
--
-- PAYLOAD NOTE (verified against Supabase docs, April 2025):
--   The Before User Created hook receives:
--     { "metadata": {...}, "user": { "email": "...", ... } }
--   Email is at event->'user'->>'email', NOT event->'claims'->>'email'.
--   The draft in the task used the wrong path; this migration uses the
--   correct path confirmed from live documentation.
--
-- MANUAL DASHBOARD STEP REQUIRED AFTER RUNNING THIS MIGRATION:
--   This hook will NOT take effect until you enable it in the Supabase
--   dashboard. Go to:
--     Authentication > Hooks > Before User Created
--   Select the "hook_restrict_signup_to_whitelist" Postgres function.
--   Until that step is done, signups are unrestricted even after this
--   migration runs.
--   (This cannot be done via migration SQL — it is a dashboard-only config.)
-- =============================================================================


-- ---------------------------------------------------------------------------
-- 1. faculty_whitelist table
-- ---------------------------------------------------------------------------
create table if not exists public.faculty_whitelist (
  id         uuid        primary key default gen_random_uuid(),
  email      text        not null unique,
  note       text,
  added_by   text,
  created_at timestamptz not null default now()
);

-- This table is only ever read by the auth hook function running as
-- supabase_auth_admin. It must NOT be accessible via the normal Supabase
-- client from any app role.
revoke all on public.faculty_whitelist from authenticated, anon, public;


-- ---------------------------------------------------------------------------
-- 2. Before User Created hook function
--    Payload shape (verified against live Supabase docs):
--      event->'user'->>'email'   ← correct path
--      event->'claims'->>'email' ← WRONG (draft had this, corrected here)
-- ---------------------------------------------------------------------------
create or replace function public.hook_restrict_signup_to_whitelist(event jsonb)
returns jsonb
language plpgsql
as $$
declare
  user_email text;
begin
  user_email := lower(event->'user'->>'email');

  if not exists (
    select 1 from public.faculty_whitelist
    where lower(email) = user_email
  ) then
    return jsonb_build_object(
      'error', jsonb_build_object(
        'http_code', 403,
        'message',   'This Smidgeon instance is restricted to invited faculty during the pilot. Contact Jaime Spacco to be added.'
      )
    );
  end if;

  -- Email is in the whitelist — allow signup to proceed.
  return jsonb_build_object();
end;
$$;

-- Required grants per Supabase docs:
grant execute on function public.hook_restrict_signup_to_whitelist to supabase_auth_admin;
grant select  on public.faculty_whitelist                           to supabase_auth_admin;

revoke execute on function public.hook_restrict_signup_to_whitelist from authenticated, anon, public;


-- ---------------------------------------------------------------------------
-- 3. Seed initial whitelist entries
--
--    Add known pilot participants here so the hook does not lock them out
--    the moment it is enabled in the dashboard.
--
--    TO ADD MORE FACULTY:
--      Run this SQL in the Supabase dashboard SQL editor:
--        insert into public.faculty_whitelist (email, note, added_by)
--        values ('faculty@knox.edu', 'Pilot participant', 'jspacco@knox.edu');
--      No admin UI exists yet — direct SQL/dashboard management for now.
-- ---------------------------------------------------------------------------
insert into public.faculty_whitelist (email, note, added_by)
values
  -- Spacco's own Knox account.
  -- VERIFY: update this if jspacco@knox.edu is not the correct address.
  ('jspacco@knox.edu', 'Project owner', 'seed')
on conflict (email) do nothing;
