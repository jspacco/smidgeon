# TODO

## Faculty leave a live session, possibly with an open question
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


## refactoring worklow:

`Tell Weirdo`:

Before touching any code, do the following only:
1. List every file in src/ for each app
2. For each file, one sentence: what it does
3. Flag any files that appear dead (imported nowhere)
4. Flag any logic that appears duplicated across files
5. Flag any components over 200 lines
Do not change any code. Just report.

## This is to let vercel act as a monorepo

Add vercel.json to each app folder:
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
workspace packages (@crs/types, @crs/ui) resolve correctly.

Note that for each Vercel project we configured => Settings => Build and Deployment => "Skip deployments when there are no changes to the root directory or its dependencies." to _Enabled_. So that we don't deploy new Vercel releases for every push to main.

## Features
* Choose correct answer for MCQ
* Microsoft SSO

**Screenshots:**
- [ ] Auto-capture on question launch when Screenshots=On (not yet implemented)
- [ ] Upload to Supabase Storage
- [ ] URL stored on question record
