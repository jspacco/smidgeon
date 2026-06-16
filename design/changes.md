# Changes

## 2026-06-16 — Add shared layout wrapper and logo to faculty dashboard

**Why:** The three dashboard pages each had their own header with duplicated sign-out button and no consistent branding. Adding a shared DashboardLayout provides a single persistent top bar with the Smidgeon logo, wordmark, user email, and sign-out button across all pages. The login page also gets the logo for consistent branding entry point. "Knox College" hardcoded text was removed since the tool is intended for multiple institutions.

**Prompt:** Add Shared Layout Wrapper and Logo to Faculty Dashboard — create DashboardLayout.tsx with logo/wordmark/sign-out top bar; wrap protected routes in App.tsx; remove header from CoursesPage; add logo to LoginPage; remove hardcoded Knox College text.

**Changes:**
- `apps/faculty-dashboard/src/components/DashboardLayout.tsx` — new shared top bar component with logo, wordmark, user email, and sign-out
- `apps/faculty-dashboard/src/App.tsx` — wrap all three protected routes with DashboardLayout
- `apps/faculty-dashboard/src/pages/CoursesPage.tsx` — remove header element, handleSignOut function, and signOut import
- `apps/faculty-dashboard/src/pages/LoginPage.tsx` — add logo image above title, remove hardcoded "Knox College" text
