# CRS — Classroom Response System
## Design Document v0.4

> Minimal, faculty-controlled CRS. Replaces iClicker for peer instruction workflows.
> Open source. Self-hostable. Name TBD — not SMIDGE (taken by a maga-adjacent meme coin, incredibly).

---

## Overview

A lightweight classroom response system for live voting during lecture. Faculty launch questions from a floating desktop controller (Tauri) or phone (PWA) — both surfaces are always active controllers simultaneously. Students respond on their phones via a web app — no app install required. Results flow into a CSV for gradebook import.

Designed for peer instruction (PI): the same question is asked twice, with a discussion period between rounds. Both rounds are stored separately.

This is the minimal viable product — a standalone CRS with no LMS features. The data model is a deliberate subset of the full LMS schema, designed so that LMS features can be added later without breaking anything.

---

## Guiding Principles

- **No pre-planning required** — faculty launch questions live, not from a pre-built bank
- **Phone is the student device** — no hardware, no app install, just a URL
- **Peer instruction is first-class** — revote is a single button, not a workaround
- **Count up, never down** — timers count up from zero; countdown timers create anxiety
- **Export everything** — CSV download is always available, no hoops
- **Knox-first** — v1 restricts to `@knox.edu` Google SSO accounts; multi-institution is v2
- **Open source, self-hostable** — MIT license, runs on Supabase + Vercel or self-hosted

---

## Tech Stack

| Layer | Tool | Notes |
|---|---|---|
| Database | Supabase (Postgres) | Auth, Realtime, Storage, RLS |
| Frontend | React + Vite | Shared component library across apps |
| Hosting | Vercel | Student PWA + Faculty apps |
| Desktop controller | Tauri | Always-on-top instructor widget |
| Auth | Supabase Auth + Google SSO | Knox Google Workspace accounts |
| Screenshots | Supabase Storage | Optional, attached to questions |

---

## Data Model

### Users and Courses

```sql
users
  id          uuid PK (managed by Supabase Auth)
  email       text NOT NULL  -- must be @knox.edu for v1
  name        text NOT NULL
  created_at  timestamptz DEFAULT now()

courses
  id                   uuid PK DEFAULT gen_random_uuid()
  name                 text NOT NULL  -- freeform, e.g. "CSCI 241 Databases Winter 26"
  owner_id             uuid FK → users.id
  join_code            text NOT NULL UNIQUE  -- short random string e.g. "X7K2M"
  default_option_count integer DEFAULT 5  -- used when launching MCQ, overridable per question
  created_at           timestamptz DEFAULT now()
  -- future SMIDGE fields (nullable, unused in v1):
  institution_id        uuid nullable
  academic_year_term_id uuid nullable

enrollments
  id          uuid PK DEFAULT gen_random_uuid()
  course_id   uuid FK → courses.id
  user_id     uuid FK → users.id
  role        text CHECK (role IN ('INSTRUCTOR', 'STUDENT'))
  enrolled_at timestamptz DEFAULT now()
  UNIQUE (course_id, user_id)
```

### CRS Session and Questions

```sql
crs_sessions
  id          uuid PK DEFAULT gen_random_uuid()
  course_id   uuid FK → courses.id
  started_at  timestamptz DEFAULT now()
  ended_at    timestamptz nullable
  qr_token    text NOT NULL UNIQUE  -- for physical attendance verification
  -- no controller field needed: Tauri and Faculty PWA are always simultaneous controllers
  -- last write wins; in practice the instructor has one phone and one laptop

crs_questions
  id               uuid PK DEFAULT gen_random_uuid()
  session_id       uuid FK → crs_sessions.id
  sequence_number  integer NOT NULL  -- auto-increment within session
  type             text CHECK (type IN ('MCQ_SINGLE', 'MCQ_MULTI', 'FREE_RESPONSE'))
  option_count     integer nullable  -- 2-5 for MCQ types, null for FREE_RESPONSE
                   -- defaults from courses.default_option_count, overridable per question
  multi_answer     boolean DEFAULT false
                   -- FREE_RESPONSE only: students can submit multiple separate answers
                   -- MCQ types ignore this field
  status           text CHECK (status IN ('PENDING', 'ACTIVE', 'CLOSED'))
                   DEFAULT 'PENDING'
  results_visible  boolean DEFAULT false
  parent_question_id uuid nullable FK → crs_questions.id
  is_revote        boolean DEFAULT false
  duration_seconds integer nullable
  launched_at      timestamptz nullable
  closed_at        timestamptz nullable
  screenshot_url   text nullable

crs_responses
  id           uuid PK DEFAULT gen_random_uuid()
  question_id  uuid FK → crs_questions.id
  user_id      uuid FK → users.id
  response     text NOT NULL  -- "A" through "E" or free text
  submitted_at timestamptz DEFAULT now()
  -- NO UNIQUE constraint on (question_id, user_id)
  -- Single-answer enforcement is handled at application level for MCQ types
  -- Multi-answer FREE_RESPONSE allows multiple rows per student per question
  -- "How many answered" = COUNT(DISTINCT user_id) always
```

### Attendance

```sql
session_attendance
  id          uuid PK DEFAULT gen_random_uuid()
  session_id  uuid FK → crs_sessions.id
  user_id     uuid FK → users.id
  scanned_at  timestamptz DEFAULT now()
  scan_token  text NOT NULL  -- the qr_token they submitted, for audit trail
  UNIQUE (session_id, user_id)  -- one scan per student per session
```

---

## Applications

### 1. Student PWA

**URL:** TBD — Vercel deployment URL, custom domain later
**Device:** Phone, portrait orientation
**Auth:** Google SSO (Knox account)

**Screens:**

```
Home
  └── List of enrolled courses
  └── "Join a course" — enter join_code

Course Home
  └── "Scan QR" button — always available during active session, anytime not just at start
  └── Waiting screen — "Waiting for next question"
  └── Active question — appears instantly via Supabase Realtime

MCQ_SINGLE Question Screen
  └── Large A B C D E buttons (showing option_count options only)
  └── Tap to select — highlights chosen option
  └── Can change selection until question closes
  └── Question closes → shows "You voted B. Waiting for results."
  └── Instructor clicks Show → vertical bar chart appears
  └── Instructor hides → bar chart disappears, back to "You voted B."

MCQ_MULTI Question Screen
  └── A B C D E as checkboxes — multiple selections allowed
  └── Can change selections until question closes
  └── Same post-close flow as MCQ_SINGLE

Free Response Screen
  └── Textarea
  └── Submit button — can resubmit until question closes (last submission wins)
  └── Question closes → "You responded. Waiting for results."
  └── Instructor clicks Show → scrolling list of all responses appears

QR Scan
  └── Camera activates via getUserMedia — no app install needed
  └── jsQR decodes QR code client-side
  └── Posts qr_token to Supabase edge function
  └── Confirms physical attendance marked
  └── Can scan anytime during the session, not just at start
```

**Student state machine (MCQ):**
```
Waiting → [Question launched] → Voting (can change answer freely)
  → [Question closed] → "You voted B. Waiting for results."
  → [Instructor shows] → Bar chart visible + "You voted B."
  → [Instructor hides] → "You voted B. Waiting for results."
  → [Next question launched] → Voting
```

**PWA features:**
- Installable to home screen
- `navigator.wakeLock` while session active — screen never sleeps
- Push notifications for session start (v2)

---

### 2. Faculty PWA

**URL:** TBD — Vercel deployment URL, custom domain later
**Device:** Phone — always a full controller, even when Tauri is running simultaneously
**Auth:** Google SSO (Knox account)

Both Tauri and Faculty PWA are always active controllers. Either can launch, stop, show, hide. Last write wins. In practice the instructor has one phone and one laptop — simultaneous conflicting taps are not a real problem.

**Screens:**

```
Home
  └── My courses list
  └── "Create course" — name field, default_option_count setting

Course Home
  └── Session history (date, question count, attendance count)
  └── "Start session" button
  └── QR code display for active session

Active Session View
  └── [ LAUNCH MCQ / STOP ] — big button, toggles red when active
  └── [ ↺ Revote ] [ 👁 Show/Hide ] — smaller buttons
  └── [ ⚙ ] — gear icon, opens settings panel
  └── Live count: "18 voted" (no denominator — no roster)
  └── Live vertical bar chart for MCQ (always visible to instructor, private)
  └── Live scrolling free response answers
  └── Count-up timer while question is active
```

**Settings panel (⚙):**
```
Course: CSCI 241 Databases Winter 26
Join code: X7K2M

── Question settings ──────────────
MCQ option count:  [2] [3] [4] [5]
Free response:     [Single answer ●] [Multiple answers ○]
Screenshots:       [On ●] [Off ○]

── Session ────────────────────────
[End session]
```

Settings apply to the next question launched, not the current one.

---

### 3. Faculty Dashboard

**URL:** TBD — Vercel deployment URL, custom domain later
**Device:** Desktop browser
**Auth:** Google SSO (Knox account)

**Screens:**

```
Home
  └── My courses list
  └── Create course

Course View
  └── Join code display (for sharing with students)
  └── Student roster — who has joined via join_code
  └── Session list — date, duration, questions asked, students present

Session Detail
  └── Per-question breakdown
      └── Question type, option count, duration_seconds
      └── MCQ: bar chart of responses (round 1 and round 2 side by side if revote)
      └── Free response: full list of answers
      └── Screenshot if captured
  └── Attendance list — who scanned QR

CSV Export (per course)
  └── Session summary:
      student_name, email, session_date, questions_active,
      questions_answered, was_present, participation_pct
  └── Full response detail:
      student_name, email, session_date, question_sequence,
      question_type, round, response, submitted_at
  └── Course summary:
      student_name, email, sessions_attended, total_questions,
      total_answered, overall_participation_pct
```

---

### 4. Tauri Instructor Controller

**Platform:** Mac and Windows desktop app
**Size:** Horizontal toolbar, always-on-top, ~700×60px
**Auth:** Google SSO — logs in once, token persists

The Tauri widget is a horizontal toolbar that sits at the top of the screen above the browser window showing slides. It grows and shrinks horizontally, not vertically — minimal vertical footprint so it doesn't obscure slide content. Students may see it on the projector — it shows **no vote distribution** until instructor clicks Show. Live distribution is always visible privately on the instructor's phone (Faculty PWA).

Modeled on the iClicker toolbar layout.

**UI layout (horizontal, left to right):**

```
┌──────┬──────┬────────────────────────────┬───────────┬──────────┬──────┐
│  QR  │  ▶/■ │  MCQ Single  ∨   00:47     │  18 voted │  Results │  ⚙  │
└──────┴──────┴────────────────────────────┴───────────┴──────────┴──────┘
```

**Zones left to right:**

**[QR]** — tappable icon, leftmost. Clicking opens QR code in a separate popup window for students to scan. Same `qr_token` for entire session.

**[▶ / ■]** — play/stop toggle button. Green ▶ when idle (click to launch). Red ■ when question active (click to stop). This is the primary action — prominent, immediately recognizable from iClicker muscle memory.

**[MCQ Single ∨ · 00:47]** — center info zone, three parts:
- Question type label: "MCQ Single", "MCQ Multi", or "Free Response"
- Small ∨ dropdown to change type before launching (only when idle)
- Count-up timer: starts at 00:00 when question launches, increments each second, resets on stop

**[18 voted]** — live response count, updates in real time. No denominator.

**[Results]** — Show/Hide toggle. When clicked: opens results window (separate Tauri window), sets `results_visible=true`, pushes chart to student phones. Closing results window = Hide = `results_visible=false`.

**[⚙]** — gear icon, rightmost. Opens settings panel (only accessible when no question active).

**Active state appearance:**
```
┌──────┬──────┬────────────────────────────┬───────────┬──────────┬──────┐
│  QR  │  ■   │  MCQ Single      01:23     │  18 voted │  Hide    │  ⚙  │
└──────┴──────┴────────────────────────────┴───────────┴──────────┴──────┘
         red                                              (results
                                                           visible)
```

**Revote:** appears as a small button between ▶/■ and the info zone when a question has just closed. Disappears once a new question is launched. Keeps the toolbar uncluttered during active voting.

```
┌──────┬──────┬──────┬─────────────────────┬───────────┬──────────┬──────┐
│  QR  │  ▶   │  ↺   │  MCQ Single  00:00  │  18 voted │ Results  │  ⚙  │
└──────┴──────┴──────┴─────────────────────┴───────────┴──────────┴──────┘
```

**Button behaviors:**

**▶ / ■ (play/stop toggle):**
- Idle ▶: click launches question with current type and settings immediately
- Active ■ (red): click closes question, logs `closed_at`, computes `duration_seconds`
- Type and option_count come from the ∨ dropdown and ⚙ settings

**∨ type dropdown (center zone, idle only):**
- Options: MCQ Single / MCQ Multi / Free Response
- Disabled while question is active
- Selection persists within session — last used type is default for next launch

**↺ Revote (appears after question closes):**
- Relaunches same type and option_count as parent
- `is_revote=true`, `parent_question_id` set to closed question
- Disappears when next question launches

**Results (Show/Hide toggle):**
- Show: opens results window, `results_visible=true`, chart pushed to student phones
- Hide / close window: `results_visible=false`, chart yanked from student phones
- Label toggles between "Results" and "Hide"

**Results window (separate Tauri window):**
- Vertical bar chart, bars go up, A B C D E along bottom, count + percentage per bar
- Round 1 and Round 2 side by side when revote done
- Free response: scrolling list of all submitted answers
- Moveable, resizable, can go to second monitor
- Closing = Hide

**QR popup window:**
- Opens as separate small window when QR icon clicked
- Full-size QR code, closeable
- Same `qr_token` for entire session — students can scan anytime during session

**⚙ Settings panel (only when idle):**
```
Course: CSCI 241 Databases Winter 26
Join code: X7K2M

── Question settings ──────────────
MCQ option count:  [2] [3] [4] [5]
Free response:     [Single answer ●] [Multiple answers ○]
Screenshots:       [On ●] [Off ○]

── Session ────────────────────────
[End session]
```

Settings apply to the next question launched, not the current one.

**Screenshot behavior:**
- When Screenshots = On, Tauri auto-captures screen on every question launch
- Uploads PNG to Supabase Storage: `screenshots/{course_id}/{session_id}/{question_id}.png`
- URL stored in `crs_questions.screenshot_url`
- Automatic — no manual button needed

**Session management:**
- Session start: creates `crs_sessions` row, generates `qr_token`
- Session end: in ⚙ settings panel — sets `ended_at`

---

## Realtime Architecture

Supabase Realtime handles all live state changes. No custom websocket infrastructure needed.

**Question launch flow:**
1. Instructor launches question → `crs_questions.status` changes to `ACTIVE`
2. Supabase Realtime broadcasts to all subscribed clients
3. Student PWAs receive update → question appears on screen
4. Student submits/changes response → `crs_responses` row inserted or updated
5. Faculty PWA subscribed to `crs_responses` → live count and distribution update privately
6. Tauri subscribed to `crs_responses` → live count updates in widget ("18 voted", no distribution)

**Question close flow:**
7. Instructor closes question → `status` changes to `CLOSED`
8. Student PWAs receive close → input locked, "You voted B. Waiting for results."

**Show/hide results flow:**
9. Instructor clicks Show → `results_visible` flips to `true`
10. Supabase Realtime broadcasts → student PWAs render bar chart
11. Instructor closes results window → `results_visible` flips to `false`
12. Student PWAs receive update → bar chart disappears

**Concurrent connection estimate:**
- 30 students + 1 instructor phone + 1 Tauri = ~32 connections per active session
- Supabase Pro tier: 500 concurrent realtime connections
- Supports ~15 simultaneous sessions before hitting limits

---

## QR Attendance Flow

1. Instructor starts session → `qr_token` generated (UUID, single use per session)
2. QR code displayed in Faculty PWA or Tauri
3. Students open Student PWA → tap "Scan QR"
4. Browser camera activates (`getUserMedia`) — no app install
5. `jsQR` library decodes QR client-side
6. Student PWA posts `qr_token` to Supabase
7. Edge function validates token against active session for this course
8. `session_attendance` row created — student marked physically present
9. Student can now respond to questions

Physical presence is tracked independently from question responses. A student can be present but not answer (or vice versa if they somehow get the join link without scanning).

---

## Auth and Access Control

**v1 scope:** Knox Google Workspace accounts only (`@knox.edu`)

Supabase Auth with Google OAuth. On first login, `users` row created automatically. Email domain validated — non-Knox accounts rejected.

**Row Level Security (RLS) rules:**

- Students can only read `crs_questions` for sessions in courses they're enrolled in
- Students can only insert `crs_responses` for their own `user_id`
- Students cannot read other students' responses
- Instructors can read all responses for their courses
- Anyone with a valid `join_code` can enroll themselves as a STUDENT

---

## Screenshot Feature

Tauri has native screen capture access. When instructor taps Screenshot:

1. Tauri captures current screen as PNG
2. PNG uploaded to Supabase Storage at path:
   `screenshots/{course_id}/{session_id}/{question_id}.png`
3. Public URL stored in `crs_questions.screenshot_url`
4. Visible in Faculty Dashboard session detail view

Useful for post-session analysis — know what slide was on screen for each question without pre-planning.

---

## CSV Export Detail

Three export types available from Faculty Dashboard:

**Session summary** — one row per student per session:
```
student_name, email, session_date, questions_active,
questions_answered, was_present, participation_pct
```

**Full response detail** — one row per response:
```
student_name, email, session_date, question_sequence,
question_type, is_revote, parent_question_sequence,
response, submitted_at, duration_open_seconds
```

**Course summary** — one row per student for whole term:
```
student_name, email, sessions_attended, sessions_total,
total_questions, total_answered, overall_participation_pct
```

All exports download immediately. No confirmation dialogs. No hoops.

---

## Repo Structure

```
crs/
  apps/
    student-pwa/        React/Vite, phone-optimized, PWA
    faculty-pwa/        React/Vite, phone + tablet, live session control
    faculty-dashboard/  React/Vite, desktop, data export
    tauri-controller/   Tauri + React, always-on-top desktop widget
  packages/
    types/              Shared TypeScript types (Course, Session, Question, Response)
    ui/                 Shared React components (buttons, charts, QR scanner)
  supabase/
    migrations/         SQL schema files, run in order
    functions/          Edge functions
      validate-qr/      QR token validation + attendance write
      join-course/      Enroll student via join_code
  docs/
    design.md           This document
    changes.md          Changelog
    CLAUDE.md           Standing instructions for AI-assisted development
  .github/
    workflows/          CI pipeline — axe-core accessibility checks
```

---

## What This Is Not

- Not an LMS — no assignments, no gradebook, no file storage beyond screenshots
- Not a quiz builder — questions are launched live, not pre-built
- Not a polling tool — designed specifically for peer instruction in college classrooms
- Not iClicker — no hardware, no per-student subscription, no textbook publisher

---

## MVP Checklist (Pilot Fall/Winter)

**Infrastructure:**
- [ ] Supabase project setup, schema migrations, RLS policies
- [ ] Google SSO auth with Knox domain restriction (`@knox.edu`)
- [ ] axe-core in CI pipeline — blocks deployment on WCAG violations

**Core course flow:**
- [ ] Course creation with `default_option_count` setting and `join_code` generation
- [ ] Student enrollment via join_code
- [ ] Session start/end

**Questions:**
- [ ] MCQ_SINGLE launch and response (radio, upsert while active)
- [ ] MCQ_MULTI launch and response (checkboxes, upsert while active)
- [ ] FREE_RESPONSE single-answer launch and response
- [ ] FREE_RESPONSE multi-answer mode (`multi_answer=true`, multiple rows per student)
- [ ] Per-question option count override via ⚙ settings
- [ ] Supabase Realtime — questions push to students instantly
- [ ] Revote — links to parent question, same type, one button
- [ ] Count-up timer in Tauri and Faculty PWA

**Results visibility:**
- [ ] `results_visible` field on crs_questions
- [ ] Show button opens results window AND pushes to student phones
- [ ] Hide / close results window yanks chart from student phones
- [ ] Vertical bar chart in results window
- [ ] Student state machine: Voting → Closed → Results shown → Results hidden → Waiting
- [ ] Live count shows "18 voted" — no denominator anywhere

**Instructor surfaces:**
- [ ] Tauri always-on-top widget with ⚙ gear icon
- [ ] Tauri QR code collapsed/expanded
- [ ] Faculty PWA always full controller — no mode switching
- [ ] Both surfaces simultaneous controllers — last write wins
- [ ] ⚙ Settings panel identical on both: option count, single/multi answer, screenshots on/off, join code, end session

**Attendance:**
- [ ] QR code generation per session
- [ ] Student QR scan via browser camera (jsQR)
- [ ] `session_attendance` write via edge function
- [ ] Scan available anytime during session

**Screenshots:**
- [ ] Auto-capture on question launch when Screenshots=On
- [ ] Upload to Supabase Storage
- [ ] URL stored on question record

**Data export:**
- [ ] CSV session summary (per student per session)
- [ ] CSV full response detail (per response)
- [ ] CSV course summary (per student whole term)
- [ ] All exports immediate download, no hoops

**Student PWA:**
- [ ] Installable to home screen
- [ ] `navigator.wakeLock` while session active

---

*Open source. Self-hostable. Run it on our servers or yours.*
*The software is yours either way.*
