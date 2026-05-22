# Changes

## 2026-05-22 (migration consolidation)
- Replaced all 7 migration files with 5 clean files (001–005); fresh-create style, no ALTER statements, TA included from the start: 001_schema.sql (all tables including course_invitations), 002_helpers.sql (is_enrolled_as + handle_new_user trigger), 003_policies.sql (all RLS policies), 004_realtime.sql (unchanged content), 005_storage.sql (unchanged content)

## 2026-05-22
- Added migration 06: extended enrollments.role CHECK to include 'TA'; created course_invitations table (course_id, email, role, invited_by, UNIQUE course_id+email); created is_enrolled_as() SECURITY DEFINER helper to avoid RLS recursion; added RLS policies for course_invitations (INSTRUCTOR-only); updated handle_new_user() auth trigger to auto-enroll new users from course_invitations on first login
- Added migration 07: dropped all existing RLS policies from migration 02; added full permission-model policies — courses (any-auth insert, enrolled-or-owner select, owner-only update/delete), enrollments (self-STUDENT insert + owner-bootstrap + INSTRUCTOR-adds-others, own-or-INSTRUCTOR select, INSTRUCTOR update/delete), crs_sessions/crs_questions (enrolled select, INSTRUCTOR-or-TA write), crs_responses/session_attendance (own insert, own-or-INSTRUCTOR/TA select)
- Added CourseInvitation interface and TA value to EnrollmentRole in packages/types/src/database.ts
- Updated design/design.md: added Permission Model section (INSTRUCTOR/TA/STUDENT capability table and RLS rule table); added course_invitations and TA role to Data Model section

## 2026-05-17 (foundation)
- Added monorepo root: pnpm-workspace.yaml, turbo.json, tsconfig.base.json, root package.json with Turborepo pipeline (^build dependency ordering ensures types build before apps)
- Added packages/types (@crs/types): canonical shared types — User, Course, Enrollment, CRSSession, CRSQuestion, CRSResponse, SessionAttendance, QuestionType, QuestionStatus, EnrollmentRole
- Added packages/ui (@crs/ui): shared React components — Button, BarChart (vertical bars-up), CountUpTimer, QRCode, QRScanner, ReconnectingIndicator
- Added supabase/migrations/01: full schema — users, courses, enrollments, crs_sessions, crs_questions (no UNIQUE on crs_responses per design), crs_responses, session_attendance; RLS enabled on all tables
- Added supabase/migrations/02: RLS policies — enrolled users read questions/sessions, instructors write, students self-insert responses, owner manages courses
- Added supabase/migrations/03: auth trigger — auto-creates public.users row on first Google SSO login
- Added supabase/migrations/04: Realtime publication — crs_questions + crs_responses enabled for live updates
- Added supabase/migrations/05: screenshots storage bucket
- Added supabase/functions/validate-qr: Deno edge function — validates qr_token against active session, upserts session_attendance
- Added supabase/functions/join-course: Deno edge function — looks up course by join_code, enrolls student as STUDENT (idempotent)

## 2026-05-17 (tauri-controller + CI)
- Built apps/tauri-controller from scratch: package.json, tsconfig.json, vite.config.ts, tailwind.config.js, postcss.config.js, index.html
- Added tauri-controller src/index.css: Tailwind base + overflow:hidden + user-select:none for toolbar feel
- Added tauri-controller src/main.tsx: StrictMode root render
- Added tauri-controller src/lib/supabase.ts: Supabase client singleton
- Added tauri-controller src/lib/session.ts: startSession, endSession, launchQuestion, closeQuestion, setResultsVisible, launchRevote, getNextSequenceNumber, generateQRToken
- Added tauri-controller src/hooks/useLiveResponses.ts: Realtime INSERT subscription, count-only (no distribution in toolbar per design), unique respondent Set
- Added tauri-controller src/hooks/useCurrentQuestion.ts: Realtime subscription to crs_questions, same pattern as faculty-pwa
- Added tauri-controller src/App.tsx: HashRouter (required for Tauri) with routes: / → ToolbarApp, /results → ResultsWindow, /qr → QRWindow; manages auth, session, settings state; opens WebviewWindow for results/QR
- Added tauri-controller src/components/LoginView.tsx: inline horizontal Google SSO bar, 60px tall, @knox.edu only
- Added tauri-controller src/components/SessionSelector.tsx: horizontal list of instructor courses with Start session buttons, 60px tall
- Added tauri-controller src/components/ControllerToolbar.tsx: full 60px horizontal toolbar — QR | ▶/■ | ↺ (conditional) | type-select + timer | N voted | Results/Hide | ⚙; floating settings panel below gear (only when idle)
- Added tauri-controller src/windows/ResultsWindow.tsx: separate Tauri window at /results; MCQ BarChart or free response list; Round 1 + Round 2 side-by-side for revotes; sets results_visible=false on window close
- Added tauri-controller src/windows/QRWindow.tsx: separate Tauri window at /qr; shows QRCode for active session's qr_token; no side effects on close
- Added tauri-controller src-tauri/tauri.conf.json: 700×60 always-on-top undecorated main window, /results and /qr windows declared
- Added tauri-controller src-tauri/capabilities/default.json: core:window permissions for create/close/show/hide/focus/always-on-top
- Added tauri-controller src-tauri/Cargo.toml, src/lib.rs, src/main.rs, build.rs: minimal Tauri v2 Rust scaffold
- Added .github/workflows/ci.yml: typecheck-and-build job (packages → typecheck → web apps); accessibility job (axe-core via Playwright, hard-blocks on WCAG violations)
- Added scripts/axe-check.mjs: ESM axe-core runner used by CI, exits 1 on any violation
- Added @axe-core/playwright, playwright, wait-on to root package.json devDependencies for CI

## 2026-05-17 (faculty-dashboard)
- Added faculty-dashboard src/vite-env.d.ts: Vite client type reference
- Added faculty-dashboard src/hooks/useSession.ts: onAuthStateChange hook returning { user, loading }
- Added faculty-dashboard src/App.tsx: BrowserRouter with ProtectedRoute, routes for /login, /courses, /courses/:courseId, /courses/:courseId/sessions/:sessionId
- Added faculty-dashboard src/pages/LoginPage.tsx: Google SSO sign-in, Knox branding
- Added faculty-dashboard src/pages/CoursesPage.tsx: list instructor courses, inline create-course form with join_code generation and INSTRUCTOR enrollment
- Added faculty-dashboard src/pages/CourseView.tsx: join code display, student roster table, sessions table with duration/question count/attendance, per-session export buttons
- Added faculty-dashboard src/pages/SessionDetailPage.tsx: session meta, export buttons, per-question breakdown (MCQ BarChart with revote side-by-side, free response table, screenshots), attendance table
- Added faculty-dashboard src/components/SessionSummaryTable.tsx: reusable question summary table with type, status, options, duration, respondent count, and flags
- Fixed faculty-dashboard tsconfig.json: added @crs/ui and @crs/types path aliases to resolve workspace packages for tsc
- Fixed faculty-dashboard exports.ts and pages: cast Supabase join results through unknown to satisfy noUncheckedIndexedAccess strict mode

## 2026-05-17
- Built apps/faculty-pwa from scratch: package.json, tsconfig.json (with @crs/* path aliases to source), vite.config.ts, tailwind.config.js, postcss.config.js, index.html, src/vite-env.d.ts, src/index.css, src/main.tsx
- Added faculty-pwa src/lib/supabase.ts: Supabase client singleton
- Added faculty-pwa src/lib/session.ts: createCourse, enrollInstructor, startSession, endSession, launchQuestion, closeQuestion, setResultsVisible, launchRevote, getNextSequenceNumber, generateJoinCode, generateQRToken
- Added faculty-pwa src/hooks/useSession.ts: auth state hook returning { user, loading }
- Added faculty-pwa src/hooks/useLiveResponses.ts: Realtime INSERT subscription, unique respondent Set, distribution map, free response list
- Added faculty-pwa src/hooks/useCurrentQuestion.ts: Realtime subscription to crs_questions for a session, returns most recent ACTIVE/CLOSED question
- Added faculty-pwa src/App.tsx: BrowserRouter with protected routes (/, /courses, /courses/new, /courses/:courseId, /courses/:courseId/session/:sessionId)
- Added faculty-pwa src/pages/LoginPage.tsx: Google SSO with @knox.edu hd constraint
- Added faculty-pwa src/pages/CoursesPage.tsx: list instructor courses, create course link
- Added faculty-pwa src/pages/CreateCoursePage.tsx: course name + default MCQ option count (2–5)
- Added faculty-pwa src/pages/CourseHomePage.tsx: join code, QR code, session history, start/resume session
- Added faculty-pwa src/pages/SessionPage.tsx: full controller — launch/stop/revote/show-hide, live BarChart, CountUpTimer, free response list, inline settings panel
- Added faculty-pwa src/components/QuestionTypeSelector.tsx: MCQ_SINGLE / MCQ_MULTI / FREE_RESPONSE radio toggle

- Built apps/student-pwa from scratch: package.json, tsconfig, vite.config (PWA manifest), tailwind, postcss, index.html
- Added src/lib/supabase.ts — createClient singleton
- Added src/lib/auth.ts — signInWithGoogle, signOut, getSession via Supabase OAuth
- Added src/lib/wakeLock.ts — acquireWakeLock/releaseWakeLock, non-fatal if unavailable
- Added src/hooks/useSession.ts — listens to onAuthStateChange, returns {user, loading}
- Added src/hooks/useActiveQuestion.ts — Realtime subscription to crs_questions for a session, returns {question, isConnected}
- Added src/hooks/useCourses.ts — fetches enrollments→courses for current user
- Added src/App.tsx — BrowserRouter with ProtectedRoute wrapper and all 5 routes
- Added src/pages/LoginPage.tsx — Google SSO sign-in, Knox branding
- Added src/pages/CoursesPage.tsx — lists enrolled courses, join-course edge function call
- Added src/pages/CourseHomePage.tsx — shows active session banner, session history, QR scan button
- Added src/pages/SessionPage.tsx — live voting screen: PENDING/ACTIVE/CLOSED states, Realtime vote count, results bar chart and free response list
- Added src/pages/QRScanPage.tsx — QRScanner wrapper, calls validate-qr edge function, success/error states
- Added src/components/QuestionView.tsx — MCQ_SINGLE, MCQ_MULTI, FREE_RESPONSE question UIs with upsert logic
