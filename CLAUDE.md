# CLAUDE.md — AI Assistant Guide for HoopTime Tracker

## Project Overview

HoopTime Tracker (branded "ptTRACKr") is a basketball rotation and playing-time management tool. It helps coaches track player minutes during games, manage substitutions in real time, record game history, and generate AI-powered rotation analysis via Google Gemini. Optional cloud sync is provided through Supabase.

## Tech Stack

- **Frontend:** React 19 with TypeScript ~5.8, functional components + hooks
- **Build:** Vite 6, ES modules (`"type": "module"`)
- **Styling:** Tailwind CSS 3 + PostCSS + Autoprefixer
- **AI Integration:** `@google/genai` (Google Gemini) — loaded via import map from esm.sh CDN
- **Backend/Auth:** `@supabase/supabase-js` (optional — Google OAuth + email/password auth, cloud data sync with real-time subscriptions)

## Repository Structure

```
├── App.tsx              # Central orchestrator (~2100 lines) — all game state, phase logic, callbacks
├── index.tsx            # React bootstrap / entry point
├── types.ts             # Shared TypeScript interfaces (Player, Team, GameConfig, etc.)
├── index.css            # Global styles with Tailwind directives + CSS custom properties
├── index.html           # HTML shell with import map for @google/genai
├── components/
│   ├── AppNav.tsx           # Header navigation, team selector, auth & sync status
│   ├── AuthModal.tsx        # Sign-in UI (email + Google OAuth)
│   ├── Clock.tsx            # Game timer controls, period navigation, manual time adjust
│   ├── GameHistoryList.tsx  # Browse/filter past games, grouped by team
│   ├── LandingPage.tsx      # Welcome screen with feature overview
│   ├── Logo.tsx             # ptTRACKr SVG logo with error handling
│   ├── PageLayout.tsx       # Responsive layout wrapper, exports PAGE_PADDING_X/Y
│   ├── PostGameReport.tsx   # Post-game stats table + AI analysis, print-optimized
│   └── SubstitutionModal.tsx # Manage on-court players with equal-swap validation
├── services/
│   ├── geminiService.ts     # Gemini API calls for rotation analysis
│   └── supabase.ts          # Auth, data fetch/save, real-time team subscriptions
├── utils/
│   └── formatters.ts        # Shared formatting helpers (formatSeconds, formatPlayerName)
├── supabase/
│   └── schema.sql           # PostgreSQL schema (user_teams, game_history, RLS)
├── public/                  # Static assets (pttrackr-logo.png, pttrackr-logo.svg)
├── vite.config.ts           # Dev server (port 3000, host 0.0.0.0), env var injection
├── tsconfig.json            # TS config (ES2022, bundler resolution, no strict mode)
└── tailwind.config.js       # Theme: Inter (sans) + Oswald fonts, content paths
```

## Common Commands

```bash
npm install              # Install dependencies
npm run dev              # Start dev server at http://localhost:3000
npm run build            # Production build to dist/
npm run preview          # Preview production build locally
npx tsc --noEmit         # Type-check without emitting files
```

No test runner is configured. No lint or format scripts exist.

## Architecture & Key Patterns

### Centralized State in App.tsx

All game state lives in `App.tsx` (~2100 lines). Components receive data and callbacks via props — no context providers or state management libraries.

**Phase system** (`SetupPhase`):
- `CONFIG` — Configure game settings (periods, duration, opponent, team)
- `STARTERS` — Select starting 5 players
- `GAME` — Active game with timer, substitutions, stats tracking

**Key state slices** (separate `useState` calls):
- `phase`, `config`, `teams`, `selectedTeamId` — setup state
- `gameState` — current period, timer, running flag, on-court player IDs
- `stats` — per-player, per-period seconds
- `history` — completed game snapshots (max 20 entries)
- `authUser` — Supabase user or null
- `isGameComplete`, `aiAnalysis`, `expiredPeriods` — game lifecycle
- Confirmation modals: `confirmState` with typed `ConfirmAction` union

**Additional App.tsx-local types:**
- `HistoryView`: `'LIST' | 'DETAIL'`
- `TeamSyncState`: `'disabled' | 'signedOut' | 'loading' | 'saving' | 'saved' | 'error'`
- `ConfirmTone`: `'warning' | 'danger'`
- `ConfirmAction`: Union type for confirmation modal actions

### Persistence

- **localStorage keys:** `hooptime_tracker_v1` (session), `hooptime_history_v1` (history), `hooptime_teams_v1` (teams)
- **Config versioning:** `CONFIG_VERSION = 2` — handles migration from v1 defaults (7:30 → 8:00 quarters)
- **Supabase sync:** Real-time subscriptions for teams, timestamp-based conflict resolution via `lastTeamsSyncRef`
- **History limit:** 20 entries max

### Other Patterns

- **Colocated callbacks:** 50+ handler functions defined near the state they mutate within `App.tsx`
- **Timer drift correction:** Uses `lastClockUpdate` timestamp and `Date.now()` delta
- **Refs for async safety:** `hasArchivedCurrentGame`, `historyRef`, `isTeamSyncReadyRef`, `isApplyingRemoteTeamsRef`
- **Shared utilities:** `utils/formatters.ts` — `formatSeconds(sec)` → `M:SS`, `formatPlayerName(name)` → `J. Doe`
- **Service separation:** `services/geminiService.ts` handles AI, `services/supabase.ts` handles auth + persistence

## Key Types (defined in `types.ts`)

- `Player` — id, name, number
- `Team` — id, name, players array
- `TeamSnapshot` — id, name (used in history entries)
- `PeriodType` — `'Quarters' | 'Halves'`
- `GameConfig` — periodCount, periodMinutes, periodSeconds, periodType, opponentName
- `GameState` — currentPeriod, remainingSeconds, isRunning, onCourtIds, lastClockUpdate
- `PlayerStats` — playerId, periodMinutes (object keyed by period number, values in seconds), totalMinutes (seconds)
- `GameHistoryOutcome` — `'COMPLETE' | 'RESET'`
- `GameHistoryEntry` — id, completedAt, outcome, configSnapshot, teamSnapshot, rosterSnapshot, statsSnapshot, aiAnalysis, durationSeconds
- `DEFAULT_CONFIG` — exported constant (4 quarters, 8:00 each)

## Coding Conventions

- **Language:** TypeScript + React function components throughout
- **Indentation:** 2 spaces
- **Quotes:** Single quotes preferred
- **File naming:** PascalCase for components (`Clock.tsx`), camelCase for hooks/utilities
- **Type definitions:** Shared types go in `types.ts`; use PascalCase for interfaces. App-internal types can be defined at top of `App.tsx`.
- **ID format:** `player-{uuid}`, `team-{uuid}`, `history-{timestamp}`
- **Imports:** Relative paths (`../utils/formatters`), no path aliases configured
- **Commits:** Terse imperative subjects — `feat: add bench chart`, `fix: clamp period timer`. Reference issues in body.

## Testing

No automated tests or test runner exist. When adding tests:

- Use **Vitest + React Testing Library**
- Name test files `*.test.tsx`, colocated with components or in `components/__tests__/`
- Priority areas: timer accuracy (mock `Date.now()`), substitution edge cases, Gemini request formatting
- Until automated tests exist, document manual test steps in PRs

## Environment Variables

Set these in `.env.local` (never commit this file):

| Variable | Purpose | Loading mechanism |
|----------|---------|-------------------|
| `GEMINI_API_KEY` | Gemini API key for AI rotation analysis | Injected via `vite.config.ts` `define` as `process.env.GEMINI_API_KEY` |
| `VITE_SUPABASE_URL` | Supabase project URL (optional, for cloud sync) | `import.meta.env.VITE_SUPABASE_URL` |
| `VITE_SUPABASE_ANON_KEY` | Supabase anonymous key (optional, for cloud sync) | `import.meta.env.VITE_SUPABASE_ANON_KEY` |

The `supabaseEnabled` flag in `services/supabase.ts` checks if both Supabase vars are present.

## Supabase Schema

Two tables with row-level security:

- **`user_teams`** — `user_id` (PK, uuid), `payload` (jsonb: teams array + selectedTeamId), `updated_at` (timestamptz for conflict resolution)
- **`game_history`** — `user_id` (uuid) + `id` (text) composite PK, `completed_at` (timestamptz, indexed), `entry` (jsonb: full GameHistoryEntry)

Both tables have RLS policies scoped to authenticated users (`auth.uid()`).

## Security Notes

- Never commit `.env.local` or API keys
- Validate responses from `analyzeRotation` before rendering — defensive guards prevent blank states during API failures
- Supabase tables use row-level security (RLS) policies scoped to authenticated users
- `@google/genai` is loaded via import map from `esm.sh` CDN in `index.html`
