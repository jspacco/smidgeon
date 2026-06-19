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
