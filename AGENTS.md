# Repository Guidelines

## Project Structure & Module Organization
- `index.tsx` bootstraps the React tree and mounts `App.tsx`, the stateful orchestrator.
- UI elements live in `components/`, e.g., `Clock.tsx` (timer controls) and `SubstitutionModal.tsx` (roster adjustments).
- Domain logic and typed contracts are centralized in `services/geminiService.ts` for AI calls and `types.ts` for shared models such as `PlayerStats` and `GameConfig`.
- Shared formatting helpers (e.g. `formatSeconds`, `formatPlayerName`) live in `utils/formatters.ts` to avoid duplication across components.
- Static scaffold files (`index.html`, `vite.config.ts`, `tsconfig.json`) stay at the repo root; create `public/` only when you add standalone assets.

## Build, Test, and Development Commands
- `npm install` pulls React 19, Vite, and TypeScript.
- `npm run dev` launches Vite with hot module reload on http://localhost:3000.
- `npm run build` outputs a production bundle to `dist/`; run this before deployments.
- `npm run preview` serves the `dist/` build so you can smoke-test what will ship.
- `npx tsc --noEmit` runs strict type-checking when you need a quick static analysis pass.

## Coding Style & Naming Conventions
- Stick to TypeScript + React function components, 2-space indentation, and single quotes (matching `App.tsx`).
- Keep component files PascalCase (`Clock.tsx`), hooks camelCase, and shared types in `types.ts`.
- Favor explicit state slices (see `phase`, `gameState`) instead of nested objects, and colocate helper callbacks with the state they mutate.
- Use relative imports (e.g. `../utils/formatters`) for cross-directory references.

## Testing Guidelines
- There are no committed automated tests yet; introduce Vitest + React Testing Library when adding coverage.
- Name specs `*.test.tsx` beside the component or inside `components/__tests__/` to keep intent obvious.
- Focus on timer accuracy (mock `Date.now()`), substitution edge cases, and `services/geminiService` request formatting.
- Until automated tests exist, document manual test steps in PRs (e.g., “start clock, advance to next period, request AI analysis”).

## Commit & Pull Request Guidelines
- With no shared history, default to terse, imperative subjects such as `feat: add bench allocation chart` or `fix: clamp period timer`.
- Reference GitHub issues in the body (`Closes #12`) and describe UX or API impacts.
- Pull requests should include: context, screenshots/GIFs for UI, manual test evidence, and notes about schema/env changes.
- Keep changes scoped (UI, service, config) and request review from teammates who own that area.

## Security & Configuration Tips
- Store your Gemini key in `.env.local` as `GEMINI_API_KEY=...` and never commit that file.
- Validate responses from `analyzeRotation` before rendering; defensive guards prevent blank states during API failures.
