# TODO

## Faculty disconnect during a live session / active question
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

## Unenroll from course

## Archive course

## Sign out Button

## 