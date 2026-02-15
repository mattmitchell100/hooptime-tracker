<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# ptTRACKr

**Real-time basketball rotation and playing-time tracker for coaches, assistants, and parents.**

ptTRACKr helps you manage player minutes across game periods, handle substitutions on the fly, and generate AI-powered post-game insights — all from your phone or laptop.

## Features

- **Game Clock** — Real-time timer with support for quarters or halves, configurable period lengths (1–15 min), and manual second adjustments
- **Substitution Tracking** — Swap players between court and bench mid-game with a tap; minutes are tracked per player per period automatically
- **Starting 5 Selection** — Visual roster picker to set your starting lineup before tip-off
- **Multi-Team Roster Management** — Create, edit, and switch between multiple teams with full player rosters
- **AI Post-Game Analysis** — Google Gemini generates coaching insights on rotation efficiency, player fatigue, and playing-time balance
- **PDF Export** — Export post-game reports with per-period minute breakdowns
- **Game History** — Browse past games grouped by team with expandable details and stored reports
- **Cloud Sync** — Sign in with Google or email to sync teams and history across devices via Supabase
- **Offline-First** — Works without an account using LocalStorage; cloud sync kicks in when authenticated

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | React 19 + TypeScript |
| Build Tool | Vite |
| Styling | Tailwind CSS |
| Database & Auth | Supabase (PostgreSQL + Row Level Security) |
| AI | Google Gemini (`gemini-3-flash-preview`) |

## Getting Started

### Prerequisites

- Node.js (v18+)

### Install

```bash
npm install
```

### Environment Variables

Create a `.env.local` file in the project root:

```env
# Required for AI post-game analysis
GEMINI_API_KEY=your_gemini_api_key

# Required for authentication and cloud sync
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

> The app works offline without Supabase credentials (LocalStorage only), but auth and cloud sync will be disabled.

### Run

```bash
# Development server
npm run dev

# Production build
npm run build

# Preview production build
npm run preview

# Type-check
npx tsc --noEmit
```

## Project Structure

```
├── App.tsx                    # Main app orchestrator and state management
├── index.tsx                  # React entry point
├── types.ts                   # Shared TypeScript interfaces
├── components/
│   ├── AppNav.tsx             # Top navigation bar
│   ├── AuthModal.tsx          # Sign-in modal (Google OAuth / email)
│   ├── Clock.tsx              # Game timer with period controls
│   ├── GameHistoryList.tsx    # Past games list view
│   ├── LandingPage.tsx        # Welcome / onboarding screen
│   ├── PostGameReport.tsx     # Analytics report with AI insights
│   └── SubstitutionModal.tsx  # Player swap interface
├── services/
│   ├── supabase.ts            # Database and auth client
│   └── geminiService.ts       # Gemini AI analysis service
├── supabase/
│   └── schema.sql             # Database schema (user_teams, game_history)
└── public/                    # Static assets (logos)
```
