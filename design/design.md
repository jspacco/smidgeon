# Smidgeon — Classroom Response System
## Design Document v0.5

> Minimal, faculty-controlled CRS. Replaces iClicker for peer instruction workflows.
> Open source. Self-hostable. A smidgeon better than the alternative.
> Built by a faculty member, for faculty members. Not a startup. Not a vendor.

---

## Overview

A lightweight classroom response system for live voting during lecture. Faculty launch questions from a floating desktop toolbar (Tauri) or phone (PWA) — both surfaces are always active controllers simultaneously. Students respond on their phones via a web app — no app install required. Results flow into a CSV for gradebook import.

Designed for peer instruction (PI): the same question is asked twice, with a discussion period between rounds. Both rounds are stored separately.

Standalone CRS only — no LMS features. The data model is a deliberate subset of a full LMS schema so features can be added later without breaking anything.

---

## Guiding Principles

- **No pre-planning required** — faculty launch questions live, not from a pre-built bank
- **Phone is the student device** — no hardware, no app install, just a URL
- **Peer instruction is first-class** — revote is a single button, not a workaround
- **Count up, never down** — timers count up from zero; countdown timers create anxiety
- **Export everything** — CSV download is always available, no hoops
- **Knox-first** — v1 restricts to `@knox.edu` Google SSO accounts; domain restriction is one config value, easy to change for other institutions
- **Open source, self-hostable** — MIT license, runs on Supabase + Vercel or self-hosted
- **Faculty nerd aesthetic** — monospace font, thick borders, one accent color, no marketing, no upsell, no onboarding wizard. Looks like it was built by someone who cares about pedagogy, not someone who wants to sell you something.

---

## Tech Stack

| Layer | Tool | Notes |
|---|---|---|
| Database | Supabase (Postgres) | Auth, Realtime, Storage, RLS |
| Frontend | React + Vite | Shared component library across apps |
| Hosting | Vercel | Student PWA + Faculty apps |
| Desktop controller | Tauri | Always-on-top horizontal toolbar |
| Auth | Supabase Auth + Google SSO | Knox Google Workspace accounts |
| Screenshots | Supabase Storage | Optional, attached to questions |
| Email | Resend | Future use — not in v1 |

---

## Visual Design

Two themes, chosen once by faculty in settings, never changed by students:

**Terminal** — JetBrains Mono or Courier New, thick borders, no border-radius, ALL CAPS labels, one accent color, dark toolbar. Looks like a developer tool. Signals "built by a nerd, not a startup."

**Clean** — system-ui, rounded corners, same accent color, familiar app feel.

One accent color applies to both themes. Default: Hacker Cyan `#06B6D4` or faculty choice.

**Interaction model is always modern regardless of theme:**
- Touch-friendly tap targets (minimum 44px)
- Color is the primary selection indicator — NOT `[X]` checkbox notation
- Tap to select fills with accent color, white text
- Immediate visual feedback on every interaction

**Students always see Clean mode** — Terminal is faculty-side only. Student voting experience must be maximally readable on a phone in a classroom.

**Theme and accent stored on the user row:**
```sql
users
  theme   text DEFAULT 'clean' CHECK (theme IN ('clean', 'terminal'))
  accent  text DEFAULT '#06B6D4'
```

**Visual signals of faculty nerd aesthetic (both themes):**
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
  email       text NOT NULL  -- must be @knox.edu for v1; one config value to change
  name        text NOT NULL
  theme       text DEFAULT 'clean' CHECK (theme IN ('clean', 'terminal'))
  accent      text DEFAULT '#06B6D4'
  created_at  timestamptz DEFAULT now()

courses
  id                   uuid PK DEFAULT gen_random_uuid()
  name                 text NOT NULL  -- freeform, e.g. "CSCI 241 Databases Winter 26"
  owner_id             uuid FK → users.id
  join_code            text NOT NULL UNIQUE  -- permanent course enrollment code e.g. "X7K2M"
  default_option_count integer DEFAULT 5
  created_at           timestamptz DEFAULT now()
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
```

### CRS Sessions

```sql
crs_sessions
  id              uuid PK DEFAULT gen_random_uuid()
  course_id       uuid FK → courses.id
  started_at      timestamptz DEFAULT now()
  ended_at        timestamptz nullable
  qr_token        text NOT NULL UNIQUE  -- gates session access AND marks attendance
  session_code    text NOT NULL UNIQUE  -- short 4-digit text code for faculty-pwa without QR
  -- Constraint: at most one active session per course at any time
  -- Enforced by: CREATE UNIQUE INDEX one_active_session_per_course
  --              ON crs_sessions (course_id) WHERE ended_at IS NULL;
```

**Session identity:** Sessions are displayed everywhere as `started_at` in `YYYY-MM-DD HH:MM:SS` 24-hour format. No generated names. No "Session 4."

**One active session per course:** Enforced by partial unique index. Starting a new session automatically closes any open sessions for that course — no confirmation dialog.

**Reopening sessions:** Faculty can reopen a previous session. Sets `ended_at` back to null. Makes it the active session. Useful if a session was accidentally closed or class continues after a break.

**Two access codes per session:**
- `qr_token` — UUID encoded in QR, displayed in Tauri toolbar popup
- `session_code` — short 4-digit code, displayed in faculty-pwa, read aloud or put on a slide

### CRS Questions

```sql
crs_questions
  id                 uuid PK DEFAULT gen_random_uuid()
  session_id         uuid FK → crs_sessions.id
  sequence_number    integer NOT NULL  -- auto-increment within session
  type               text CHECK (type IN ('MCQ_SINGLE', 'MCQ_MULTI', 'FREE_RESPONSE'))
  option_count       integer nullable  -- 2-5 for MCQ, null for FREE_RESPONSE
                     -- defaults from courses.default_option_count, overridable per question
  multi_answer       boolean DEFAULT false
                     -- FREE_RESPONSE only: students can submit multiple separate answers
  status             text CHECK (status IN ('PENDING', 'ACTIVE', 'CLOSED')) DEFAULT 'PENDING'
  results_visible    boolean DEFAULT false
  parent_question_id uuid nullable FK → crs_questions.id  -- revote links here
  is_revote          boolean DEFAULT false
  duration_seconds   integer nullable  -- computed on close
  launched_at        timestamptz nullable
  closed_at          timestamptz nullable
  screenshot_url     text nullable

crs_responses
  id           uuid PK DEFAULT gen_random_uuid()
  question_id  uuid FK → crs_questions.id
  user_id      uuid FK → users.id
  response     text NOT NULL  -- "A" through "E" or free text
  submitted_at timestamptz DEFAULT now()
  -- NO UNIQUE constraint: MCQ single-answer enforced at application level
  -- FREE_RESPONSE multi_answer=true allows multiple rows per student
  -- Always use COUNT(DISTINCT user_id) for "how many answered"
```

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

## Student Session Access

**QR scan or session code is the ticket into the session — not just attendance.**

Students cannot enter an active session without either scanning the QR code or entering the session code. This prevents remote participation.

**Student home screen:**

```
MY COURSES

CSCI 241 Databases          [LIVE]
CSCI 101 Intro CS
PHYS 201 Mechanics

JOIN A COURSE: [______] [JOIN]
```

- Enrolled courses shown with [LIVE] badge if active session exists
- Tapping a live course goes to QR scan screen
- Tapping a non-live course shows waiting screen
- Join code input at bottom for first-time enrollment only

**Session entry flow:**

```
Student taps [LIVE] course
→ QR scan screen appears
→ Student scans QR OR enters 4-digit session code
→ validate-qr edge function validates token/code
→ session_attendance row created (method: QR or CODE)
→ Student enters session — sees waiting screen or active question
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

**URL:** TBD — Vercel deployment URL, custom domain later
**Device:** Phone, portrait orientation, Clean theme always
**Auth:** Google SSO (Knox account)

**Screens:**

```
Home
  └── List of enrolled courses with [LIVE] badge if active session
  └── "Join a course" — enter join_code for first enrollment

Course — no active session
  └── "No active session" waiting screen
  └── Session history (read only)

Course — active session, not yet entered
  └── QR scan screen (camera) OR session code entry (4 digits)
  └── Both gate session access AND mark attendance

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

Free Response
  └── Textarea, submit button
  └── Can resubmit until closed (last wins)
  └── Closes → "You responded. Waiting for results."
  └── Show → scrolling list of all responses appears
```

**Student state machine (MCQ):**
```
Not entered → [QR/code scan] → Waiting
→ [Question launched] → Voting (can change freely)
→ [Question closed] → "You voted B. Waiting for results."
→ [Show] → Bar chart visible
→ [Hide] → "You voted B. Waiting for results."
→ [Next question] → Voting
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

**URL:** TBD
**Device:** Phone — always full controller, even when Tauri is running
**Auth:** Google SSO (Knox account)
**Theme:** Faculty's chosen theme (Terminal or Clean)

Both Tauri and Faculty PWA are always active controllers. Last write wins. In practice the instructor has one phone and one laptop.

**Screens:**

```
Home
  └── My courses list
  └── "Create course" — name field, default_option_count

Course Home
  └── Session list — scrollable, newest first
      Each session shows:
        2026-01-15 09:47:00    [LIVE] [End]
        2026-01-13 09:45:00    42 min · 8 questions  [Reopen]
        2026-01-10 09:44:00    38 min · 6 questions  [Reopen]
  └── [Start New Session] button — auto-closes any open session
  └── [Reopen] on any closed session — reopens it as active

Active Session View
  └── Session datetime header: 2026-01-15 09:47:00
  └── [END SESSION] button — primary, prominent, not in settings
  └── Session code displayed: SESSION: 7842
  └── [Show QR as fullscreen] button — for projecting session code as QR
  └── [ LAUNCH MCQ / STOP ] — big button, toggles red when active
  └── [ ↺ Revote ] [ 👁 Show/Hide ] — smaller buttons
  └── [ ⚙ ] — gear icon, opens settings
  └── Live count: "18 voted"
  └── Live vertical bar chart for MCQ (instructor-private)
  └── Live scrolling free response answers
  └── Count-up timer while question active: 01:47
```

**Session code display:**
- Session code is a short 4-digit code unique to the session
- Displayed prominently in the active session view
- Faculty can project it, read it aloud, or put it on a slide
- [Show QR as fullscreen] button shows QR version for students to scan
- Both QR and 4-digit code do the same thing — gate session entry + mark attendance

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

**URL:** TBD
**Device:** Desktop browser
**Auth:** Google SSO (Knox account)

```
Home
  └── My courses list, create course

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
**Size:** Horizontal toolbar, always-on-top, ~700×60px
**Auth:** Google SSO — logs in once, token persists
**Theme:** Dark background always — regardless of faculty theme choice

The toolbar sits at the top of the screen above the browser showing slides. Students may see it on the projector — it shows **no vote distribution** until instructor clicks Show. Live distribution is always private on the instructor's phone (Faculty PWA).

**UI layout (left to right):**

```
┌──────┬──────┬──────┬────────────────────────┬───────────┬──────────┬──────────┬──────┐
│  QR  │  ▶/■ │  ↺   │  MCQ Single ∨  01:47   │  18 voted │  Results │  END     │  ⚙  │
└──────┴──────┴──────┴────────────────────────┴───────────┴──────────┴──────────┴──────┘
              (revote — appears after question closes, disappears on next launch)
```

**[QR]** — opens QR popup window. Same qr_token for entire session.

**[▶/■]** — play/stop toggle. Green ▶ idle, red ■ active.

**[↺]** — Revote. Appears after question closes. Disappears on next launch.

**[MCQ Single ∨ · 01:47]** — type label + dropdown (idle only) + count-up timer.

**[18 voted]** — live count, no denominator.

**[Results]** — Show/Hide toggle. Opens results window, pushes chart to students.

**[END]** — End Session. Primary button. Always visible when session is active. NOT in settings. Sets `ended_at = now()`.

**[⚙]** — Settings. Only accessible when no question is active.

**Results window (separate Tauri window):**
- Vertical bar chart, bars go up, A B C D E labels at bottom
- Round 1 and Round 2 side by side when revote done
- Free response: scrolling list
- Moveable, resizable, second monitor capable
- Closing = Hide = `results_visible=false`

**QR popup window:**
- Full-size QR for students to scan
- Closeable
- Same qr_token valid for entire session

**Session list in Tauri:**
- Small scrollable panel accessible from ⚙ or a dedicated session button
- Shows all sessions for current course, newest first
- [Reopen] on closed sessions, [End] on open sessions

**⚙ Settings panel:**
```
Course: CSCI 241 Databases Winter 26
Join code: X7K2M
Session code: 7842

── Question settings ──────────────
MCQ option count:  [2] [3] [4] [5]
Free response:     [Single ●] [Multiple ○]
Screenshots:       [On ●] [Off ○]
```

**Screenshot behavior:**
- Auto-captures screen on every question launch when Screenshots=On
- Uploads to Supabase Storage: `screenshots/{course_id}/{session_id}/{question_id}.png`
- URL stored on question record

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

**Session management via Realtime:**
- Both Tauri and Faculty PWA subscribed to `crs_sessions` for current course
- Session start/end/reopen broadcasts to all surfaces instantly

**Disconnect handling:**
- Students: Supabase Realtime auto-reconnects, no re-scan required
- Show reconnecting indicator, never blank screen
- Faculty surfaces: same auto-reconnect behavior

**Concurrent connection estimate:**
- 30 students + 1 instructor phone + 1 Tauri ≈ 32 connections per session
- Supabase Pro: 500 concurrent connections → ~15 simultaneous sessions

---

## QR and Session Code Flow

**Two ways students enter a session — both gate access AND mark attendance:**

**QR scan (Tauri):**
1. Faculty starts session → `qr_token` (UUID) + `session_code` (4 digits) generated
2. QR displayed in Tauri popup window
3. Student taps [LIVE] course → QR scan screen
4. Camera scans QR via jsQR
5. `validate-qr` edge function validates token
6. `session_attendance` row created (method: QR)
7. Student enters session

**Session code (faculty-pwa):**
1. Same session start — `session_code` displayed prominently in faculty-pwa
2. Faculty reads it aloud or displays it
3. Student taps [LIVE] course → scan screen → taps "Enter code instead"
4. Types 4-digit code
5. Same `validate-qr` edge function validates code
6. `session_attendance` row created (method: CODE)
7. Student enters session

**Manual attendance:**
Faculty can mark any enrolled student present from session management UI (accessibility accommodation, late arrival, camera failure).

---

## Auth and Access Control

**v1 scope:** Knox Google Workspace accounts (`@knox.edu`)
**Domain restriction:** Single config value — easy to change for other institutions

**Roles:**
- `INSTRUCTOR` — full access: manage enrollments, run sessions, download data, delete course
- `TA` — run sessions, download data; cannot manage enrollments or delete course
- `STUDENT` — respond to questions only

**RLS key rules:**
- Anyone authenticated can create a course
- Self-enrollment via join_code enforces `role = STUDENT`
- INSTRUCTOR/TA assignment only by existing INSTRUCTOR of that course
- Students can only read sessions/questions for enrolled courses
- Students can only write their own responses
- Results visibility controlled by `results_visible` field — never bypass this

---

## Edge Functions

**join-course:**
- Validates user is authenticated
- Looks up course by join_code
- Idempotent — returns existing enrollment if already enrolled
- Enforces `role = STUDENT` — cannot self-enroll as INSTRUCTOR via this function

**validate-qr:**
- Validates qr_token OR session_code against active session
- Creates `session_attendance` row
- Returns session_id so student PWA can subscribe to correct session
- Now also gates session access — not just attendance

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

**Knox domain restriction for other institutions:**
One config value in the codebase. Not scattered through multiple files. Changing it enables a new institution. Multi-institution support is v2 but the path is clear.

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
    tauri-controller/   Tauri + React, always-on-top horizontal toolbar, dark always
  packages/
    types/              Shared TypeScript types — import from here always
    ui/                 Shared React components
  supabase/
    migrations/         SQL schema files, run in order
    functions/
      validate-qr/      QR token/session code validation + attendance + session access
      join-course/      Enroll student via join_code
  design/
    design.md           This document — canonical spec
    changes.md          Changelog — updated by weirdo after every task
  CLAUDE.md             Standing instructions for AI-assisted development
  README.md             Project overview
  .gitignore
```

---

## MVP Checklist (Winter Term Pilot)

**Infrastructure:**
- [ ] Schema migrations with correct grants (authenticated, anon, service_role)
- [ ] Partial unique index: one active session per course
- [ ] Google SSO with Knox domain restriction (single config value)
- [ ] axe-core in CI pipeline — hard failure on WCAG violations
- [ ] Storage bucket with ON CONFLICT DO NOTHING

**Core course flow:**
- [ ] Course creation with join_code and default_option_count
- [ ] Student enrollment via join_code (STUDENT role enforced)
- [ ] INSTRUCTOR/TA assignment by course owner

**Session management:**
- [ ] Start session — generates qr_token (UUID) and session_code (4 digits)
- [ ] Auto-close open sessions on new session start
- [ ] Reopen closed session (sets ended_at = null)
- [ ] End Session as primary button in faculty-pwa AND Tauri toolbar
- [ ] Session list scrollable newest-first in both surfaces
- [ ] Session datetime display: YYYY-MM-DD HH:MM:SS 24-hour

**Student session access:**
- [ ] Home screen shows enrolled courses with [LIVE] badge
- [ ] Tapping [LIVE] goes to QR scan screen
- [ ] QR scan gates session entry AND marks attendance
- [ ] 4-digit session code as alternative to QR scan
- [ ] validate-qr handles both qr_token and session_code
- [ ] Disconnect reconnects automatically — no re-scan
- [ ] Faculty manual attendance marking

**Questions:**
- [ ] MCQ_SINGLE (radio, upsert while active)
- [ ] MCQ_MULTI (checkboxes, upsert while active)
- [ ] FREE_RESPONSE single-answer
- [ ] FREE_RESPONSE multi-answer (multi_answer=true)
- [ ] Per-question option count override via ⚙
- [ ] Realtime push to students instantly
- [ ] Revote — links to parent, same type, one button
- [ ] Count-up timer driven by launched_at from database

**Results visibility:**
- [ ] results_visible field on crs_questions
- [ ] Show: opens results window + pushes to students
- [ ] Hide/close: yanks chart from students
- [ ] Vertical bar chart (bars up, labels along bottom)
- [ ] Student state machine: Not entered → Waiting → Voting → Closed → Results → Waiting

**Instructor surfaces:**
- [ ] Tauri: always-on-top horizontal toolbar, dark background
- [ ] Tauri: QR popup window
- [ ] Tauri: results window (separate, moveable)
- [ ] Tauri: End Session as primary toolbar button
- [ ] Faculty PWA: session code displayed prominently
- [ ] Faculty PWA: [Show QR as fullscreen] button
- [ ] Faculty PWA: End Session as primary button (not in settings)
- [ ] Both: live count "18 voted" (no denominator)
- [ ] Both: session list with Reopen/End per session

**Screenshots:**
- [ ] Auto-capture on question launch when Screenshots=On
- [ ] Upload to Supabase Storage
- [ ] URL stored on question record

**Visual design:**
- [ ] Terminal and Clean themes implemented
- [ ] Students always see Clean
- [ ] Faculty theme/accent stored on user row
- [ ] Timestamps in 24-hour format everywhere
- [ ] Monospace font in Terminal mode
- [ ] Touch targets minimum 44px everywhere

**Data export:**
- [ ] CSV session summary
- [ ] CSV full response detail
- [ ] CSV course summary
- [ ] CSV all sessions (whole term in one file)
- [ ] All exports immediate download, no hoops

**Student PWA:**
- [ ] Installable to home screen (PWA manifest)
- [ ] navigator.wakeLock while session active
- [ ] Reconnecting indicator on Realtime disconnect

---

*Open source. Self-hostable. Run it on our servers or yours.*
*The software is yours either way.*
*Built by a faculty member. Not a startup. Not a vendor.*