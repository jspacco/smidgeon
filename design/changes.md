# Changes

## 2026-06-19 — QR codes encode full join URL for stock camera app compatibility

**Why:** The qr_token previously encoded in QR codes was a bare UUID. A bare UUID is not actionable by a stock camera app — the phone's Camera shows nothing useful. Only students who already had the student-pwa open and used the in-app QRScanner could benefit. A brand-new student scanning for the first time (the overwhelmingly common first-time experience) had no path in. The fix encodes a full URL — `https://smidgeon.app/join?token={uuid}` — so any phone's camera recognises it as a link, opens it in the browser, and lands the student directly on the join flow. The token remains a UUID in the database; only what gets encoded visually in the QR image changes. The domain is configurable via VITE_STUDENT_APP_URL for self-hosters.

**Prompt:** QR Codes Must Work With Stock Camera Apps, Not Just the In-App Scanner. Step 1: add /join route to student-pwa that reads token query param, handles unauthenticated users by preserving token through OAuth round-trip, and validates on return. Step 2: add VITE_STUDENT_APP_URL env var (default https://smidgeon.app) to faculty-pwa and tauri-controller; update all three QR-generating surfaces to encode the full URL. Step 3: update in-app QRScanner's handleScan to parse token from URL-format QR content, with backward-compatible fallback for bare UUIDs. Step 4: confirm 6-digit session code path untouched. Step 5: verify both faculty-side QR displays updated.

**Changes:**
- `apps/student-pwa/src/lib/auth.ts` — add optional `returnTo` param to `signInWithGoogle`; embeds post-auth destination in the Supabase `redirectTo` callback URL so the token survives the OAuth round-trip
- `apps/student-pwa/src/pages/AuthCallback.tsx` — read `returnTo` query param after OAuth completes; validate it is a relative path (open-redirect guard) and navigate there instead of always going to `/`
- `apps/student-pwa/src/pages/JoinPage.tsx` — new page: reads `?token=` param, redirects unauthenticated users through OAuth with token preserved, validates token and navigates to session once authenticated
- `apps/student-pwa/src/App.tsx` — add `/join` route pointing to `JoinPage`
- `apps/student-pwa/src/pages/LandingPage.tsx` — update `handleScan` to parse token from URL-format QR content (`new URL(raw).searchParams.get('token')`), with bare-UUID fallback for backward compatibility
- `apps/faculty-pwa/src/pages/SessionPage.tsx` — add `STUDENT_APP_URL` constant; fullscreen QR now encodes `${STUDENT_APP_URL}/join?token=${session.qr_token}`
- `apps/faculty-pwa/.env.local` — document `VITE_STUDENT_APP_URL` (commented out)
- `apps/tauri-controller/src/windows/QRWindow.tsx` — add `STUDENT_APP_URL` constant; large QR popup encodes full URL
- `apps/tauri-controller/src/components/ControllerToolbar.tsx` — add `STUDENT_APP_URL` constant; mini inline QR encodes full URL
- `apps/tauri-controller/.env.local` — document `VITE_STUDENT_APP_URL` (commented out)
## 2026-06-18 — Three-tier settings: schema, cascade logic, and UI

**Prompt:** Three-Tier Settings — Schema, Cascade Logic, and UI. Work on a new branch off main (feature/settings-tiers). Tier 1 = instructor defaults (users table), Tier 2 = course defaults (courses table), Tier 3 = per-question overrides (crs_questions — unchanged, already works). Step 1: edit supabase/migrations/001_schema.sql in place (fresh install assumed) — add default_option_count, default_multi_answer, default_screenshots_on to users; add default_screenshots_on to courses; add "users: update own" RLS policy. Step 2: update packages/types/src/database.ts — add 3 fields to User, add default_screenshots_on to Course. Step 3: update createCourse() in both session.ts files to accept and pass defaultScreenshotsOn. Step 4: update App.tsx (tauri-controller) to sync screenshotsOn from course defaults on course select; add handleSaveToCourseDefaults writing optionCount+multiAnswer+screenshotsOn to the course row. Step 5: update ControllerToolbar — add "Apply to: This session | This course" scope toggle; when scope=course, changes to optionCount/multiAnswer immediately persist to the course row; screenshots always persists. Step 6: update faculty-pwa SessionPage equivalently — scope toggle, sync multiAnswer from course on load. Step 7: update faculty-dashboard CoursesPage — add "My defaults" section (reads/writes users row), pre-fill create-course form from those defaults, add default_screenshots_on to form. Step 8: update faculty-dashboard CourseView — add "Course defaults" section in left aside with inline edit.

**Changes:**
- `supabase/migrations/001_schema.sql` — add `default_option_count`, `default_multi_answer`, `default_screenshots_on` to `users`; add `default_screenshots_on` to `courses`; add `"users: update own"` RLS policy
- `packages/types/src/database.ts` — add 3 fields to `User` interface; add `default_screenshots_on` to `Course` interface
- `apps/tauri-controller/src/lib/session.ts` — `createCourse()` now accepts `defaultScreenshotsOn` param and writes it to DB
- `apps/faculty-pwa/src/lib/session.ts` — same change to `createCourse()`
- `apps/tauri-controller/src/components/SessionSelector.tsx` — pass `false` as `defaultScreenshotsOn` (simplified create flow; user can edit in CourseView)
- `apps/faculty-pwa/src/pages/CreateCoursePage.tsx` — same
- `apps/tauri-controller/src/App.tsx` — sync `screenshotsOn` from `selectedCourse.default_screenshots_on`; add `handleSaveToCourseDefaults` writing course row; pass `onSaveToCourseDefaults` prop to ControllerToolbar
- `apps/tauri-controller/src/components/ControllerToolbar.tsx` — add `saveScope` state (`session`/`course`); add "Apply to" radio toggle in settings panel; `handleOptionCountChange`/`handleMultiAnswerChange` persist when scope=course; screenshots always persists via `onSaveToCourseDefaults`
- `apps/faculty-pwa/src/pages/SessionPage.tsx` — add `saveScope` state; sync `multiAnswer` from course on load; add `handleSaveToCourseDefaults`; add scope-aware `handleOptionCountChange`/`handleMultiAnswerChange`; add "Apply to" toggle in settings panel
- `apps/faculty-dashboard/src/pages/CoursesPage.tsx` — add "My defaults" section reading/writing `users` row; pre-fill create-course form from instructor defaults; add `default_screenshots_on` field to create form
- `apps/faculty-dashboard/src/pages/CourseView.tsx` — add "Course defaults" section in left aside with inline edit for all three fields

## 2026-06-19 — Definitive restart-required messaging and quit-and-reopen button for screen recording permission

**Why:** macOS screen recording permission grants never apply to the already-running process — a restart is always required, without exception. This is a deliberate OS security design, not an intermittent quirk. Apple's own system dialog uses hedged language ("may require restart") but for Screen Recording specifically the restart is unconditional. Previously, after a user granted permission in System Settings and returned to Smidgeon, the app re-checked `has_permission()`, still saw denied (from this process's perspective), and showed the same generic dead-end — no indication that the fix was simply to restart. The new UI shows both recovery actions together at all times: "Open Privacy Settings" (for users who haven't granted yet) and "Quit and Reopen Smidgeon" (for users who already granted and just need to restart). Both are always visible so a returning user doesn't have to click through "Open Privacy Settings" again to reach "Quit and Reopen."

**Prompt:** Definitive "Restart Required" Messaging + Quit-and-Reopen Button for Screen Recording Permission. Step 1: update denied-state copy to unconditionally state that restart is required after granting permission. Show both "Open Privacy Settings" and "Quit and Reopen Smidgeon" buttons always together when denied. Step 2: implement relaunch_app Tauri command using AppHandle::restart() (built into Tauri v2 core, no plugin needed). Wire "Quit and Reopen Smidgeon" button to invoke it. Step 3: verify Settings panel is genuinely unreachable during an active question before concluding no state-preservation is needed.

**Changes:**
- `apps/tauri-controller/src-tauri/src/lib.rs` — add `relaunch_app` command calling `app.restart()` (tauri::AppHandle built-in, Tauri v2 core); register in invoke_handler
- `apps/tauri-controller/src/components/ControllerToolbar.tsx` — extract `PERMISSION_DENIED_MSG` constant with clear restart-required copy; update `checkPermission` and `handleScreenshotsToggle` denied paths to use it; replace single "Open Privacy Settings" button with a `flex-col` div showing both "Open Privacy Settings" and "Quit and Reopen Smidgeon" always together when `permStatus === 'denied'`

## 2026-06-19 — Replace ad-hoc debug_log with tauri-plugin-log

**Why:** The hand-rolled `debug_log()` function added in the previous session hardcoded `/tmp/smidgeon-debug.log`. `/tmp` does not exist on Windows — the `if let Ok(...)` guard around `OpenOptions::open()` silently swallowed the failure, so the entire logging mechanism would have been a silent no-op on Windows. `tauri-plugin-log` solves this for free: it writes to the correct OS-specific app-data directory on every platform, supports log rotation (so a faculty pilot doesn't accumulate unbounded disk usage), and is the officially supported Tauri logging path. Log files land at `~/Library/Logs/edu.knox.crs.controller/` on macOS and `%LOCALAPPDATA%\edu.knox.crs.controller\logs\` on Windows — a well-known location to direct faculty to when collecting crash reports.

**Prompt:** Replace Ad-Hoc File Logging with tauri-plugin-log. Add tauri-plugin-log and log crates to Cargo.toml. Register plugin in Tauri builder with KeepSome(5) rotation, 5 MB max file size, targeting both Stdout and LogDir. Replace every debug_log() call site with log::info!/warn!/error! macros. Remove the debug_log() function entirely. Document log file paths in design/TODO.md. Dev builds use LevelFilter::Debug, release builds use LevelFilter::Info.

**Changes:**
- `apps/tauri-controller/src-tauri/Cargo.toml` — add `tauri-plugin-log = "2"` and `log = "^0.4"` dependencies
- `apps/tauri-controller/src-tauri/src/lib.rs` — remove `debug_log()` function and all `/tmp/smidgeon-debug.log` writes; replace all call sites with `log::info!` / `log::warn!` / `log::error!`; register `tauri_plugin_log::Builder` in `run()` with KeepSome(5) rotation, 5 MB cap, Stdout + LogDir targets, Debug level in dev / Info in release
- `design/TODO.md` — add log file location note under Tauri Controller section with paths for macOS, Windows, Linux

## 2026-06-18 — Fix screenshot permission UI dead-end; add file-based debug logging

**Why:** Two problems needed fixing together. (1) The Screenshots "On" toggle was a dead end when permission was denied: `handleScreenshotsToggle` was calling `capture_controller_display` to test permission, but that Rust command has `if !scap::has_permission() { return Err(...) }` — it never calls `scap::request_permission()`, so the OS permission dialog was never triggered and the toggle just silently failed. The "Open Privacy Settings" button rendered correctly in the denied state but since the errors from `void invoke(...)` are silently swallowed, if the Rust command failed for any reason it was invisible. (2) All debug output used `eprintln!`, which is invisible when testing the built `.app` bundle (no terminal attached); `cargo tauri dev` is not a real bundle and macOS doesn't reliably show TCC prompts to non-bundled binaries, so the built app is the only real test environment.

**Prompt:** Fix Screenshot Permission UI Dead-End and Add File-Based Debug Logging. Part 1: add `debug_log` helper writing to `/tmp/smidgeon-debug.log` and call it at entry/exit of `capture_display_impl`, `capture_controller_display`, `list_displays`, `check_screen_recording_permission`, and `open_screen_recording_settings`. Keep existing `eprintln!` calls in addition to `debug_log`. Part 2: fix `handleScreenshotsToggle` to call `check_screen_recording_permission` (which internally calls `scap::request_permission()`) instead of attempting a real capture; if "granted" flip the toggle on, if "denied" show inline message with "Open Privacy Settings" button. Fix `checkPermission` the same way for consistency. Part 3: add `debug_log` as literally the first line of `open_screen_recording_settings` to verify invocation independent of TCC state.

**Changes:**
- `apps/tauri-controller/src-tauri/src/lib.rs` — add `debug_log` function writing timestamped entries to `/tmp/smidgeon-debug.log`; add `debug_log` calls at entry and exit of `capture_display_impl`, `list_displays`, `capture_controller_display`, `check_screen_recording_permission`, and `open_screen_recording_settings` (first line of `open_screen_recording_settings` per Part 3); keep all existing `eprintln!` calls
- `apps/tauri-controller/src/components/ControllerToolbar.tsx` — rewrite `handleScreenshotsToggle` and `checkPermission` to call `invoke<string>('check_screen_recording_permission')` instead of a capture attempt; this routes through `scap::request_permission()` and actually triggers the OS dialog; "denied" path shows inline message and the existing "Open Privacy Settings" button wired to `invoke('open_screen_recording_settings')`

## 2026-06-17 — Complete scap migration for screenshot capture

**Prompt:** finish the scap migration and get scap working for screen capture

**Changes:**
- `apps/tauri-controller/src-tauri/Cargo.toml` — remove `screenshots 0.8` and macOS-only `core-graphics 0.22`; add `scap 0.1.0-beta.1`
- `apps/tauri-controller/src-tauri/src/lib.rs` — replace all capture logic with unified scap implementation: `capture_display_impl` uses `scap::capturer::Capturer` with `FrameType::BGRAFrame` + `Resolution::Captured`; `list_displays` uses `scap::capturer::get_output_frame_size` (standalone, no permission required) to get physical pixel dimensions per display; `capture_controller_display` matches Tauri's `current_monitor().size()` against `scap_frame_size` to identify the correct display; `check_screen_recording_permission` uses `scap::has_permission()` / `scap::request_permission()`; all macOS-only `#[cfg]` splits for capture removed — code is now platform-unified. The `supports_screenshot_capture` macOS version gate and `open_screen_recording_settings` are unchanged.

**Why scap works now:** Full Xcode 26.3 is installed (`/Applications/Xcode.app`). The previous migration attempt failed because scap's `cidre` dependency calls `xcodebuild` in its `build.rs` and requires the full Xcode app — Command Line Tools alone were insufficient. With Xcode present, `cidre` builds successfully.

**Implementation note:** `scap::get_target_dimensions` is defined in scap's `targets` module but not re-exported from `scap::lib.rs`. Instead, `scap::capturer::get_output_frame_size(&Options)` (a standalone function re-exported from the engine module) is used to get display dimensions without starting a capture or requiring permission. It returns physical pixels (`logical × scale_factor`), matching Tauri's `monitor.size()` values for display auto-detection.

## 2026-06-17 — Attempt scap migration; add macOS version gate for Screenshots setting

**Why:** The `CGDisplayCreateImage` fix applied in the previous task corrects the missing menu bar/Dock problem on macOS. This task attempted to further improve the screenshot stack by migrating to the `scap` crate (ScreenCaptureKit on macOS, Windows.Graphics.Capture on Windows) for a single unified cross-platform capture path. However, scap's macOS backend (`cidre`) calls `xcodebuild` from its `build.rs` and requires the full Xcode app to be installed — Command Line Tools alone are insufficient. Since the build machine has only CLT installed, the scap dependency was reverted to the working `screenshots` + `core-graphics` stack.

The macOS version gate (`supports_screenshot_capture` command) was still implemented and wired up: on macOS < 14.0 the Screenshots toggle in Settings is replaced by the message "Screenshots require macOS 14 or later." rather than crashing or silently failing. On Windows and non-macOS, the command always returns `true`.

**Scap migration path:** When full Xcode is available on the build machine, replace `screenshots = "0.8"` and `core-graphics = "0.22"` in Cargo.toml with `scap = "0.1.0-beta.1"`, and replace `lib.rs` with the scap-based implementation (using `scap::has_permission()`, `scap::get_all_targets()`, `Capturer::build()` + `start_capture()` + `get_next_frame()` loop + `stop_capture()`; BGRA pixel format with B↔R swap for JPEG encoding).

**Windows minimum for scap:** Windows 10 version 1803 (build 10.0.17134), checked at runtime by `GraphicsCaptureApi::is_supported()`. No code change needed — runtime check handles it.

**Prompt:** Migrate Screenshot Capture from `screenshots` Crate to `scap` — replace screenshots crate with scap (ScreenCaptureKit/Windows.Graphics.Capture), handle macOS 14+ version gate, add supports_screenshot_capture command, re-verify permission flow and display matching.

**Changes:**
- `apps/tauri-controller/src-tauri/src/lib.rs` — add `supports_screenshot_capture` Rust command; document scap migration blocker (Xcode required for cidre) in inline comments; all capture logic unchanged from previous task
- `apps/tauri-controller/src/components/ControllerToolbar.tsx` — add `screenshotSupported` state; call `supports_screenshot_capture` when settings panel opens; replace Screenshots toggle with "Screenshots require macOS 14 or later." message when `IS_MACOS && !screenshotSupported`

## 2026-06-17 — Fix screenshot capturing desktop instead of screen content; add auto display detection

**Root cause:** The `screenshots` crate's macOS backend calls `CGWindowListCreateImage` (via `CGDisplay::screenshot` with `kCGWindowListOptionOnScreenOnly`). This is a window-compositor API — it assembles only app-level windows and intentionally excludes system UI layers (menu bar, Dock) that are rendered by privileged system processes at reserved window levels. Other apps' windows (e.g. the browser showing the slides) are also excluded from this composite. This explains exactly the observed pattern: desktop wallpaper + Tauri window present, menu bar + Dock + browser window absent.

The fix is `CGDisplayCreateImage` (`CGDisplay::image()` from `core-graphics 0.22`), which reads the complete hardware framebuffer — everything visible on the physical display, identical to what Command-Shift-3 captures. This API is already available as a transitive dependency via the screenshots crate; a direct `[target.'cfg(target_os = "macos")'.dependencies]` entry makes it available in our code.

**Window-position-based display detection:** Added `capture_controller_display` Rust command that uses `window.current_monitor()` (Tauri v2) to find which monitor the toolbar is currently on, matches it to a `display_info` entry by comparing physical dimensions (logical × scale_factor), then calls the corrected capture. This replaces the previous "largest non-primary" default. In Settings, `selectedDisplayId: null` now means "Auto (follow toolbar)" and is the default; users can still pick a specific display from the dropdown.

**Prompt:** Fix Screenshot Capture Showing Desktop Instead of Actual Screen Content — investigate root cause (CGWindowListCreateImage vs CGDisplayCreateImage), fix to use true framebuffer capture on macOS, add capture_controller_display command with window-position-based display detection as the new default.

**Changes:**
- `apps/tauri-controller/src-tauri/Cargo.toml` — add `core-graphics = "0.22"` as macOS-only direct dependency
- `apps/tauri-controller/src-tauri/src/lib.rs` — macOS `capture_display_impl` now uses `CGDisplay::image()` (CGDisplayCreateImage); non-macOS path unchanged; add `capture_controller_display` command with Tauri `current_monitor()` → display match; update `check_screen_recording_permission` to use CGDisplayCreateImage on macOS; add `eprintln!` debug logs
- `apps/tauri-controller/src/App.tsx` — `handleLaunch` calls `capture_controller_display` when `selectedDisplayId` is null (auto), `capture_display` when specific
- `apps/tauri-controller/src/components/ControllerToolbar.tsx` — display picker always shown when screenshots on (not just 2+ displays), first option is "Auto (follow toolbar)" mapping to `null`; `checkPermission` and `handleScreenshotsToggle` use the matching command for current mode; remove unused `selectDefaultDisplay`

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

## 2026-06-17 (2)

**Prompt:** for this task, read all the current migration files and create a single new migration file. this is possible because we have no actual users or clients right now, the migrations won't run correctly right now anyway, and i need to test that the migrations can be applied to an empty database to verify that self-hosting is going to work. so create a single 001_schema.sql with everything in it, and delete the rest of the migrations.

- `supabase/migrations/001_schema.sql` — consolidated all 10 migrations into one fresh-database schema file; folded all ALTER TABLE increments directly into CREATE TABLE definitions; removed backfill-only UPDATE statements (not needed on empty DB)
- `supabase/migrations/002–010` — deleted

## 2026-06-17

**Prompt:** Faculty Email Whitelist via Supabase "Before User Created" Auth Hook — adds a proper server-side allowlist using Supabase's Before User Created Auth Hook implemented as a Postgres function. The hook runs before a new user row is created in auth.users, inspects the incoming user's email, and rejects the signup outright by returning an error if the email is not in the whitelist. VITE_ALLOWED_DOMAIN is NOT removed; it remains as a future configuration knob for institutions self-hosting their own instance. Step 1: new migration — faculty_whitelist table. Step 2: hook function. Step 3: seed initial whitelist entries. Step 4: document manual dashboard step. Step 5: update LoginPage error handling. Step 6: leave VITE_ALLOWED_DOMAIN logic untouched.

**Why:** VITE_ALLOWED_DOMAIN passes an `hd` parameter hint to Google OAuth but provides no real app-controlled enforcement — it is only a hint to Google's account-picker UI, and Google's own infrastructure handles cross-Workspace-domain rejection inconsistently (e.g. a 2FA push notification that leads to a dead end). The Before User Created hook is a true server-side boundary: a rejected user never gets a valid session in the first place.

**Payload correction:** The draft in the task used `event->'claims'->>'email'` for the hook payload path. Verified against live Supabase docs — the correct path is `event->'user'->>'email'`. The migration uses the correct path.

**Changes:**
- `supabase/migrations/010_faculty_whitelist.sql` — new migration: faculty_whitelist table, hook_restrict_signup_to_whitelist function with correct payload path (event->'user'->>'email'), required grants, seed row for jspacco@knox.edu
- `apps/student-pwa/src/pages/AuthCallback.tsx` — destructure error from getSession(), pass to /login via router state on failure
- `apps/faculty-pwa/src/pages/AuthCallback.tsx` — same
- `apps/faculty-dashboard/src/pages/AuthCallback.tsx` — same
- `apps/student-pwa/src/pages/LoginPage.tsx` — read initial error from router location state
- `apps/faculty-pwa/src/pages/LoginPage.tsx` — same
- `apps/faculty-dashboard/src/pages/LoginPage.tsx` — same
- `apps/tauri-controller/src/App.tsx` — capture error from exchangeCodeForSession(), thread into LoginView via props
- `apps/tauri-controller/src/components/LoginView.tsx` — accept initialError/onClearError props, display hook rejection message
- `design/TODO.md` — added manual setup section: enable hook in dashboard, verify seed email
