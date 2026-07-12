# JobBlast

A high-volume job application assistant that helps job seekers apply to ~50 jobs/day by combining AI resume tailoring, job aggregation, and a fast review-and-submit workflow.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080)
- `pnpm --filter @workspace/jobblast run dev` — run the frontend (port 25685, preview at `/`)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React + Vite + Tailwind v4, wouter, TanStack Query, Recharts, Clerk auth
- API: Express 5, Clerk Express middleware
- DB: PostgreSQL + Drizzle ORM
- AI: Anthropic (Claude Sonnet) for resume tailoring + cover letter generation (requires ANTHROPIC_API_KEY secret)
- Validation: Zod (zod/v4), drizzle-zod
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `lib/api-spec/openapi.yaml` — API contract (source of truth)
- `lib/db/src/schema/` — Drizzle table definitions (profile, jobListings, applications, matches, activityEvents)
- `artifacts/api-server/src/routes/` — Express route handlers (profile, jobs, applications, dashboard, ai)
- `artifacts/api-server/src/lib/scoring.ts` — Relevance scoring algorithm
- `artifacts/jobblast/src/pages/` — All frontend pages

## Architecture decisions

- Semi-automated design: the app never auto-submits. "Approve & Open" opens the employer's real URL in a new tab — the user does the final click.
- Job aggregation uses official APIs/RSS only (RemoteOK by default; no scraping of sites that forbid it).
- Relevance scoring is a simple weighted keyword match (title 40%, location 20%, salary 20%, description keywords 20%) — fast enough to score hundreds of jobs synchronously.
- AI tailoring is optional and gracefully degrades with a clear message when ANTHROPIC_API_KEY is not set.
- Duplicate detection: source+sourceId uniqueness check on job listings; user+jobId uniqueness on applications.

## Product

- **Landing** (`/`): Public page with CTA; signed-in users redirect to `/dashboard`
- **Dashboard** (`/dashboard`): Daily progress bar toward 50/day goal, streak, funnel chart, weekly bar chart, activity feed, follow-up alerts
- **Queue** (`/queue`): Ranked job review queue — keyboard-driven (A=approve, S=skip), shows relevance score and match reasons
- **Job Detail** (`/jobs/:id`): Full JD + AI tailoring panel (resume bullets + cover letter), tone selector, "Approve & Open" button
- **Applications** (`/applications`): Pipeline tracker with status badges, inline status updates, CSV export
- **Application Detail** (`/applications/:id`): Editable notes, follow-up date, status, document versions
- **Profile** (`/profile`): Master resume, target roles/locations, salary floor, excluded companies, daily goal

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- After any OpenAPI spec change, run `pnpm --filter @workspace/api-spec run codegen` before typechecking routes.
- The `followUpDate` field is a `date` column with `mode: "string"` — always pass a YYYY-MM-DD string, not a Date object.
- Anthropic SDK is installed as a direct dependency on api-server. AI routes return 503 gracefully when ANTHROPIC_API_KEY is absent.
- Clerk proxy middleware must be mounted BEFORE body parsers in app.ts.
