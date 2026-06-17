# Changes

## 2026-06-16 — Implement screenshot capture for question launch (Tauri controller)

**Why:** The design doc specifies screenshot capture as a research infrastructure feature: when Screenshots=On, launching a question should capture the display (presumably showing the slide) and attach it to the question record so researchers can later see what was on screen alongside vote distributions. The `screenshot_url` column and `screenshots` Supabase Storage bucket were already in place but the capture itself was never implemented — only a TODO stub existed in `handleLaunch`.

**Prompt:** Implement Screenshot Capture for Question Launch — add `screenshots` crate (screen capture), `image` crate (JPEG compression), and `base64` crate to Cargo.toml; add Rust commands `list_displays`, `capture_display`, `check_screen_recording_permission`, `open_screen_recording_settings`; wire capture into `handleLaunch` in App.tsx (capture before launch, upload async after question created); add display picker and macOS permission check UI in ControllerToolbar settings panel; add `uploadScreenshot` and `updateScreenshotUrl` helpers to session.ts.

**Implementation notes:**
- Screenshot format: JPEG via the `image 0.25` crate at default quality (~75-80%). The `screenshots` crate re-exports `image 0.24` internally, so raw RGBA bytes are extracted from its `ImageBuffer` and reconstructed in our `image 0.25` `ImageBuffer` to bridge the version gap. PNG was considered but JPEG gives adequate quality under 300 KB for typical 1080p slides without the intermediate PNG encode/decode step.
- Storage path: `{courseId}/{sessionId}/{questionId}.jpg` within the `screenshots` bucket. The path is stored in `crs_questions.screenshot_url`; the dashboard generates signed URLs from this path when displaying.
- Capture happens synchronously before `launchQuestion` (fast, typically <500ms). The Supabase Storage upload is fire-and-forget (does not block the UI). Capture failures show a dismissible amber warning banner in the toolbar; the question launches regardless. Only one warning is shown per session (via `screenshotWarnedRef`).
- macOS permission: probed by attempting a real capture. First attempt triggers the system dialog. The settings panel has a "Check screen recording permission" button (macOS only) and an inline "Open Privacy Settings" link when denied. Toggling Screenshots → On automatically runs a test capture before enabling the setting.
- Default display selection: non-primary display with largest resolution (if 2+ displays), otherwise the only display.
- The `open_screen_recording_settings` command uses `std::process::Command::new("open")` with the `x-apple.systempreferences:...?Privacy_ScreenCapture` URL — no shell plugin changes needed.

**What still needs human testing:**
- macOS Screen Recording permission dialog appearance on first toggle (cannot be triggered in a sandboxed environment)
- Color fidelity of JPEG output on macOS (screenshots crate internal RGBA normalization)
- Upload to Supabase Storage and `screenshot_url` write-back end-to-end
- Windows capture (not tested on Windows)

**Changes:**
- `apps/tauri-controller/src-tauri/Cargo.toml` — add screenshots 0.8, image 0.25 (jpeg feature), base64 0.22
- `apps/tauri-controller/src-tauri/src/lib.rs` — add list_displays, capture_display, check_screen_recording_permission, open_screen_recording_settings commands
- `apps/tauri-controller/src/App.tsx` — update AppSettings (selectedDisplayId), add screenshotWarning state + banner, wire handleLaunch with capture + async upload, add uploadAndAttachScreenshot helper
- `apps/tauri-controller/src/lib/session.ts` — add uploadScreenshot and updateScreenshotUrl helpers
- `apps/tauri-controller/src/components/ControllerToolbar.tsx` — update AppSettings, add DisplayInfo type, display loader, display picker UI, permission check button, macOS-only permission status/recovery UI, window height 460px when settings open

## 2026-06-16 — Add shared layout wrapper and logo to faculty dashboard

**Why:** The three dashboard pages each had their own header with duplicated sign-out button and no consistent branding. Adding a shared DashboardLayout provides a single persistent top bar with the Smidgeon logo, wordmark, user email, and sign-out button across all pages. The login page also gets the logo for consistent branding entry point. "Knox College" hardcoded text was removed since the tool is intended for multiple institutions.

**Prompt:** Add Shared Layout Wrapper and Logo to Faculty Dashboard — create DashboardLayout.tsx with logo/wordmark/sign-out top bar; wrap protected routes in App.tsx; remove header from CoursesPage; add logo to LoginPage; remove hardcoded Knox College text.

**Changes:**
- `apps/faculty-dashboard/src/components/DashboardLayout.tsx` — new shared top bar component with logo, wordmark, user email, and sign-out
- `apps/faculty-dashboard/src/App.tsx` — wrap all three protected routes with DashboardLayout
- `apps/faculty-dashboard/src/pages/CoursesPage.tsx` — remove header element, handleSignOut function, and signOut import
- `apps/faculty-dashboard/src/pages/LoginPage.tsx` — add logo image above title, remove hardcoded "Knox College" text
