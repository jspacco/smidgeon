# Smidgeon — Failure Modes, Edge Cases, and Pre-Pilot Testing

## Network Failures

### Student loses WiFi mid-session
- Supabase Realtime drops → reconnecting indicator should appear
- Student cannot submit responses while disconnected
- On reconnect: re-subscribes, shows current question state
- **Test:** turn phone WiFi off and on during an active question

### Faculty loses WiFi mid-session
- Tauri controller loses Realtime → reconnecting indicator appears
- Questions already launched stay in database as ACTIVE
- pg_cron closes stuck questions after 15 minutes
- Students see "Waiting for instructor..." after 5 minutes
- **Test:** disconnect laptop WiFi during active question

### Supabase goes down
- Everything stops working
- **Good:** visible error message "Unable to connect to server. Please try again."
- **Bad:** blank white screen — make sure errors surface
- Not much to do operationally — just ensure errors are visible

### Flaky classroom WiFi — 30 students connecting simultaneously
- Real stress test — run before first class
- Supabase Realtime should handle it but worth verifying
- Students may double-tap submit on slow response
- Upsert pattern already handles duplicate submissions correctly

---

## Auth Failures

### Google SSO token expires mid-session
- Supabase client auto-refreshes tokens — should be invisible
- If refresh fails: user gets logged out unexpectedly
- Should show "Session expired, please log in again" — not blank screen
- Student gets kicked to landing page — needs clear messaging

### Student joins with wrong account
- Knox student uses personal Gmail → gets in (post-alpha)
- Or sees waitlist screen if invitation required
- Error message should be specific and helpful

### Faculty opens Tauri on a new machine
- No cached auth token
- Login window should open correctly
- Full OAuth flow runs
- **Test this explicitly** — common first-use scenario

---

## Session State Edge Cases

### Faculty closes laptop lid mid-session
- Laptop sleeps → Tauri loses connection
- Session stays open in database
- Students stuck on last question state
- pg_cron closes question after 15 minutes
- Faculty reopens laptop → Tauri reconnects → can end session cleanly
- **Test:** close laptop during active question, reopen after 30 seconds

### Two faculty accidentally run simultaneous sessions for same course
- Partial unique index prevents two open sessions
- Second start auto-closes first
- Students in first session get kicked (ended_at set)
- Good behavior — verify it works as expected

### Student scans QR code twice
- UNIQUE constraint on session_attendance (session_id, user_id)
- Upsert handles silently — second scan updates scanned_at
- Student should not see an error
- Verify this is silent and graceful

### Student submits response after question closes
- Application logic should reject late submissions
- Currently: status check in validate-qr but verify response submission
- **Check:** can a student POST a response to a CLOSED question?
- Should fail silently or show "Question has closed"

---

## Data Export Failures

### CSV export with zero students
- Empty file with headers only — not a crash
- Should download cleanly
- **Test:** export from a session where no students attended

### CSV with long or special-character free responses
- Commas and quotes in responses break naive CSV generation
- Responses must be properly escaped (RFC 4180)
- **Test:** submit a response containing: `Hello, "world", it's a test`
- Verify the downloaded CSV opens correctly in Excel and Google Sheets

### Session with no questions
- Attendance data only, no question data
- participation_pct = 0% or N/A — not a crash
- **Test:** start session, have students scan in, end session without launching any questions

---

## Tauri-Specific Failures

### QR popup window left open when session ends
- Should close automatically when handleEndSession fires
- Code: `WebviewWindow.getByLabel('qr').then(win => win?.destroy())`
- **Verify:** end a session while QR window is open

### Tauri crashes mid-session
- Session stays open in database
- Students continue seeing last question state
- Faculty reopens Tauri → logs in → sees active session in selector → reattaches
- This is the reopen session flow — **test it explicitly**

### Windows vs Mac differences
- Window decorations look different between platforms
- Font rendering differs — monospace especially
- Touch/trackpad drag behavior may need adjustment on Windows
- **Test drag handle on Windows** — may need tweaks

### Code signing — unsigned app warnings
**Mac:** "Unidentified developer" dialog on first launch
- Workaround: right-click → Open → Open anyway
- Acceptable for closed alpha

**Windows:** SmartScreen warning on first run
- Workaround: "More info" → "Run anyway"
- Acceptable for closed alpha

For wider distribution: Apple Developer account ($99/year) required for Mac notarization. Document the workaround clearly in the README for alpha users.

---

## GitHub Releases Workflow

Tag a release to trigger automatic Mac + Windows builds:

```bash
git tag v0.1.0
git push origin v0.1.0
```

GitHub Action (`.github/workflows/release.yml`):

```yaml
on:
  push:
    tags:
      - 'v*'

jobs:
  build-mac:
    runs-on: macos-latest
    steps:
      - uses: actions/checkout@v4
      - uses: tauri-apps/tauri-action@v0
        with:
          projectPath: apps/tauri-controller

  build-windows:
    runs-on: windows-latest
    steps:
      - uses: actions/checkout@v4
      - uses: tauri-apps/tauri-action@v0
        with:
          projectPath: apps/tauri-controller
```

Builds `.dmg` for Mac and `.msi` for Windows. Both uploaded automatically as GitHub release artifacts. Faculty download from the GitHub releases page — no app store, no distribution service needed.

---

## Pre-Pilot Acceptance Test

Run through this manually end-to-end before showing anyone. All 12 must pass.

```
 1. Faculty opens Tauri on fresh machine → login works
 2. Faculty creates a course in the toolbar
 3. Student opens student PWA, scans QR or enters 6-digit code → joins session
 4. Faculty launches MCQ → student sees question → student votes
 5. Faculty sees vote count update live on phone (faculty PWA)
 6. Faculty shows results → student sees bar chart
 7. Faculty launches revote → student sees same question again → votes
 8. Faculty ends session → student gets kicked to landing page with "Session ended"
 9. Faculty opens faculty PWA → sees session in history with correct datetime
10. Faculty downloads CSV → data is correct, special characters handled
11. Turn off WiFi during active question → reconnecting indicator appears
    → turn WiFi back on → everything resumes without re-login
12. Faculty opens dashboard → session data visible, exports work
```

All 12 green → ready for closed alpha.

---

## Closed Alpha Deployment Checklist

- [ ] smidgeon.app domain purchased and DNS configured
- [ ] Vercel projects deployed:
  - respond.smidgeon.app → student PWA
  - faculty.smidgeon.app → faculty PWA
  - dashboard.smidgeon.app → faculty dashboard
- [ ] All Vercel URLs added to Supabase redirect URLs
- [ ] All Vercel URLs added to Google OAuth authorized redirect URIs
- [ ] Tauri controller v0.1.0 built for Mac and Windows
- [ ] GitHub release created with .dmg and .msi attached
- [ ] README documents unsigned app workaround for Mac and Windows
- [ ] faculty_invitations table populated for alpha users
- [ ] Knox @knox.edu accounts auto-approved in handle_new_user()
- [ ] pg_cron job active (closes stuck questions after 15 minutes)
- [ ] All 12 acceptance tests passing
- [ ] Supabase Pro tier active (no inactivity pausing)