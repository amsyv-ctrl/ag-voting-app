# MinistryVote - Project Context (Share with ChatGPT)

## Project Summary
Standalone web-hosted voting app for Assemblies of God network events (Network Conference + Sectional Tours).

Primary usage:
- Delegates scan QR and vote from phones.
- 4-digit event PIN support (optional per-ballot).
- One vote per PIN per ballot round.
- Admin can open/close rounds, monitor live results, and export records.

This project is intentionally separate from any credentialing portal codebase.

## Stack
- Frontend: React + Vite + TypeScript
- Hosting/API: Netlify (static + serverless functions)
- Database/Auth/Realtime: Supabase (Postgres + RLS + Realtime + Auth)

## Repo / Environment
- Local path: `/Users/yisraelvincent/Documents/Voting App/ag-voting-app`
- Production URL: `https://agvoting.com`

## Routes
- Public voter: `/vote/:slug`
- Public display/projector: `/display/:slug`
- Admin login/register: `/admin`
- Event admin: `/admin/events/:id`
- Ballot admin: `/admin/ballots/:id`

## Current Product Behavior

### Voting
- Ballot page can require PIN or allow voting without PIN (per ballot).
- Success state: “Vote received” and auto reset for next voter.
- Ballots support multiple rounds (`vote_round`) so a closed vote can be reopened as next round.

### Results / Winner Rules
- Winner logic in app:
  - SIMPLE: > 50%
  - TWO_THIRDS: >= 2/3
- Winner callout is shown only when ballot status is `CLOSED`.
- Display page supports two visibility modes from ballot config:
  - `LIVE`: live bars visible while open
  - `CLOSED_ONLY`: hide bars until closed

### PIN Behavior
- One PIN can be reused across different ballots/rounds.
- Same PIN cannot vote twice in same ballot round.

### Admin Features
- Create/edit events.
- Create ballots with title/description/incumbent/majority rule/type/PIN requirement.
- Manage ballots: open/close rounds, results visibility, delete ballot.
- QR generation for vote/display links.
- Generate/view/delete event PINs.
- Export event results JSON (votes + summaries + election reached timestamps).
- Ballot choices can be edited and withdrawn/restored (withdrawn shown in admin and hidden publicly).

## Security Model
- Public cannot read raw votes/pins tables directly.
- Public reads safe RPC outputs only.
- Vote submission goes through Netlify function + DB RPC transaction.
- Supabase RLS enforces admin ownership for admin CRUD.
- Service role key used only in Netlify functions.

## Key Files
- Frontend pages:
  - `src/pages/VotePage.tsx`
  - `src/pages/DisplayPage.tsx`
  - `src/pages/AdminLoginPage.tsx`
  - `src/pages/AdminEventPage.tsx`
  - `src/pages/AdminBallotPage.tsx`
- API helpers:
  - `src/lib/api.ts`
  - `src/lib/winner.ts`
- Functions:
  - `netlify/functions/submitVote.ts`
  - `netlify/functions/getBallotPublic.ts`
  - `netlify/functions/adminGeneratePins.ts`
  - `netlify/functions/_rateLimit.ts`
- DB migrations:
  - `supabase/migrations/*`

## Important Migrations Added Recently
- `202602260007_allow_admin_delete_pins.sql`
- `202602260008_results_visibility_mode.sql`
- `202602260009_event_edit_and_staff_names.sql`
- `202602260010_admin_profiles_signup.sql`
- `202603020001_display_winner_only_after_close.sql`
- `202603030002_ballot_incumbent_name.sql`
- `202603030003_choice_withdrawals.sql` (new)

## Pending / Uncommitted Local Changes (at time of writing)
- Modified: `src/pages/AdminBallotPage.tsx`
- Modified: `src/styles.css`
- New migration: `supabase/migrations/202603030003_choice_withdrawals.sql`

If these are not pushed yet, deploy won’t include them.

## Load Testing Results
- 400 votes over ~120s: `400 x 200` (pass)
- 200 votes with concurrency 15: `200 x 200` (pass)
- 400 votes over ~30s: `400 x 200` (pass)
- One aggressive burst test showed some 403 (likely edge/bot protection), but core submit path remained stable.

## Current Rate Limit Settings (`submitVote`)
- Window: 60s
- Max failed attempts: 20
- Block duration: 30s
- Keyed by `IP + ballot slug` (reduces shared-network cross-ballot throttling)

## Known Operational Notes
- Keep admin + display pages open before vote starts to reduce cold-start surprises.
- Do a short pre-session smoke test.
- Export results after each important round.
- Node/Homebrew environment had previous `libsimdjson` issue; if it reappears, reinstall `simdjson` + `node`.

## Near-Term Wishlist / Ideas
- Better operator runbook UI and status indicators.
- More explicit audit trail for withdrawn candidates (who/when).
- Optional separate projector mode variants (minimal/full detail).
- Distributed rate limiting (Redis/Upstash) for stronger brute-force protection across function instances.

## Ask ChatGPT To Help With
1. UX improvements for admin operator flow under time pressure.
2. Hardening strategy for very large events (1000+ delegates).
3. Better exports/reporting templates for denominational record keeping.
4. Accessibility and mobile UX improvements for voter screen.
