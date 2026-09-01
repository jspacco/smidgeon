# TODO

## Manual setup steps (must do after migrations)

* **Enable Before User Created auth hook** (migration 010 added the function, but it must be
  activated manually in the Supabase dashboard):
  - Go to: Authentication > Hooks > Before User Created
  - Select the `hook_restrict_signup_to_whitelist` Postgres function
  - Save. Until this is done, the whitelist has no effect and all Google accounts can sign up.
* **Verify seed email** — migration 010 seeds `jspacco@knox.edu`. Confirm this is the correct
  Knox address, or update it via the dashboard SQL editor:
  ```sql
  insert into public.faculty_whitelist (email, note, added_by)
  values ('correct@knox.edu', 'Project owner', 'seed');
  ```

## Shared
* Microsoft SSO
* Not redeploying when icons change
* update readme to reflect new license (AGPL, not MIT)
* invite table for alpha-testing; how are we handling this?
* allowed domains as a list, not a single domain
* Instructions for deploying to someone else's thing
   - hard-coded to connect to my supabase (I think)
* Buy supabase at $25/mo
* Total cost estimates for pilot: $400/yr ($99/yr Apple dev license + $300/yr ($25/mo) supabase)

## Student PWA
* Smidgeon icon rather than the weird clipboard clip art thing
* handle bad URLs (asdfasdf) at smidgeon.app/asdfasdf

## Faculty Dashboard
* Show screenshots linked to questions, once we have screenshots
* says "Knox College" on splash page

## Faculty PWA
* Choose correct answer for MCQ

## Tauri Controller

### Log file locations (tauri-plugin-log, bundle id: edu.knox.crs.controller)
If a faculty member experiences a crash or screenshot failure, the log file is at:
- **macOS**: `~/Library/Logs/edu.knox.crs.controller/`
- **Windows**: `%LOCALAPPDATA%\edu.knox.crs.controller\logs\`
- **Linux**: `~/.local/share/edu.knox.crs.controller/logs/`

Up to 5 rotated log files are kept; each file is capped at 5 MB.
To collect logs: ask faculty to zip that folder and email it.

* Should not say "knox.edu" in the title screen
* Choose correct answer for MCQ
* Revote button always exists, but is greyed out when not in use
* Exit button, or at least an X in the corner, that quits but doesn't log out
* tooltips don't actually work
* green status update not visible at the bottom
* Grab and move widget upon launch
* single / multi does not highlight default
* screenshot recording setting not saved/remembered
* names of S3 buckets on supabase are wonky; maybe OK?
* can't see green saying we have permissions
* Test on windows
* **Screenshots**
   - [ ] Auto-capture on question launch when Screenshots=On
   - [ ] Upload to Supabase Storage
   - [ ] URL stored on question record

## Long term
* data archiving options on Supabase to stay below 8 GB limits
* profiling of some kind?
   - financial bottlenecks
   - resource bottlenecks
* database backups
   - how and where?
   - nightly vs weekly?
* realistic picture of failure modes and support requirements

## Live session, open question
Faculty leave a live session, possibly with an open question

Two changes for resilience when faculty app closes unexpectedly:

1. Student PWA: if a question has been ACTIVE for more than 
   5 minutes (check launched_at), show a soft warning: 
   "Waiting for instructor..." below the voting buttons. 
   Do not lock out or redirect. Just a gentle indicator.

2. Add a Supabase pg_cron job (new migration file) that runs 
   every minute and closes questions stuck in ACTIVE status 
   for more than 15 minutes:
   
   UPDATE crs_questions
   SET status = 'CLOSED', 
       closed_at = now(),
       duration_seconds = EXTRACT(EPOCH FROM (now() - launched_at))::int
   WHERE status = 'ACTIVE'
   AND launched_at < now() - interval '15 minutes';


# Notes

## refactoring worklow:

`Tell Weirdo`:

Before touching any code, do the following only:
1. List every file in src/ for each app
2. For each file, one sentence: what it does
3. Flag any files that appear dead (imported nowhere)
4. Flag any logic that appears duplicated across files
5. Flag any components over 200 lines
Do not change any code. Just report.

## Vercel as a monorepo

We added vercel.json to each app folder:
apps/student-pwa/vercel.json
apps/faculty-pwa/vercel.json
apps/faculty-dashboard/vercel.json

Contents for each:
{
  "installCommand": "cd ../.. && pnpm install --frozen-lockfile",
  "buildCommand": "pnpm build",
  "outputDirectory": "dist"
}

This tells Vercel to install from the monorepo root so 
shared workspace packages (@crs/types, @crs/ui) resolve correctly.

Note that for each Vercel project we configured => Settings => Build and Deployment => "Skip deployments when there are no changes to the root directory or its dependencies." to _Enabled_. So that we don't deploy new Vercel releases for every push to main.

# August fixups

> Test Tauri on Windows — yes, critical. The GitHub Actions Windows build compiles but you've never actually run it on a Windows machine. The screen recording permission flow is macOS-only, but basic login, session control, QR popup, results window all need a real Windows test. You said you'd test at school on a projector machine.

> Faculty whitelist — adding emails is currently raw SQL only, no UI. You add someone via the Supabase dashboard SQL editor: INSERT INTO public.faculty_whitelist (email, note) VALUES ('colleague@knox.edu', 'Fall pilot'); That's it. Works, but it's manual and requires Supabase dashboard access. Fine for a closed alpha with a handful of people, annoying if you need to add 10+ people. Worth verifying the hook actually rejects an unknown email with a clean error message rather than a confusing dead-end.

> Practice creating a new class — yes, and specifically test the full student join flow: create course, start session, scan QR on a real phone with the stock camera app (this is the QR-as-URL fix that's still unfinished in an instruction file but not yet built). This is probably the most important end-to-end test.

> Faculty control panel — not sure exactly what you mean here. The faculty PWA? The Tauri toolbar? Both exist and mostly work. Or do you mean the dashboard specifically?

> QR code for students — the QR-as-URL branch was written up but never given to Weirdo. Currently the QR encodes a bare UUID, which means stock camera apps can't use it. This is a real blocker for first-time students who haven't installed the PWA yet. High priority.

>GRANT USAGE ON SCHEMA public TO supabase_auth_admin permanently added to 001_schema.sql — you fixed this live in SQL but never put it in the migration file. Any fresh self-hosted install hits the same wall you hit. One line fix.

> End-to-end student flow test — you as instructor on laptop/Tauri, yourself or a colleague as student on a phone, actually joining via QR, voting on a question, seeing results. Has this ever been tested with two real devices simultaneously? This is the core loop and worth confirming before any real faculty try it.

> Session code as fallback — related to QR, does typing the 6-digit code on the student landing page actually work and bring a student into the session? This path hasn't been explicitly verified recently.

> CSV export — does it actually produce useful output? Has anyone downloaded and opened one?

> Reopen session — works in the database, but has the UI button been tested?

> Revote — core PI feature, has it been tested end-to-end recently?

> The toolbar-cleanup branch — was mid-way through when you left. The End Session icon choice (flag vs X-circle vs octagon) was unresolved. This branch probably needs to be finished and merged before you let any faculty see the app.

> Student PWA back-link removal — the dead-end < Live session link is still there, confirmed before your trip.

> Faculty PWA join-code page — URL needs to be more prominent, join code display should be removed.

## how to blow up supabase and start over
> Supabase CLI command to reset the database and remove all data, including the screenshots bucket and its contents. This command will also remove any linked services or configurations associated with the database.
`supabase db reset --linked`

> in the web interface for supabase, go to the SQL editor and run the following commands to delete the screenshots bucket and its contents:
```SQL
DELETE FROM storage.objects WHERE bucket_id = 'screenshots';
DELETE FROM storage.buckets WHERE id = 'screenshots';
```