# Smidgeon — Classroom Response System
## Design Document v2

> Minimal, faculty-controlled CRS. Replaces iClicker for peer instruction workflows.
> Open source. Self-hostable. A smidgeon better than the alternative.
> Built by a faculty member, for faculty members. Not a startup. Not a vendor.

---

## Overview

A lightweight classroom response system for live voting during lecture. Faculty launch questions from a floating desktop toolbar (Tauri) or phone (PWA) — both surfaces are always active controllers simultaneously. Students respond on their phones via a web app — no app install required. Results flow into a Postgres DB and export to CSV for gradebook import.

Designed for peer instruction (PI): the same question is asked twice, with a discussion period between rounds. Both rounds are stored separately. Revote button relaunches the previous question and links to the current question.

Standalone CRS only — no LMS features.

---

## Guiding Principles

- **No pre-planning required** — faculty launch questions live, not from a pre-built bank
- **Phone is the student device** — no hardware, no app install, just a URL or QR code
- **Peer instruction is first-class** — revote is a single button
- **Count up, never down** — timers count up from zero; countdown timers create anxiety
- **Export everything** — CSV download is always available, no hoops
- **Domain-configurable auth** — `VITE_ALLOWED_DOMAIN` env var restricts Google SSO to a specific domain (e.g. `knox.edu`); unset means any Google account is accepted; one config value to change per institution
- **Open source, self-hostable** — AGPL-3.0 license, runs on Supabase + Vercel or self-hosted
- **Faculty nerd aesthetic** — monospace font, thick borders, one accent color, no marketing, no upsell, no onboarding wizard. Looks like it was built by someone who cares about pedagogy, not someone who wants to sell you something.

---

## Tech Stack

| Layer | Tool | Notes |
|---|---|---|
| Database | Supabase (Postgres) | Auth, Realtime, Storage, RLS |
| Frontend | React + Vite | Shared component library across apps |
| Hosting | Vercel | Student PWA + Faculty apps |
| Desktop controller | Tauri v2 | Always-on-top horizontal toolbar |
| Auth | Supabase Auth + Google SSO | PKCE flow; domain restriction via VITE_ALLOWED_DOMAIN |
| Screenshots | Supabase Storage | Optional, attached to questions (not yet implemented) |
| Email | Resend | Future use — not in v1 |

---

## Visual Design

**Clean** — system-ui, rounded corners, main accent color Hacker Blue `#00BFFF`, secondary accent Knox Gold `#F7A800`,familiar app feel.

**Interaction model is always modern regardless of theme:**
- Touch-friendly tap targets (minimum 44px)
- Color is the primary selection indicator — NOT `[X]` checkbox notation
- Tap to select fills with accent color, white text
- Immediate visual feedback on every interaction

**Theme and accent stored on the user row:**

Eventually we hope to add other visual themes, but these are as yet unimplemented.

```sql
users
  theme   text DEFAULT 'clean' CHECK (theme IN ('clean', 'terminal'))
  accent  text DEFAULT '#00BFFF'
```

**Visual signals of faculty nerd aesthetic:**
- Timestamps in 24-hour time: `2026-01-15 09:47:00`
- Sessions identified by datetime, not generated names
- Version number visible: `v0.1`
- Copy is direct: "0 voted" not "0 responses recorded"
- Separator conventions: `CSCI 241 // DATABASES` not "Course: Introduction to Databases"
- No onboarding tooltips, no empty state illustrations, no "get started" wizards
- No animations except functional ones (question appearing, response confirming)

---

## Data Model

### Users and Courses

```sql
users
  id          uuid PK (managed by Supabase Auth)
  email       text NOT NULL
  name        text NOT NULL
  theme       text DEFAULT 'clean' CHECK (theme IN ('clean', 'terminal'))
  accent      text DEFAULT '#06B6D4'
  created_at  timestamptz DEFAULT now()

courses
  id                    uuid PK DEFAULT gen_random_uuid()
  name                  text NOT NULL  -- freeform, e.g. "CSCI 241 Databases Winter 26"
  owner_id              uuid FK → users.id
  join_code             text NOT NULL UNIQUE  -- permanent course enrollment code e.g. "X7K2M"
  default_option_count  integer DEFAULT 5
  default_multi_answer  boolean NOT NULL DEFAULT true  -- default free response mode per course
  archived_at           timestamptz DEFAULT NULL  -- soft delete; archived courses hidden from lists
  created_at            timestamptz DEFAULT now()
  -- future SMIDGE LMS fields (nullable, unused in v1):
  institution_id        uuid nullable
  academic_year_term_id uuid nullable

enrollments
  id          uuid PK DEFAULT gen_random_uuid()
  course_id   uuid FK → courses.id
  user_id     uuid FK → users.id
  role        text CHECK (role IN ('INSTRUCTOR', 'TA', 'STUDENT'))
  enrolled_at timestamptz DEFAULT now()
  UNIQUE (course_id, user_id)

course_invitations
  id          uuid PK DEFAULT gen_random_uuid()
  course_id   uuid FK → courses.id
  email       text NOT NULL
  role        text CHECK (role IN ('INSTRUCTOR', 'TA', 'STUDENT'))
  invited_by  uuid FK → users.id
  UNIQUE (course_id, email)
  -- on first login, handle_new_user trigger auto-enrolls new users from this table
```

### CRS Sessions

```sql
crs_sessions
  id              uuid PK DEFAULT gen_random_uuid()
  course_id       uuid FK → courses.id
  started_at      timestamptz DEFAULT now()
  ended_at        timestamptz nullable
  qr_token        text NOT NULL UNIQUE  -- UUID encoded in QR code
  session_code    text NOT NULL UNIQUE  -- 6-digit numeric code (100000–999999)
  -- Constraint: at most one active session per course at any time
  -- Enforced by: CREATE UNIQUE INDEX one_active_session_per_course
  --              ON crs_sessions (course_id) WHERE ended_at IS NULL;
```

**Session identity:** Sessions are displayed everywhere as `started_at` in `YYYY-MM-DD HH:MM:SS` 24-hour format. No generated names. No "Session 4."

**One active session per course:** Enforced by partial unique index. Starting a new session automatically closes any open sessions for that course — no confirmation dialog.

**Reopening sessions:** Faculty can reopen a previous session. Sets `ended_at` back to null. Makes it the active session. Useful if a session was accidentally closed or class continues after a break.

**Two access codes per session:**
- `qr_token` — UUID encoded in QR, displayed in Tauri toolbar popup window
- `session_code` — 6-digit numeric code, displayed in faculty-pwa, read aloud or put on a slide or written on the board

### CRS Questions

```sql
crs_questions
  id                 uuid PK DEFAULT gen_random_uuid()
  session_id         uuid FK → crs_sessions.id
  sequence_number    integer NOT NULL  -- auto-increment within session
  type               text CHECK (type IN ('MCQ_SINGLE', 'MCQ_MULTI', 'FREE_RESPONSE'))
  option_count       integer nullable  -- 2-5 for MCQ, null for FREE_RESPONSE
                     -- defaults from courses.default_option_count, overridable per question
  multi_answer       boolean DEFAULT true
                     -- FREE_RESPONSE only: true = multiple submissions per student allowed
                     -- defaults from courses.default_multi_answer, overridable per question
  status             text CHECK (status IN ('PENDING', 'ACTIVE', 'CLOSED')) DEFAULT 'PENDING'
  results_visible    boolean DEFAULT false
  parent_question_id uuid nullable FK → crs_questions.id  -- revote links here
  is_revote          boolean DEFAULT false
  duration_seconds   integer nullable  -- computed on close
  launched_at        timestamptz nullable
  closed_at          timestamptz nullable
  screenshot_url     text nullable  -- not yet implemented

crs_responses
  id           uuid PK DEFAULT gen_random_uuid()
  question_id  uuid FK → crs_questions.id
  user_id      uuid FK → users.id
  response     text NOT NULL  -- "A" through "E" or free text
  submitted_at timestamptz DEFAULT now()
  -- NO UNIQUE constraint: MCQ single-answer enforced at application level via upsert
  -- FREE_RESPONSE multi_answer=true allows multiple rows per student
  -- Always use COUNT(DISTINCT user_id) for "how many answered"
```

**Free response behavior:**
- `multi_answer=false` — single answer per student; upserts on resubmit; textarea pre-populated with existing answer on load
- `multi_answer=true` — multiple rows per student allowed; textarea clears after each submit; shows "N responses submitted" count

### Attendance

```sql
session_attendance
  id          uuid PK DEFAULT gen_random_uuid()
  session_id  uuid FK → crs_sessions.id
  user_id     uuid FK → users.id
  scanned_at  timestamptz DEFAULT now()
  scan_token  text NOT NULL  -- qr_token or session_code they submitted, for audit trail
  method      text CHECK (method IN ('QR', 'CODE'))  -- how they scanned in
  UNIQUE (session_id, user_id)
```

### Schema Constraints

```sql
-- Enforce one active session per course at a time
CREATE UNIQUE INDEX one_active_session_per_course
  ON crs_sessions (course_id)
  WHERE ended_at IS NULL;

-- Grant table access to Supabase roles
-- Required after any DROP SCHEMA public CASCADE
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;
```

---

## Permission Model

| Action | INSTRUCTOR | TA | STUDENT |
|---|---|---|---|
| Create course | ✓ | ✓ | ✓ |
| Manage enrollments | ✓ | — | — |
| Delete/archive course | ✓ | — | — |
| Run sessions | ✓ | ✓ | — |
| Download data / CSV | ✓ | ✓ | — |
| Respond to questions | — | — | ✓ |

**RLS key rules:**
- Anyone authenticated can create a course
- Self-enrollment via join_code enforces `role = STUDENT`
- INSTRUCTOR/TA assignment only by existing INSTRUCTOR of that course (via course_invitations)
- Students can only read sessions/questions for enrolled courses
- Students can only write their own responses
- Results visibility controlled by `results_visible` field — never bypass this
- Archived courses filtered out at query level (`archived_at IS NULL`)

---

## Student Session Access

**QR scan or session code is the ticket into the session — not just attendance.**

Students cannot enter an active session without either scanning the QR code or entering the session code. This prevents remote participation.

**Student home screen (landing page):**

```
smidgeon

[Scan QR code]

─── or enter code ───

[ 000000 ]

[Join session]
```

- Single screen shown immediately after login — no course list, no enrollment list
- QR scan button activates camera inline
- 6-digit numeric input for code entry
- Auto-enrollment: validate-qr enrolls the student in the course on first join (role: STUDENT)
- Session ended: student is returned here with a brief "Session ended" message
- Students never manually manage course enrollments

**Session entry flow:**

```
Student opens app → landing page
→ Scans QR OR types 6-digit session code
→ validate-qr edge function validates token/code
→ Auto-enrolls student in course if not already enrolled
→ session_attendance row created (method: QR or CODE)
→ Student enters session — sees waiting screen or active question
→ When ended_at set on session → returned to landing page ("Session ended")
```

**If student disconnects mid-session:**
Attendance is already recorded. Student reconnects via Realtime automatically — no re-scan required.

**Faculty manual attendance:**
Faculty can mark a student present from the session management UI (accessibility accommodation, camera failure, late arrival after QR window).

**Students always see live response count for their own answer:**
"You voted B. Waiting for results." They do NOT see the distribution until instructor clicks Show.

---

## Applications

### 1. Student PWA

**URL:** `smidgeon.app`
**Device:** Phone, portrait orientation, Clean theme always
**Auth:** Google SSO (domain restricted by `VITE_ALLOWED_DOMAIN` if set)

**Screens:**

```
Login
  └── "Smidgeon Student" branding
  └── [Sign in with Google] button

Landing (home)
  └── "smidgeon" wordmark (h1)
  └── [Scan QR code] button — activates camera inline
  └── "or enter code" divider
  └── 6-digit numeric input + [Join session] button
  └── "Session ended" message if returned from a closed session
  └── Auto-enrollment handled by validate-qr — no separate join flow

Active Session — waiting
  └── "Waiting for next question" — course name, session datetime

MCQ_SINGLE Question
  └── Large A B C D E buttons (option_count options only)
  └── Tap to select — fills with accent color, white text
  └── Can change selection until question closes
  └── Closes → "You voted B. Waiting for results."
  └── Show → vertical bar chart appears
  └── Hide → bar chart disappears

MCQ_MULTI Question
  └── A B C D E as checkboxes — multiple selections
  └── Same post-close flow as MCQ_SINGLE

Free Response (single-answer)
  └── Textarea pre-populated with existing answer on load
  └── Upserts on resubmit — "Update response" button label after first submit
  └── Closes → "You responded. Waiting for results."

Free Response (multi-answer)
  └── Textarea clears after each submit
  └── Shows "N responses submitted" count
  └── Closes → "You responded. Waiting for results."
  └── Show → scrolling list of all responses appears
```

**Student state machine (MCQ):**
```
Landing → [QR/6-digit code] → Waiting
→ [Question launched] → Voting (can change freely)
→ [Question closed] → "You voted B. Waiting for results."
→ [Show] → Bar chart visible
→ [Hide] → "You voted B. Waiting for results."
→ [Next question] → Voting
→ [Session ended] → Landing ("Session ended")
```

**PWA features:**
- Installable to home screen
- `navigator.wakeLock` while session active
- Realtime reconnects automatically after disconnect — no re-scan required

**Disconnect handling:**
- Show reconnecting indicator, not blank screen
- Reconnect automatically via Supabase Realtime
- Never require re-scan after disconnect

---

### 2. Faculty PWA

**URL:** `faculty.smidgeon.app`
**Device:** Phone — always full controller, even when Tauri is running
**Auth:** Google SSO (domain restricted by `VITE_ALLOWED_DOMAIN` if set)
**Theme:** Faculty's chosen theme (Terminal or Clean)

Both Tauri and Faculty PWA are always active controllers. Last write wins. In practice the instructor has one phone and one laptop.

**Screens:**

```
Home (Courses)
  └── "{username}'s Courses" heading
  └── Course list (archived courses hidden)
  └── "+ Create course" toggle — name field, default_option_count, default_multi_answer
  └── Logout button

Course Home
  └── Session list — scrollable, newest first
      Each session shows:
        2026-01-15 09:47:00    [LIVE] [End]
        2026-01-13 09:45:00    42 min · 8 questions  [Reopen]
        2026-01-10 09:44:00    38 min · 6 questions  [Reopen]
  └── [Start New Session] button — auto-closes any open session
  └── [Reopen] on any closed session — reopens it as active

Active Session View — Control mode
  └── Session datetime header: 2026-01-15 09:47:00
  └── [END SESSION] button — primary, prominent, not in settings
  └── Session code displayed prominently: SESSION: 784291
  └── [Show QR as fullscreen] button — fullscreen overlay with large QR + code
  └── [ LAUNCH MCQ / STOP ] — big button, toggles red when active
  └── [ ↺ Revote ] [ 👁 Show/Hide ] — smaller buttons
  └── [ ⚙ ] — gear icon, opens settings (only when no question active)
  └── Live count: "18 voted"
  └── Live vertical bar chart for MCQ (instructor-private)
  └── Live scrolling free response answers
  └── Count-up timer while question active: 01:47
  └── Attendance section (collapsible): enrolled students with ✓ Present or [Mark present]

Active Session View — Monitor mode
  └── Immersive full-screen chart + vote count
  └── Revote + Show/Hide results at bottom
  └── Settings gear hidden
  └── Wake lock acquired
```

**Monitor/Control toggle:**
- Faculty PWA has a Monitor/Control toggle in the session header
- Monitor mode: immersive view optimized for watching results, wake lock active
- Control mode: full launch/stop/settings controls
- When a new session starts (auto-joined via Realtime), initializes in Monitor mode

**Settings panel (⚙ — only when no question active):**
```
Course: CSCI 241 Databases Winter 26
Join code: X7K2M

── Question settings ──────────────
MCQ option count:  [2] [3] [4] [5]
Free response:     [Single ●] [Multiple ○]
Screenshots:       [On ●] [Off ○]

── Appearance ─────────────────────
Theme: [Terminal ●] [Clean ○]
Accent: [color picker]
```

End Session is NOT in settings. It is a primary button in the main session view.

---

### 3. Faculty Dashboard

**URL:** `dashboard.smidgeon.app`
**Device:** Desktop browser
**Auth:** Google SSO (domain restricted by `VITE_ALLOWED_DOMAIN` if set)

```
Home
  └── My courses list (archived courses hidden)
  └── "+ Create Course" toggle — inline form, hides on success
  └── Archive course button per row — inline confirm, soft-deletes via archived_at

Course View
  └── Join code display
  └── Student roster (enrolled via join_code)
  └── Session list — all sessions, scrollable
      Each shows: datetime, duration, questions asked, students present
      [Export CSV] per session

Session Detail
  └── Per-question breakdown
      └── Question type, option count, duration_seconds
      └── MCQ: vertical bar chart (round 1 and round 2 side by side if revote)
      └── Free response: full answer list
      └── Screenshot if captured
  └── Attendance list

CSV Export
  └── Per-session: student, questions_active, questions_answered, was_present, participation_pct
  └── Full detail: student, question_sequence, type, round, response, submitted_at
  └── Course summary (whole term): student, sessions_attended, total_questions, total_answered, pct
  └── All sessions export: all of the above for all sessions in one file
  └── All exports download immediately, no confirmation dialogs
```

---

### 4. Tauri Instructor Controller

**Platform:** Mac and Windows desktop
**Size:** Horizontal toolbar, always-on-top, 480×60px (login state: 480×340px)
**Auth:** Google SSO via loopback OAuth (http://127.0.0.1:{port}) — PKCE flow
**Theme:** Dark background always — regardless of faculty theme choice

The toolbar sits at the top of the screen above the browser showing slides. Students may see it on the projector — it shows **no vote distribution** until instructor clicks Show. Live distribution is always private on the instructor's phone (Faculty PWA).

**Auth flow:**
1. App launches at 480×340 showing login UI inline (no popup window)
2. "Sign in with Google" calls `start_oauth` Rust command → gets loopback port
3. `signInWithOAuth` with `skipBrowserRedirect: true` → gets OAuth URL
4. `open(url)` via `@tauri-apps/plugin-shell` opens system browser
5. User completes Google sign-in in browser
6. Browser redirects to `http://127.0.0.1:{port}?code=...`
7. Rust captures URL, emits `oauth-callback` event to main window
8. Main window extracts `code` parameter, calls `exchangeCodeForSession(code)`
9. `onAuthStateChange` fires, window resizes to 480×60, toolbar appears
10. Session persists in localStorage — no re-login on next app launch

**Required manual setup for OAuth:**
- Supabase dashboard → Authentication → URL Configuration → Redirect URLs: add `http://127.0.0.1`
- Google Cloud Console → OAuth 2.0 Client ID → Authorized redirect URIs: add `http://127.0.0.1`

**UI layout (left to right):**

```
┌──────┬──────┬──────┬────────────────────────┬───────────┬──────────┬──────────┬──────┐
│ grip │  QR  │  ▶/■ │  ↺   │  type ∨  01:47  │  18 voted │  Results │  END     │  ⚙  │
└──────┴──────┴──────┴──────┴─────────────────┴───────────┴──────────┴──────────┴──────┘
                      (revote — appears after question closes, disappears on next launch)
```

**[grip]** — drag handle (leftmost), data-tauri-drag-region, repositions window.

**[QR]** — miniature QR canvas (40×40px, cyan on dark); clicking opens/closes full QR popup window; turns blue when open.

**[▶/■]** — play/stop split button. Left side launches current type. Right side (▾) opens type dropdown. Green ▶ idle, red ■ active. Launching a new question closes the results window if open.

**[↺]** — Revote. Appears after question closes. Disappears on next launch.

**[type ∨ · 01:47]** — type label (shown only when ACTIVE) + count-up timer.

**[18 voted]** — live count, no denominator.

**[Results]** — Show/Hide toggle. Opens results window, pushes chart to students. Closing results window sets `results_visible=false`.

**[END]** — End Session. Primary button. Always visible when session is active. NOT in settings. Closes QR and results windows. Sets `ended_at = now()`.

**[⚙]** — Settings. Only accessible when no question is active. Opens panel, resizes window to 480×340.

**Session selector (shown when logged in but no active session):**
- Course dropdown (INSTRUCTOR courses only, archived courses hidden)
- Session dropdown (newest first, limit 10, [OPEN] badge on active sessions, "— new session —" as first option)
- [▶] button — starts new session or reopens selected existing session
- [+] button — expands window to create new course (name + MCQ option count + free response mode)
- Logout button

**Results window (separate Tauri window):**
- Vertical bar chart, bars go up, A B C D E labels at bottom
- Round 1 and Round 2 side by side when revote done
- Free response: scrolling list
- Moveable, resizable, second monitor capable
- Closing = Hide = `results_visible=false`

**QR popup window:**
- Full-size QR (420×420px) for students to scan
- Session code displayed at text-6xl for projector readability
- Resizable (600×680, min 400×460)
- Closeable; toggling QR button closes existing window

**⚙ Settings panel:**
```
Course: CSCI 241 Databases Winter 26
Join code: X7K2M
Session code: 784291

── Question settings ──────────────
MCQ option count:  [2] [3] [4] [5]
Free response:     [Single ●] [Multiple ○]
Screenshots:       [On ●] [Off ○]
```

**Screenshot behavior:**
- Auto-captures screen on every question launch when Screenshots=On
- Uploads to Supabase Storage: `screenshots/{course_id}/{session_id}/{question_id}.png`
- URL stored on question record
- **Not yet implemented** — stub in handleLaunch, requires native Tauri screenshot plugin

**Timer:**
- Driven by `launched_at` from database, not client-side Date.now()
- Prevents clock skew between instructor and student devices

---

## Session Management Rules

1. **At most one active session per course** — enforced by partial unique index on `crs_sessions (course_id) WHERE ended_at IS NULL`

2. **Starting a new session auto-closes open sessions** — no confirmation, just closes them

3. **Reopening a session** — sets `ended_at = null`, makes it active again. Useful for accidental closes or classes that continue.

4. **End Session is a primary action** — prominent button in faculty-pwa active session view AND in Tauri toolbar. Not buried in settings.

5. **Session identity** — always displayed as `YYYY-MM-DD HH:MM:SS` in 24-hour time. No generated names.

6. **Session list** — scrollable, newest first, in both faculty-pwa and Tauri. Shows datetime, duration if closed, question count, attendance count.

---

## Realtime Architecture

**Question launch flow:**
1. Instructor launches → `crs_questions.status = ACTIVE`
2. Supabase Realtime broadcasts to all subscribed clients
3. Student PWAs receive → question appears instantly
4. Student submits/changes → `crs_responses` upserted
5. Faculty PWA → live count + distribution update (private)
6. Tauri → live count only ("18 voted", no distribution)

**Question close flow:**
7. Instructor stops → `status = CLOSED`, `closed_at` logged, `duration_seconds` computed
8. Students → input locked, "You voted B. Waiting for results."

**Show/hide results:**
9. Show → `results_visible = true` → bar chart pushed to students
10. Hide/close window → `results_visible = false` → chart yanked

**Race condition prevention:**
- student-pwa ignores Realtime updates for questions with a lower sequence_number than currently showing — prevents `results_visible=false` UPDATE on old question snapping student back to "waiting for results" mid-vote on new question

**Session management via Realtime:**
- Both Tauri and Faculty PWA subscribed to `crs_sessions` for current course
- Session start/end/reopen broadcasts to all surfaces instantly
- Faculty PWA auto-navigates to new session on INSERT (app-level hook)
- Student PWA navigates to landing on `ended_at` becoming non-null

**Disconnect handling:**
- Students: Supabase Realtime auto-reconnects, no re-scan required
- Show reconnecting indicator, never blank screen
- Faculty surfaces: same auto-reconnect behavior

**Concurrent connection estimate:**
- 30 students + 1 instructor phone + 1 Tauri ≈ 32 connections per session
- Supabase Pro: 500 concurrent connections → ~15 simultaneous sessions
- Overage: $10 per 1,000 additional connections

---

## QR and Session Code Flow

**Two ways students enter a session — both gate access AND mark attendance:**

**QR scan:**
1. Faculty starts session → `qr_token` (UUID) + `session_code` (6 digits) generated
2. QR displayed in Tauri popup window (or faculty-pwa fullscreen overlay)
3. Student opens app → landing page → taps [Scan QR code]
4. Camera scans QR via jsQR
5. `validate-qr` edge function validates token, auto-enrolls student
6. `session_attendance` row created (method: QR)
7. Student enters session

**Session code:**
1. Same session start — `session_code` displayed prominently in faculty-pwa and Tauri settings
2. Faculty reads it aloud or displays it
3. Student opens app → landing page → types 6-digit code
4. `validate-qr` edge function validates code, auto-enrolls student
5. `session_attendance` row created (method: CODE)
6. Student enters session

**Manual attendance:**
Faculty can mark any enrolled student present from session management UI (accessibility accommodation, late arrival, camera failure).

---

## Edge Functions

**join-course:**
- Validates user is authenticated
- Looks up course by join_code
- Idempotent — returns existing enrollment if already enrolled
- Enforces `role = STUDENT` — cannot self-enroll as INSTRUCTOR via this function

**validate-qr:**
- Validates qr_token (UUID lookup) OR session_code (active session lookup by 6-digit code)
- Auto-enrolls student in course as STUDENT if not already enrolled (upsert, ignoreDuplicates)
- Creates `session_attendance` row (method: QR or CODE)
- Returns session_id, course_id, course_name so student PWA can navigate directly
- Gates session access — not just attendance

---

## Auth and Access Control

**Domain restriction:** `VITE_ALLOWED_DOMAIN` env var. If set, passes `hd` param to Google OAuth restricting to that domain. If unset, any Google account is accepted. Set per deployment — not hardcoded.

**Supabase Auth:** PKCE flow (`flowType: 'pkce'`, `detectSessionInUrl: false`). Session stored in localStorage. Persists across app restarts.

---

## Known Edge Cases and Decisions

**Projector visibility:**
Tauri toolbar may be visible to students on projector. Therefore: toolbar shows vote count only ("18 voted"), never distribution. Distribution is private on instructor's phone always.

**Count shows no denominator:**
No roster means no denominator. Always "18 voted" never "18 / 24 voted."

**Timer driven by database:**
Count-up timer uses `launched_at` from database, not client clock. Prevents clock skew between devices.

**Free response visibility when shown:**
All student responses are visible to everyone when instructor clicks Show. This is intentional for peer instruction — you want to see what people said.

**Multiple simultaneous faculty controllers:**
Tauri and Faculty PWA both drive the same session. Last write wins. In practice one instructor has one phone and one laptop. Simultaneous conflicting taps are not a real problem.

**Session with zero questions:**
Faculty starts session, students scan in, no questions launched. Valid state — attendance recorded, question data empty. CSV export handles gracefully.

**Student arrives late:**
Faculty can redisplay QR/session code at any time from active session view. Late students scan and enter session. Attendance marked at scan time.

**Tauri OAuth loopback:**
Google does not allow custom URL schemes (e.g. `smidgeon://`) as OAuth redirect URIs. The loopback approach (`http://127.0.0.1:{port}`) is Google's recommended pattern for desktop apps. `tauri-plugin-oauth` spins up a temporary localhost server per login. The auth code (not the full URL) is passed to `exchangeCodeForSession`.

**MCQ vote changes:**
Faculty PWA bar chart handles vote changes correctly — UPDATE events decrement old answer and increment new one using a per-user response map.

---

## What This Is Not

- Not an LMS — no assignments, no gradebook, no file storage beyond screenshots
- Not a quiz builder — questions launched live, never pre-built
- Not a polling tool — built specifically for peer instruction in college classrooms
- Not iClicker — no hardware, no per-student subscription, no textbook publisher
- Not a startup — no investors, no growth metrics, no upsell screen

---

## Repo Structure

```
smidgeon/
  apps/
    student-pwa/        React/Vite, phone-optimized, Clean theme only, PWA
    faculty-pwa/        React/Vite, phone, Terminal or Clean theme
    faculty-dashboard/  React/Vite, desktop, data export
    tauri-controller/   Tauri v2 + React, always-on-top horizontal toolbar, dark always
  packages/
    types/              Shared TypeScript types — import from here always
    ui/                 Shared React components
  supabase/
    migrations/         SQL schema files, applied in order (001–009)
    functions/
      validate-qr/      QR token/session code validation + attendance + session access
      join-course/      Enroll student via join_code
  design/
    design.md           This document — canonical spec
    changes.md          Changelog — updated after every task
  scripts/
    axe-check.mjs       axe-core accessibility runner (CI, currently disabled)
  .github/
    workflows/
      ci.yml            Typecheck + build all web apps on push to main
      release.yml       Build Tauri controller for Mac + Windows on version tag push
  CLAUDE.md             Standing instructions for AI-assisted development (Weirdo)
  LICENSE.txt           GNU Affero General Public License v3.0
  README.md             Project overview
  .gitignore
```

---

## Deployment

| App | URL | Platform |
|---|---|---|
| Student PWA | smidgeon.app | Vercel |
| Faculty PWA | faculty.smidgeon.app | Vercel |
| Faculty Dashboard | dashboard.smidgeon.app | Vercel |
| Tauri Controller | GitHub Releases | Mac (.dmg), Windows (.exe/.msi) |

DNS via Cloudflare. Domain: smidgeon.app (GoDaddy, DNS delegated to Cloudflare).

Vercel projects skip deployment when no changes detected in their app directory or shared packages (built-in skip deployments feature).

GitHub Actions release workflow triggered by `v*` tags. Design document snapshot tags use `design-v*` prefix and do not trigger builds.

---

*Open source. Self-hostable. Run it on our servers or yours.*
*The software is yours either way.*
*Built by a faculty member. Not a startup. Not a vendor.*