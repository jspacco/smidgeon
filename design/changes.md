# Changes

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
