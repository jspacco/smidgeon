# Changes

## 2026-06-17 (2)

**Prompt:** for this task, read all the current migration files and create a single new migration file. this is possible because we have no actual users or clients right now, the migrations won't run correctly right now anyway, and i need to test that the migrations can be applied to an empty database to verify that self-hosting is going to work. so create a single 001_schema.sql with everything in it, and delete the rest of the migrations.

- `supabase/migrations/001_schema.sql` — consolidated all 10 migrations into one fresh-database schema file; folded all ALTER TABLE increments directly into CREATE TABLE definitions; removed backfill-only UPDATE statements (not needed on empty DB)
- `supabase/migrations/002–010` — deleted

## 2026-06-17

**Prompt:** Faculty Email Whitelist via Supabase "Before User Created" Auth Hook — adds a proper server-side allowlist using Supabase's Before User Created Auth Hook implemented as a Postgres function. The hook runs before a new user row is created in auth.users, inspects the incoming user's email, and rejects the signup outright by returning an error if the email is not in the whitelist. VITE_ALLOWED_DOMAIN is NOT removed; it remains as a future configuration knob for institutions self-hosting their own instance. Step 1: new migration — faculty_whitelist table. Step 2: hook function. Step 3: seed initial whitelist entries. Step 4: document manual dashboard step. Step 5: update LoginPage error handling. Step 6: leave VITE_ALLOWED_DOMAIN logic untouched.

**Why:** VITE_ALLOWED_DOMAIN passes an `hd` parameter hint to Google OAuth but provides no real app-controlled enforcement — it is only a hint to Google's account-picker UI, and Google's own infrastructure handles cross-Workspace-domain rejection inconsistently (e.g. a 2FA push notification that leads to a dead end). The Before User Created hook is a true server-side boundary: a rejected user never gets a valid session in the first place.

**Payload correction:** The draft in the task used `event->'claims'->>'email'` for the hook payload path. Verified against live Supabase docs — the correct path is `event->'user'->>'email'`. The migration uses the correct path.

**Changes:**
- `supabase/migrations/010_faculty_whitelist.sql` — new migration: faculty_whitelist table, hook_restrict_signup_to_whitelist function with correct payload path (event->'user'->>'email'), required grants, seed row for jspacco@knox.edu
- `apps/student-pwa/src/pages/AuthCallback.tsx` — destructure error from getSession(), pass to /login via router state on failure
- `apps/faculty-pwa/src/pages/AuthCallback.tsx` — same
- `apps/faculty-dashboard/src/pages/AuthCallback.tsx` — same
- `apps/student-pwa/src/pages/LoginPage.tsx` — read initial error from router location state
- `apps/faculty-pwa/src/pages/LoginPage.tsx` — same
- `apps/faculty-dashboard/src/pages/LoginPage.tsx` — same
- `apps/tauri-controller/src/App.tsx` — capture error from exchangeCodeForSession(), thread into LoginView via props
- `apps/tauri-controller/src/components/LoginView.tsx` — accept initialError/onClearError props, display hook rejection message
- `design/TODO.md` — added manual setup section: enable hook in dashboard, verify seed email
