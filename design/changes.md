# Changes

## 2026-05-17
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
