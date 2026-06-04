# Changes

## 2026-06-04 7
- tauri-controller tauri.conf.json: main window set to resizable=false, maximizable=false, minimizable=true; removed minWidth/maxHeight constraints; programmatic setSize() for settings panel still works

## 2026-06-04 6
- tauri-controller ControllerToolbar: resize window to 700×340 when settings panel opens and back to 700×60 when it closes, using getCurrentWindow().setSize(LogicalSize); added core:window:allow-set-size to capabilities/default.json; removed overflow-hidden from ToolbarApp wrapper div in App.tsx
- tauri-controller ControllerToolbar: removed qrWindowOpen from ControllerToolbarProps and destructured props (App.tsx was already not passing it); QR button reverts to static non-highlighted style

## 2026-06-04 5
- student-pwa useActiveQuestion: ignore Realtime updates for questions with a lower sequence_number than what is already showing; prevents race condition where the results_visible=false UPDATE on the old question arrives after the new ACTIVE question INSERT, snapping the student back to "waiting for results" mid-vote

## 2026-06-04 4
- Fixed faculty-pwa bar chart not updating when a student changes their MCQ vote: added UPDATE event handler to useLiveResponses.ts; handler decrements the old answer and increments the new one using a per-user response map; also added userResponseRef tracking to INSERT handler and initial load for robustness

## 2026-06-04 3
- tauri-controller: launching a new vote now closes the results window if it is open

## 2026-06-04 2
- tauri-controller QRWindow: added useEffect listening for tauri://close-requested and calling getCurrentWindow().close(); added core:window:allow-on-close-requested to capabilities/default.json

## 2026-06-04
- student-pwa CoursesPage: "My Courses" heading replaced with "{username}'s Courses" using email prefix from useSession

## 2026-06-03 9
- faculty-pwa CoursesPage: header now shows "{username}'s Courses" (email prefix) on the left; "+ Create course" and "− Logout" buttons on the right; logout calls supabase.auth.signOut() and redirects to /

## 2026-06-03 10
- tauri-controller: QR button now toggles the QR window open/closed (was focus-only); Results Hide button now actually closes the results window; END button closes both QR and results windows; QR button turns blue when window is open matching Results button pattern

## 2026-06-03 8
- tauri-controller: removed redundant type label span shown alongside dropdown after question closes; label now only shows when question is active (dropdown hidden)

## 2026-06-03 7
- CountUpTimer: added data-tauri-drag-region to its inner span so the timer is draggable in the Tauri toolbar

## 2026-06-03 6
- tauri-controller SessionSelector: added data-tauri-drag-region to all three outer divs and non-interactive child elements (p, span); buttons excluded

## 2026-06-03 5
- tauri-controller QR window: increased window to 600×680 (resizable), QR code from 240→420px, session code displayed at text-6xl for projector readability; handleOpenQR now focuses existing window instead of opening a duplicate

## 2026-06-03 4
- tauri-controller: added data-tauri-drag-region to non-interactive child elements (info zone div, type label span, timer span, vote count div) — Tauri requires explicit annotation on children; does not propagate from parent

## 2026-06-03 3
- tauri-controller: moved data-tauri-drag-region from separate grip div to the main toolbar div; entire toolbar empty space is now draggable; removed grip handle element

## 2026-06-03 2
- tauri-controller: added drag handle (data-tauri-drag-region) at left edge of toolbar so the window can be repositioned; no-decorations window had no native drag target before

## 2026-06-03
- student-pwa free response button: changed "Update response" to "Submit another response" to accurately reflect that a second submission adds a new row rather than replacing the previous one

## 2026-06-02 2
- Changed default for student-pwa to 4-digit code rather than QR code.

## 2026-06-02
- Tauri login: replaced inline LoginView in 60px toolbar with a popup WebviewWindow (480×340, centered, alwaysOnTop) at #/login route; added LoginWindow component in src/windows/; toolbar shows a minimal "sign-in window open" placeholder while waiting; main ToolbarApp closes the login window via WebviewWindow.getByLabel('login') when onAuthStateChange fires with a user; LoginView component no longer used for main flow
- Faculty PWA SessionPage: moved END SESSION button from top of controller area to bottom of page (after attendance section), separated from primary launch controls; added "stop question first" hint when question is active
- Knox domain restriction: replaced hardcoded 'knox.edu' hd param with VITE_ALLOWED_DOMAIN env var (default unset = allow any Google account); updated faculty-pwa LoginPage, student-pwa auth.ts + LoginPage, faculty-dashboard auth.ts + LoginPage, and tauri-controller LoginWindow; all .env.local files updated with commented-out VITE_ALLOWED_DOMAIN=knox.edu to document the knob
- Student PWA useCourses: removed .eq('role', 'STUDENT') filter — all enrolled courses now appear in the list regardless of role (STUDENT, TA, INSTRUCTOR), so faculty and TAs using the student-pwa see their courses

## 2026-06-01 1
- Added migration 006: ALTER users to add theme (text DEFAULT 'clean' CHECK clean/terminal) and accent (text DEFAULT '#06B6D4'); ALTER crs_sessions to add session_code (text NOT NULL UNIQUE, 4-digit, backfilled random); ALTER session_attendance to add method (text CHECK QR/CODE); one_active_session_per_course index already existed in 001_schema.sql
- Updated packages/types: User gains theme/accent; CRSSession gains session_code; SessionAttendance gains method; ValidateQRRequest now accepts qr_token? or session_code? (both optional, one required); ValidateQRResponse now returns session_id on success
- Rewrote supabase/functions/validate-qr: accepts qr_token (looks up by UUID) or session_code (looks up active session by code); records method (QR or CODE) in session_attendance; returns session_id so student PWA can navigate directly into session; no longer requires session_id in request body
- Updated faculty-pwa and tauri-controller lib/session.ts: added generateSessionCode() (random 1000–9999); startSession() now auto-closes open sessions for the course before inserting, and includes session_code in insert; added reopenSession() (closes other open sessions for course, sets ended_at=null)
- Rewrote faculty-pwa SessionPage: session_code displayed prominently (SESSION: XXXX) in always-visible bar below header; [Show QR as fullscreen] button opens fullscreen overlay with large QR + code; END SESSION moved to primary button at top of main area (not in settings); settings panel no longer contains End Session; added Attendance section (collapsible) showing enrolled students with ✓ Present or Mark present button for manual attendance
- Rewrote faculty-pwa CourseHomePage: session list now shows Reopen/End buttons per row; dates formatted as YYYY-MM-DD HH:MM:SS 24-hour; Reopen navigates directly into the reopened session; End refreshes the list in place; imported reopenSession and endSession
- Rewrote student-pwa CoursesPage: after courses load, fetches active sessions to build liveMap; courses with active sessions show green [LIVE] badge; tapping a live course navigates to /scan with courseId in state; tapping a non-live course goes to CourseHomePage as before
- Rewrote student-pwa QRScanPage: accepts courseId (not sessionId) from location state; QR/code toggle tabs; code entry is a large 4-digit numeric input; calls validate-qr with qr_token or session_code; on success navigates to /courses/:courseId/session/:sessionId using returned session_id; student CourseHomePage updated to pass courseId (not sessionId) to /scan
- Updated tauri-controller ControllerToolbar: [END] button added as primary element between Results and ⚙; End Session removed from settings panel; session_code displayed in settings panel (Session code: XXXX)

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
