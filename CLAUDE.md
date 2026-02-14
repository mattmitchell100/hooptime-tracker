# CLAUDE.md — AI Assistant Guide for HoopTime Tracker

## Project Overview

HoopTime Tracker (branded "ptTRACKr") is a basketball rotation and playing-time management tool. It helps coaches track player minutes during games, manage substitutions in real time, record game history, and generate AI-powered rotation analysis via Google Gemini. Optional cloud sync is provided through Supabase.

## Tech Stack

- **Frontend:** React 19 with TypeScript ~5.8, functional components + hooks
- **Build:** Vite 6, ES modules (`"type": "module"`)
- **Styling:** Tailwind CSS 3 + PostCSS + Autoprefixer
- **AI Integration:** `@google/genai` (Google Gemini)
- **Backend/Auth:** `@supabase/supabase-js` (optional — Google OAuth + email/password auth, cloud data sync)

## Repository Structure

```
├── App.tsx              # Central orchestrator — all game state, phase logic, callbacks
├── index.tsx            # React bootstrap / entry point
├── types.ts             # Shared TypeScript interfaces (Player, Team, GameConfig, etc.)
├── index.css            # Global styles with Tailwind directives
├── components/
│   ├── AppNav.tsx           # Header navigation, team selector
│   ├── AuthModal.tsx        # Sign-in UI (email + Google OAuth)
│   ├── Clock.tsx            # Game timer controls, period navigation
│   ├── GameHistoryList.tsx  # Browse/filter past games
│   ├── LandingPage.tsx      # Welcome screen
│   ├── Logo.tsx             # ptTRACKr logo
│   ├── PageLayout.tsx       # Responsive layout wrapper
│   ├── PostGameReport.tsx   # Post-game stats display
│   └── SubstitutionModal.tsx # Manage on-court players
├── services/
│   ├── geminiService.ts     # Gemini API calls for rotation analysis
│   └── supabase.ts          # Auth, data fetch/save, real-time subscriptions
├── utils/
│   └── formatters.ts        # Shared formatting helpers (formatSeconds, formatPlayerName)
├── supabase/
│   └── schema.sql           # PostgreSQL schema (user_teams, game_history, RLS)
├── public/                  # Static assets (logos)
├── vite.config.ts           # Dev server (port 3000), env vars
├── tsconfig.json            # Strict TS config
└── tailwind.config.js       # Theme customization, content paths
```

## Common Commands

```bash
npm install              # Install dependencies
npm run dev              # Start dev server at http://localhost:3000
npm run build            # Production build to dist/
npm run preview          # Preview production build locally
npx tsc --noEmit         # Type-check without emitting files
```

## Architecture & Key Patterns

- **Centralized state in `App.tsx`:** All game state (config, teams, stats, gameState, history, phase) lives in `App.tsx`. Components receive data and callbacks via props.
- **Explicit state slices:** Separate `useState` calls for each domain — no deeply nested state objects.
- **Colocated callbacks:** Helper functions are defined near the state they mutate within `App.tsx`.
- **Shared utilities:** Common formatting functions live in `utils/formatters.ts` to avoid duplication across components.
- **Storage strategy:** localStorage for offline persistence (`hooptime_tracker_v1` key prefix), Supabase for optional cloud sync.
- **Service separation:** `services/geminiService.ts` handles AI, `services/supabase.ts` handles auth and persistence, `types.ts` holds all shared interfaces.

## Key Types (defined in `types.ts`)

- `Player` — id, name, number
- `Team` — id, name, players array
- `GameConfig` — period count/type/duration, opponent name
- `GameState` — current period, remaining seconds, running flag, on-court player IDs
- `PlayerStats` — per-period and total seconds tracked per player
- `GameHistoryEntry` — completed game snapshot with config, roster, stats, AI analysis

## Coding Conventions

- **Language:** TypeScript + React function components throughout
- **Indentation:** 2 spaces
- **Quotes:** Single quotes preferred
- **File naming:** PascalCase for components (`Clock.tsx`), camelCase for hooks/utilities
- **Type definitions:** Shared types go in `types.ts`; use PascalCase for interfaces
- **ID format:** `player-{uuid}`, `team-{uuid}`, `history-{timestamp}`
- **Commits:** Terse imperative subjects — `feat: add bench chart`, `fix: clamp period timer`. Reference issues in body.

## Testing

No automated tests exist yet. When adding tests:

- Use **Vitest + React Testing Library**
- Name test files `*.test.tsx`, colocated with components or in `components/__tests__/`
- Priority areas: timer accuracy (mock `Date.now()`), substitution edge cases, Gemini request formatting
- Until automated tests exist, document manual test steps in PRs

## Environment Variables

Set these in `.env.local` (never commit this file):

| Variable | Purpose |
|----------|---------|
| `GEMINI_API_KEY` | Gemini API key for AI rotation analysis |
| `VITE_SUPABASE_URL` | Supabase project URL (optional, for cloud sync) |
| `VITE_SUPABASE_ANON_KEY` | Supabase anonymous key (optional, for cloud sync) |

## Security Notes

- Never commit `.env.local` or API keys
- Validate responses from `analyzeRotation` before rendering — defensive guards prevent blank states during API failures
- Supabase tables use row-level security (RLS) policies scoped to authenticated users
