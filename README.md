# Smidgeon

A classroom response system (CRS) for live voting during college lectures.
A smidgeon better than the alternative.

Works on phones, no hardware, free for students, no textbook publisher.

Revote button provides first-class support for peer instruction.

Open Source software, GNU Affero General Public License 3.0. You can host it yourself.


---

## What it does

Faculty launch multiple choice or free response questions during class. Students respond on their phones via a web app — no app install required. Results are stored, exportable as CSV. Screenshots captured like vintage iClicker.

Revote button designed for peer instruction workflows where the same question is asked twice with a discussion period between rounds.

Designed to replace iClicker without paying iClicker Ed-Tech prices.

---

## What it doesn't do

Smidgeon is not an LMS. It has no assignments, no gradebook, no file storage, no syllabus tool. It does one thing: live classroom voting, done well.

---

## Components

**Student PWA** — students respond to live questions on their phones. Installable to home screen. No login friction beyond Google SSO.

**Faculty PWA** — faculty controller on phone. Launch questions, see live vote distribution privately, show results to students.

**Faculty Dashboard** — desktop browser app for course management, session history, and CSV data export.

**Tauri Controller** — always-on-top horizontal toolbar for the instructor's desktop. Sits beside a browser window showing slides. Modeled on the original iClicker desktop software.

---

## Tech stack

- React + Vite (all frontend apps)
- Supabase (Postgres, Auth, Realtime, Storage)
- Tauri (desktop toolbar — Rust + React)
- Vercel (hosting for web apps)
- Google SSO via Supabase Auth
- Microsoft SSO (planned, not yet implemented)

---

## Key features

- **MCQ and free response** — multiple choice (single or multi-select, 2-5 options) and open text
- **Peer instruction first-class** — revote button relaunches the same question and links both rounds in the database for analysis
- **Show/hide results** — students never see vote distribution during voting; instructor controls when results appear
- **Live vote count** — instructor phone shows live distribution privately; Tauri toolbar shows count only
- **QR attendance** — unique QR code per session, students scan with phone camera, physical presence tracked independently from responses
- **Screenshots** — optional auto-capture of screen on each question launch, stored in Supabase Storage for post-session analysis
- **CSV export** — session summary, full response detail, and course summary; always available, no hoops

---

## Getting started

### Prerequisites

- Node.js 22+
- pnpm (`npm install -g pnpm`)
- A Supabase project (free tier at supabase.com is fine)
- For Tauri: Rust toolchain via rustup.rs

### Setup

```bash
# Clone and install
git clone https://github.com/your-org/smidgeon.git
cd smidgeon
pnpm install
```

### Configure environment

Create `.env.local` in each app you want to run:

```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

### Run migrations

Go to Supabase dashboard => SQL Editor. Run each file in `supabase/migrations/` in order.

### Run an app

```bash
# Student PWA
cd apps/student-pwa && pnpm dev

# Faculty PWA
cd apps/faculty-pwa && pnpm dev

# Faculty Dashboard
cd apps/faculty-dashboard && pnpm dev

# Tauri controller (requires Rust)
cd apps/tauri-controller && cargo tauri dev
```

---

## Auth setup

Smidgeon uses Google SSO via Supabase Auth. In v1 only `@knox.edu` accounts and other select alpha testers are accepted — change the domain restriction in your Supabase Auth settings and edge function config for other institutions.

To enable Google SSO:
1. Supabase dashboard => Authentication => Providers => Google
2. Add your Google OAuth client ID and secret from Google Cloud Console
3. Add your Supabase callback URL to the OAuth app's authorized redirect URIs

---

## Self-hosting

Smidgeon is designed to be self-hostable. Supabase is open source and runs on Docker. The React apps build to static files and can be served anywhere.

```bash
# Build a web app for deployment
cd apps/student-pwa && pnpm build
# Output in dist/ — deploy anywhere static files are served
```

---

## Project structure

```
smidgeon/
  apps/
    student-pwa/        Student response app — phone, PWA
    faculty-pwa/        Faculty controller — phone
    faculty-dashboard/  Data export and session history — desktop
    tauri-controller/   Always-on-top desktop toolbar
  packages/
    types/              Shared TypeScript types
    ui/                 Shared React components
  supabase/
    migrations/         SQL schema, applied in order
    functions/          Edge functions
    seed.sql            Bootstrap account required for new installations
  design/
    design.md           Full design document
    changes.md          Changelog
  CLAUDE.md             Instructions for AI-assisted development
```

---

## Contributing

Smidgeon is open source under the GNU Affero license. Contributions welcome — bug reports, pull requests, and institutions wanting to adapt it for their own use.

If you're running this at your institution and want to contribute back, please do. The goal is a community, not a product.

---

## Why

iClicker was a near-perfect product. Then it got bought by a textbook publisher and became expensive. PollEverywhere is designed for audiences, not classrooms. Mentimeter is a presentation tool with polling bolted on. None of them do classroom response well. None support peer instruction well.

Smidgeon does one thing: let faculty ask a question, let students answer on their phones, show results when the instructor is ready. It knows about peer instruction. It doesn't require hardware, subscriptions, or an IT department.

It's a smidgeon better than the alternative. That's good enough.

---

## License

GNU Affero. Self-hosting is not trivial, but cheaper than iClicker.