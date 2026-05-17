# Changes

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
