# Roadmap

Honest state of the repo. "Built" below means code exists in the tree and does
what it claims. Everything else is under **Not built**, including gaps inside
features that otherwise work.

All five workspaces are now implemented end to end — a homeowner can file a
photographed claim on a phone, a coordinator can triage and determine it in the
portal, and the backcharge is computed at the moment of decision. What is thin is
test coverage and the administrative write paths needed to onboard a builder
without running the seed script.

Last reviewed: 2026-08-03.

---

## Built

### `packages/warranty` — the rules engine

The most complete part of the codebase, and the part everything else depends on.

| Module | What works |
| --- | --- |
| `dates.ts` | UTC-noon-anchored `YYYY-MM-DD` math: `addDays`, `addMonths` (end-of-month clamping), `daysBetween`, `isBefore` / `isAfter` / `isWithin` (inclusive), `minDate` / `maxDate` |
| `coverage.ts` | `tierWindows`, `tierCoverage`, `checkCoverage` (with `tierOverride` and per-builder `tierMonths`), `finalCoverageDate`, 60-day `expiringSoon` flag |
| `tolerances.ts` | 19 tolerance entries across 13 trades, 4 marked zero-tolerance; `findTolerance`, `tolerancesForTrade`, `isWithinTolerance`, `tolerancesAsPromptContext` |
| `clocks.ts` | `milestoneSchedule`, `subWindow`, `analyzeExposure`, `exposureAlerts`, `backchargeRecoverability` |

Test coverage is `clocks.test.ts` — 15 assertions across five describe blocks,
pinning the numbers the product's claims rest on:

- end-of-month clamping, including a leap year, and the timezone-drift guard
- 1-2-10 window construction; drywall covered at 11 months and not at 13;
  plumbing still covered at 18 months when drywall is not; the final day of a
  window is covered; a 2-5-10 override honored
- the 11-month milestone lands on day 334 with >30 days of runway
- **the spec-home exposure case: 188 days** for a drywall sub who finished six
  months before closing
- a missing completion date produces >3,600 days of exposure rather than a null
- alert severity escalates to `critical` when the 11-month is unscheduled
- **backcharge expiry: 83 days late**, and `no_sub_assigned` distinguished from
  `expired`

### `packages/shared` — the vocabulary

All ten enum families, their derived subsets (`BUILDER_ROLES`,
`CLOSED_CLAIM_STATUSES`, `BUILDER_PAYS_OUTCOMES`), `TRADE_DEFAULT_TIER`,
`DEFAULT_TIER_MONTHS`, `MILESTONE_OFFSET_DAYS` / `_LABELS`, and the full zod
schema set including `aiAssessmentSchema`, `photoMetadataSchema`,
`createClaimSchema`, `createDeterminationSchema`, `createHomeSchema`,
`createSubAssignmentSchema`, `scheduleAppointmentSchema`.

### `apps/api` — the server

- **Schema and migration.** 20 tables, 10 Postgres enums, one generated Drizzle
  migration (`0000_charming_true_believers.sql`), full relation definitions.
- **Auth.** scrypt password hashing, `jose` JWTs, timing-safe login against a
  dummy hash for unknown emails, `requireAuth` / `requireRole` /
  `requireBuilderStaff`, tenant isolation via `builderIdOf(c)` reading from the
  token, and `canAccessHome` covering prior owners.
- **Homeowner reads.** `GET /api/homes` with live tier countdowns, milestone
  schedule, `nextMilestone`, `finalCoverageDate`, and the sourced warranty-start
  provenance. `GET /api/homes/:homeId` with warranties, claims, ownerships.
- **Milestone scheduling.** `POST /api/homes/:homeId/milestones/:kind/schedule` —
  the one action that clears an 11-month alert.
- **Claim filing.** Photo upload ahead of claim creation, EXIF timestamp capture,
  Haversine geo-verification against lot coordinates with a three-state
  `geo_verified`, sequential `WC-` references, `claim_events` written on every
  mutation.
- **AI triage.** Full path in [`AI_TRIAGE.md`](./AI_TRIAGE.md): two-document
  grounding, precomputed coverage windows, structured output via zod, forced
  `needsHumanReview` on uncited proposals, refusal handling, graceful 503 when no
  API key is configured.
- **Determinations + backcharge.** `POST /api/claims/:id/determination` writes
  the human decision, maps outcome → claim status, and computes backcharge
  recoverability at decision time for builder-funded outcomes.
- **The exposure board.** `GET /api/builder/exposure` — three queries, per-lot
  exposure analysis, alerts sorted critical-first then soonest-expiry then
  largest-window, plus a portfolio summary.
- **Sub scorecard.** `GET /api/builder/subcontractors/scorecard` — lots worked,
  undocumented assignments, recoverable vs. unrecoverable cents, recovery rate,
  lapsed COI, sorted by biggest leak.
- **Plan patterns.** `GET /api/builder/patterns` — claims grouped by
  `plan × trade`, floor of 2 affected homes, incidence rate against total homes
  on the plan.
- **Seed.** Sandoval Homes / Cedar Hollow with Lots 42, 7, 15; five subs; a
  realistic warranty document with parsed `coverage_terms`; milestones with Lot
  42's 11-month deliberately left unscheduled; two open untriaged claims.

### `apps/web` — the builder portal

Vite 6 + React 19 + React Router 7 + TanStack Query 5, roughly 1,950 lines. All
five builder-side screens are wired to live endpoints:

- **Exposure** — sorted alert board, per-lot breakdown, and the schedule action
  on the 11-month review
- **Claims** and **claim detail** — photos, event history, the AI proposal with
  its citations, and the determination form that records `agreedWithAi`
- **Subcontractor scorecard** and **plan patterns**
- **Login** — JWT in `localStorage`, cleared automatically on any `401`

Dev server proxies `/api` and `/uploads` to `:3001`, so there is no CORS
handling and no absolute API URL in the client.

### `apps/mobile` — the homeowner app

Expo 57 / React Native 0.86 with expo-router, one codebase for iOS and Android.
Root stack + tab layout (My home · Claims), login with `AsyncStorage` token
handling, a cold-start redirect that waits on the stored token, and a typed API
client.

- **My home** leads with the countdown, and escalates the 11-month review
  visually inside 120 days — warning styling, then critical inside 45. That is
  the homeowner-side mirror of the builder's exposure alert.
- **Claim capture** (`claim/new`) is the evidentiary path: `expo-image-picker`
  with `exif: true`, preferring the photo's own `GPSLatitude` / `GPSLongitude`
  and falling back to `expo-location` when the image carries no geotag, and
  reading `DateTimeOriginal` for the capture timestamp. Location failure is
  swallowed deliberately — a claim without coordinates still stands.
- **Claim detail** (`claim/[id]`) shows status and history, with AI assessments
  filtered out server-side for homeowners.

---

## Not built

### Write paths that only exist as schemas

Zod schemas were written for these; no route consumes them. Data reaches these
tables only through `pnpm db:seed`.

| Missing endpoint | Schema that exists | Blocks |
| --- | --- | --- |
| Create / update homes | `createHomeSchema` | Onboarding a real builder |
| ~~Create sub assignments~~ | `createSubAssignmentSchema` | **Built** — see below |
| Create appointments | `scheduleAppointmentSchema` | All scheduling |
| Subcontractor CRUD | — | Onboarding |
| Community / plan CRUD | — | Onboarding |

The second row was the one that mattered, and it has since been closed:
`POST /api/builder/homes/:homeId/assignments` and
`PATCH /api/builder/assignments/:assignmentId` now write and backfill
`completed_at`, both scoped to the caller's builder, with
`GET /api/builder/subcontractors` for the picker. The remaining rows still block
onboarding a real builder without the seed script.

### Other gaps in what exists

- ~~No UI for recording completion dates~~ — fixed. `/gaps` lists every trade
  missing one, worst window first, with the field to fix it on the row, and
  `/setup` captures the date at assignment time.
- **No tests outside the rules engine.** `apps/api` declares a `test` script and
  has vitest installed; there are no test files. Nothing covers auth, tenant
  isolation, the geo-verification math, or the exposure endpoint's assembly.
- ~~`appointments` and `appointment_claims` are unreferenced~~ — fixed.
  `/api/appointments` books, reschedules, confirms, completes, and cancels
  visits, batching several claims on a home into one trip. `/schedule` is the
  board.
- **Right-to-cure columns are unwritten.** `statutory_notice_sent_at`,
  `statutory_response_due_at`, and `responded_at` exist on `claims` and nothing
  sets them.
- ~~`GET /api/claims` filters status with an unchecked cast~~ — fixed; the
  param is validated against `CLAIM_STATUSES` and ignored when unrecognised.
- ~~Claim status transitions are unguarded~~ — partially fixed. A claim in a
  terminal state (`verified`, `denied`, `referred`, `withdrawn`) can no longer be
  reopened, which protects the timeline a right-to-cure defense rests on.
  Forward transitions are still unordered: `submitted → completed` is legal.
- **Refresh tokens / session revocation** — login issues a JWT and there is no
  way to invalidate it before expiry.
- **No rate limiting** on login or photo upload.

---

## Next

Ordered by how much of the thesis each unblocks.

### 1. Warranty PDF ingestion and clause extraction

`warranty_documents.extracted_text` and `coverage_terms` are populated by hand in
the seed. Real onboarding means: upload the builder's warranty PDF, extract text,
segment into clauses, classify each as coverage or exclusion, tag tier and trade
where determinable, and capture `page_number` so a citation resolves to a place a
human can look. Until this exists, triage grounding is a manual data-entry job
per builder and the product cannot be sold to a second customer without
engineering time.

Extraction should propose clauses for review, not commit them — same posture as
triage, for the same reasons.

### 2. Push notifications for the 11-month deadline

The single highest-value homeowner feature. The countdown data is already
computed and returned by `GET /api/homes`, and the Expo app is the delivery
vehicle; what is missing is the push itself. Needs Expo push
tokens, a scheduled job sweeping `milestones` by `due_date`, and a notification
ladder — 60, 30, and 7 days out — plus the builder-side mirror when a lot's
11-month is unscheduled inside the alert window (the endpoint already counts
these in `summary.lotsWithUnscheduledElevenMonth`).

### 3. Appointment scheduling with multi-trade batching

`appointments` + `appointment_claims` is already a many-to-many for this reason.
The lever: given the open claims on a lot, group them by responsible sub and
propose the smallest set of visits, weighted so trades that must precede others
(plumbing before drywall before paint) sequence correctly. Then
`homeowner_confirmed` before dispatch, because an unconfirmed appointment is a
wasted truck roll.

This is the real bottleneck in warranty operations. Adjudication is two minutes;
coordination is two weeks.

### 4. Backcharge invoicing

`backcharges` currently records status, rationale, amount, and `days_late`. The
remaining half of the workflow is the money: generate the backcharge document
against the sub, transition `recoverable → issued → collected`, handle
`disputed`, and write off explicitly rather than by silence. The
`BACKCHARGE_STATUSES` enum already anticipates all of it. Without this the
scorecard's `recoveryRate` is measuring intent rather than recovery.

### 5. Right-to-cure notice generation and deadline tracking

The three timestamp columns on `claims` are the skeleton. What is needed: detect
when a homeowner communication constitutes statutory notice, compute the response
deadline from `builders.state` (TX Ch. 27: 60 days; FL Ch. 558: 60 / 120 for
associations; WA RCW 64.50: 45; CA §895 et seq.: the SB 800 pre-litigation
sequence), draft the builder's written response, and alert before the window
closes.

This is frequently the feature that gets the software bought — by the builder's
attorney rather than by operations.

### 6. Resale and warranty transfer

`home_ownerships` is already a history table and `warranties.transfers_on_resale`
is already per-tier (structural transfers, workmanship and systems do not, per
§6.0 of the seeded document). Missing: the flow that ends one ownership, starts
another, expires the non-transferring tiers, moves the second owner's app access
into place, and preserves the first owner's read access to claims they filed —
which `canAccessHome` already permits.

### 7. S3 (or signed-URL) photo storage

Photos are written to `UPLOAD_DIR` on the app server's local disk and served by
`serveStatic`. Claim photos are evidence and belong in durable object storage
with signed reads, lifecycle policy, and a retention window matched to the
10-year structural tier. The code comment in `index.ts` already flags this.

### 8. Sub-facing mobile view

Currently subs exist only as rows. A minimal sub-facing surface — assigned
claims, photos, appointment windows, mark-complete with a completion photo —
closes the loop that the builder's coordinator otherwise walks manually by phone.
It is also the cheapest way to get `sub_assignments.completed_at` recorded
accurately at the moment of completion rather than reconstructed from memory
eighteen months later, which is the failure the whole product is built around.

---

## Deliberately not planned

- **Automated determinations.** Not a missing feature. See
  [`AI_TRIAGE.md`](./AI_TRIAGE.md) §4.
- **Shipping NAHB tolerance values commercially.** The table in `tolerances.ts`
  is a structural placeholder. It gets licensed or replaced before any
  commercial reliance — see the caveat in `tolerances.ts` and
  [`AI_TRIAGE.md`](./AI_TRIAGE.md) §1.
- **Deriving `warranty_start_date`.** It stays explicit and sourced. See
  [`DOMAIN.md`](./DOMAIN.md) §5.
- **Defaulting `sub_warranty_start` to the home's warranty start.** That would
  make every lot look covered and delete the thesis. A null `completed_at` stays
  loud.
