# AG Voting App (Netlify + Supabase)

Standalone voting application for Assemblies of God network events. This project is intentionally separate from any credentialing portal codebase.

## Stack

- Frontend: React + Vite + TypeScript
- Hosting/API: Netlify static hosting + Netlify Functions
- Database/Auth/Realtime: Supabase (Postgres + Auth + Realtime)

## Features (v1)

- QR-friendly public ballot URL per ballot: `/vote/:slug`
- PIN-protected voting (4-digit code), no voter account required
- One PIN use per ballot enforced atomically
- Confirmation state (`Vote received`) and auto reset after 3 seconds
- Admin login and management routes:
  - `/admin`
  - `/admin/events/:id`
  - `/admin/ballots/:id`
- Live results sorted descending with percentages and winner logic (Simple or Two-Thirds)
- Projector display route: `/display/:slug`
- Server-side rate limiting in `submitVote` to slow brute-force attempts

## Project Structure

- `src/` React app
- `netlify/functions/` serverless APIs
- `supabase/migrations/` SQL schema, RLS, RPC functions
- `netlify.toml` Netlify build + redirects config

## Environment Variables

Copy `.env.example` to `.env` (local) and configure Netlify environment variables for deploy.

Client:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Functions:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_PROJECT_ID` (optional, reserved)
- `VOTE_RECEIPT_SECRET` (required for tamper-evident vote receipts; `RECEIPT_SECRET` supported as fallback alias)

Important:

- Never expose `SUPABASE_SERVICE_ROLE_KEY` to the browser.
- Keep service role usage confined to Netlify Functions.

## Supabase Setup

1. Create a Supabase project.
2. Run migration:
   - `supabase/migrations/202602260001_init_voting_schema.sql`
3. In Supabase Auth, create at least one admin user (email/password).
4. Ensure Realtime is enabled for `votes` table (Supabase dashboard).

## Local Development

1. Install deps:
   - `npm install`
2. Start web app:
   - `npm run dev`
3. Start Netlify functions + frontend together (recommended):
   - `netlify dev`

Without `netlify dev`, frontend calls `/api/*` and expects Netlify routing.

## Deploy to Netlify

1. Create new Netlify site from this repo.
2. Build command: `npm run build`
3. Publish directory: `dist`
4. Functions directory: `netlify/functions`
5. Add env vars in Netlify UI.
6. Deploy.

## Key Security Decisions

- PIN hashes are stored in `pins.code` using bcrypt.
- Raw PINs are never exposed via RLS policies or public RPC.
- Public (`anon`) access is limited to safe RPCs:
  - `get_ballot_public`
  - `get_ballot_results_public`
  - `submit_vote_atomic` (called through `submitVote` function)
- Public users cannot insert votes directly.
- Admin CRUD is protected by Supabase Auth + RLS owner checks (`created_by`).

## Winner Logic

- `SIMPLE`: top choice percent must be strictly `> 50%`
- `TWO_THIRDS`: top choice percent must be `>= 66.666...%`
- Ties or threshold not met => no winner yet

## Acceptance Criteria

- Delegate can scan QR URL and vote from phone using 4-digit PIN.
- Invalid/used PIN and closed ballot show clear error.
- Successful vote returns confirmation and auto-resets in ~3 seconds.
- Same device can submit consecutive votes with different PINs.
- Results update live in admin view and display view.
- Results are sorted high-to-low with percentages and total votes.
- Winner badge appears only when configured threshold is satisfied.
- PIN replay for same ballot is blocked, including race conditions.
- Voters cannot read raw PIN or raw vote tables directly.

## Short Test Plan

1. Auth/RLS
   - Sign in as admin and create event/ballot.
   - Confirm unauthenticated user cannot CRUD admin tables.
2. Voting flow
   - Generate pins, open ballot, cast vote with valid PIN.
   - Verify success payload and UI reset.
3. PIN reuse
   - Submit second vote on same ballot with same PIN.
   - Expect clear `PIN already used` error.
4. Closed ballot
   - Close ballot, attempt submit.
   - Expect `Ballot is closed`.
5. Race condition
   - Fire two concurrent submit requests with same PIN + ballot.
   - Verify one succeeds and one fails.
6. Realtime results
   - Keep admin ballot page open; submit votes from voter page.
   - Verify table updates and winner state changes.

## Notes

- This is a new, standalone project with no credentialing portal integration.
- For production hardening, add persistent distributed rate limiting (e.g., Upstash/Redis) instead of in-memory function state.
