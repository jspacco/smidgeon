# CLAUDE.md — CRS Instructor Response System

This file contains standing instructions for Claude Code (Weirdo).
Read this file first, then read `design/design.md` and `design/changes.md` before doing anything else.

---

## Start of every session

1. Read `design/design.md` — canonical spec, source of truth for all decisions
2. Read `design/changes.md` — understand what has already been built and what changed last
3. If the task conflicts with the design doc, ask before proceeding
4. If the design doc is ambiguous, ask before inventing a solution

---

## End of every task

1. Update `design/changes.md` with a brief entry:
   ```
   ## YYYY-MM-DD
   The full text of the prompt for this task, reproduced verbatim. This makes the changelog a complete record of *why* the changes were made, not just what was changed
   - What changed and why (one line per thing)
   ```
2. `git add -A`
3. `git commit -m "brief description matching changes.md entry"`

Never leave work uncommitted.
Never batch multiple features into one commit.
One logical change per commit.

---

## What this project is

A minimal classroom response system (CRS) for live voting during college lectures.
Faculty launch questions from a Tauri desktop toolbar or phone PWA.
Students respond on their phones via a web app — no install required.
Designed specifically for peer instruction (PI) workflows.

This is NOT an LMS. No assignments, no gradebook, no file storage beyond screenshots.
See `design/design.md` for full feature spec.

---

## Repo structure

```
apps/
  student-pwa/        React/Vite — student response app, phone-optimized, PWA
  faculty-pwa/        React/Vite — faculty controller app, phone
  faculty-dashboard/  React/Vite — data export and session history, desktop
  tauri-controller/   Tauri + React — always-on-top horizontal toolbar, desktop
packages/
  types/              Shared TypeScript types — import from here, never redefine locally
  ui/                 Shared React components — buttons, charts, QR scanner
supabase/
  migrations/         SQL schema files, applied in order
  functions/          Supabase edge functions
    validate-qr/      QR token validation + attendance write
    join-course/      Enroll student via join_code
design/
  design.md           Canonical design document — read this first
  changes.md          Changelog — update after every task
  CLAUDE.md           This file
.github/
  workflows/          CI pipeline
```

---

## Tech stack

- **React + Vite** — all frontend apps
- **TypeScript** — everywhere, no `any` types ever
- **Tailwind CSS** — constrained token set only, no arbitrary values
- **Supabase** — Postgres, Auth, Realtime, Storage, Edge Functions
- **Tauri** — desktop toolbar (Rust + React, uses OS webview)
- **Vercel** — hosts student-pwa, faculty-pwa, faculty-dashboard
- **Google SSO** — via Supabase Auth, Knox accounts only in v1

---

## Running locally

```bash
# Start Supabase local stack
supabase start

# Apply migrations
supabase db push

# Run a specific app
cd apps/student-pwa && npm run dev
cd apps/faculty-pwa && npm run dev
cd apps/faculty-dashboard && npm run dev

# Run Tauri (requires Rust toolchain)
cd apps/tauri-controller && cargo tauri dev
```

---

## Environment variables

Required in `.env.local` for each app — never commit `.env` files:

```
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

Tauri reads these via the Vite build during development.

---

## Shared types

All shared types live in `packages/types/`.
**Always import from `@crs/types` — never redefine Course, Session, Question, or Response locally.**

Key types:
```typescript
Course
Enrollment
CRSSession
CRSQuestion         // includes type, option_count, multi_answer, status, results_visible
CRSResponse
SessionAttendance
```

---

## Database rules

- **Never modify existing migration files** — always create a new one
- Migration filenames: `YYYYMMDD_HH_description.sql`
- Run `supabase db push` to apply locally
- **All tables have RLS enabled** — check policies before inserting
- **No UNIQUE constraint on `crs_responses`** — single-answer for MCQ enforced at application level
- MCQ answer changes while active: upsert by `(question_id, user_id)` — not insert
- FREE_RESPONSE multi-answer: multiple rows per student per question when `multi_answer=true`
- `COUNT(DISTINCT user_id)` for "how many answered" — never use raw `COUNT(*)`
- `results_visible` defaults `false` — never default to `true`
- `parent_question_id` links revotes to original question — never remove this relationship

---

## Realtime rules

- Students subscribe to `crs_questions` for their session — question status changes push instantly
- Faculty PWA and Tauri subscribe to `crs_responses` — live count updates
- `results_visible` flipping `true` pushes bar chart to student PWAs
- `results_visible` flipping `false` yanks chart from student PWAs
- Realtime subscription failures must show a visible reconnecting indicator — never a blank screen
- Never silently swallow Realtime errors

---

## UI and design rules

- **Reference UI: Google Forms** — clean, minimal, one primary action per screen
- **No modals inside modals** — ever
- **No rich text editors** — plain text and Markdown only
- **Mobile-first** — if it doesn't work on a phone it doesn't ship
- **Count-up timers only** — never countdown, never
- **Bar charts are vertical** — bars go up, category labels along the bottom
- **Live counts show "18 voted"** — never include a denominator, no roster exists
- **WCAG AA** — axe-core runs in CI and hard-blocks deployment on violations
- Tailwind only — no inline styles, no custom CSS unless unavoidable

---

## Tauri toolbar rules

- Horizontal layout — grows/shrinks horizontally, minimal vertical footprint
- Always-on-top
- No vote distribution visible in toolbar — only vote count ("18 voted")
- Distribution is private to instructor's phone (Faculty PWA)
- ⚙ gear icon only accessible when no question is active
- ▶/■ play/stop toggle is the primary action — prominent, leftish
- Revote button appears contextually after question closes, disappears on next launch
- QR opens in a separate popup window — not inline expansion

---

## Results visibility rules

- Students **never** see results during voting
- Results only visible after: question closes AND instructor clicks Show
- This is **critical for peer instruction** — do not bypass or work around this
- `results_visible=false` is the default and the safe state
- When instructor closes results window → set `results_visible=false` immediately

---

## Error handling

- All Supabase calls wrapped in `try/catch`
- User-visible errors shown inline, not console-only
- Realtime drops: show reconnecting indicator, retry automatically
- Never show raw error messages to students — generic "something went wrong, please refresh"
- Faculty surfaces can show more detail

---

## What NOT to build

- No gradebook — CSV export only
- No assignment system
- No LMS features of any kind
- No pre-built question bank — questions are launched live, not pre-planned
- No countdown timers — ever, under any circumstances
- No horizontal bar charts
- No complex animations
- No denominator in vote counts ("18 / 24" is wrong — just "18")
- No always-on-top behavior in PWA (not possible in browsers — use Tauri for that)
- No roster import — students self-enroll via join_code

---

## CI pipeline

axe-core accessibility checks run on every push.
**Violations are hard failures — they block deployment.**
Fix violations before committing if possible.
Never disable axe-core rules without explicit instruction.

---

## When in doubt

Ask. Do not invent solutions to ambiguous requirements.
Check `design/design.md` first — the answer is usually there.
If the design doc doesn't cover it, ask before building.