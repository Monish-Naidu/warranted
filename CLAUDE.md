# Warranted — working notes

Warranty infrastructure connecting home buyers to their builders. Read
`README.md` for the business thesis and `docs/DOMAIN.md` for the full domain
explainer before making design decisions — the domain is unusual and the
reasoning behind the model is not obvious from the code alone.

## Run it

```bash
pnpm db:local   # terminal 1 — real Postgres from bundled binaries. Leave running.
pnpm dev        # terminal 2 — API :3001, builder portal :5173
pnpm dev:mobile # Expo; press `i` for the iOS simulator
```

**The database is not Homebrew Postgres.** `pnpm db:local` runs genuine Postgres
from binaries that ship as a dev dependency, against `apps/api/.postgres`. This
is deliberate: a fresh clone runs with only Node and pnpm installed. To use a
Homebrew or hosted server, point `DATABASE_URL` at it and skip `db:local` — no
other change is needed. Don't "fix" this by adding a Docker or Homebrew
requirement.

Demo logins are printed by `pnpm db:seed`. Password: `warranted-demo-2026`.

## The one thing to understand

The product's core object is **not "the warranty."** It is **two clocks per
trade per lot**:

- The builder warrants workmanship to the homeowner for 12 months **from
  closing**.
- Its subcontractors warrant the same work to the builder for 12 months **from
  their own completion** — on a spec home, 6–9 months earlier.

The tail between them is work the builder still owes the homeowner but can no
longer charge back to anyone. That gap is the entire reason this product exists.
`packages/warranty/src/clocks.ts` computes it.

Consequences for anyone changing code here:

- **`sub_assignments.sub_warranty_start` defaults to `completed_at`, never to
  the home's warranty start.** Collapsing those two dates would erase the thesis.
  This looks like a data-consistency bug and is not one.
- **`sub_assignments.completed_at` is the highest-value field in the schema.** A
  null there means the builder cannot prove who did the work and therefore
  cannot backcharge at all — the bus-factor failure. It is surfaced as a
  *critical alert*, not treated as missing data.
- **The rules engine is the IP.** Don't simplify `clocks.ts`, `coverage.ts`, or
  `dates.ts` for elegance. `dates.ts` anchors everything to UTC noon because an
  off-by-one at a warranty boundary is a real dollar error; `new Date("2026-03-14")`
  in a US timezone is the 13th. The tests pin the numbers the product's claims
  rest on (188 exposure days, 83 days late) — if you change behavior, change the
  test deliberately and say why.

## Design rules that are not negotiable

**AI proposes, a human decides.** `ai_assessments` and `determinations` are
separate tables on purpose. An automated coverage denial delivered to a consumer
with no human in the loop is a liability in a deposition and a
consumer-protection risk in several states. Never wire triage output straight to
a claim outcome. The split also produces labeled data — every coordinator
agreement or override is recorded against the proposal that prompted it.

**Uncited proposals are low-confidence by construction.** `triage.ts` forces
`needsHumanReview` when `citations` is empty, regardless of the confidence the
model reports. That rule lives in code, not the prompt, so it can't be talked
around.

**Triage is grounded in two documents, not one:** the builder's warranty
agreement *and* a performance tolerance table. Without the tolerance table,
"there's a crack in my drywall" has no defensible answer.

**`warranty_start_date` is stored with its source, never derived.** Closing
date, certificate-of-occupancy date, and possession date routinely differ and
warranty documents disagree about which governs. It is the most-disputed field
in the domain, so it carries `warranty_start_source` and a note.

**Photo EXIF is evidence.** Capture time and geotag are stored separately from
upload time, and `geo_verified` is three-state: `true`, `false`, or `null` when
the photo carries no geotag to check. `null` means "not checkable" and must not
be conflated with "failed".

**Homeowners never see raw AI output.** `GET /api/claims/:id` returns an empty
`assessments` array for the homeowner role. An unreviewed machine opinion is not
something to put in front of a customer.

## Tenancy

`builderIdOf(c)` reads the builder from the **JWT**, never from the request body.
Every builder-scoped query must filter on it, or one builder can read another's
lots by guessing an id. Homeowners are scoped through `home_ownerships`, and
prior owners keep read access to claims they filed — that matters after a resale.

## Conventions

- `packages/shared` and `packages/warranty` use **extensionless relative
  imports** (`./enums`, not `./enums.js`). drizzle-kit's bundler can't remap
  `.js` → `.ts` in workspace source. `apps/api` uses `.js` extensions and runs
  under `tsx`, which handles them.
- The workspace uses `node-linker=hoisted` (see `.npmrc`). React Native's Metro
  bundler cannot follow pnpm's symlinked store. Don't remove it.
- Zod is v3 across the repo. The Anthropic SDK's `zodOutputFormat` helper targets
  v4, so `triage.ts` emits JSON Schema via `zod-to-json-schema` and validates the
  response with the v3 schema. Migrating to v4 means moving
  `@hono/zod-validator` too.
- Postgres enums mirror the `as const` arrays in `packages/shared/src/enums.ts`.
  Adding a value means a migration.

## Known gaps

`docs/ROADMAP.md` is the maintained list. The load-bearing ones:

- **No tests outside `packages/warranty`.** Nothing covers auth, tenant
  isolation, the geo-verification math, or the exposure endpoint's assembly.
  This is the highest-value thing to add.
- **No admin write paths** for homes, communities, plans, or subcontractors —
  a real builder can't be onboarded without the seed script.
- **`appointments` / `appointment_claims` are unreferenced by any route.**
  Scheduling is a schema and nothing else, despite being the actual operational
  bottleneck for builders.
- **Right-to-cure columns are unwritten.** `statutory_notice_sent_at`,
  `statutory_response_due_at`, and `responded_at` exist on `claims` and nothing
  sets them. This is a compliance feature with real legal weight — see the
  statutes listed in `docs/DOMAIN.md`.
- **Photos are on local disk.** Fine for development, wrong for production —
  claim photos are evidence and belong in object storage with signed URLs.
- **No refresh tokens or session revocation**, and no rate limiting on login or
  upload.

## Tolerance data — licensing

`packages/warranty/src/tolerances.ts` ships widely-cited industry values as a
**structural placeholder**. The NAHB *Residential Construction Performance
Guidelines* are copyrighted. License them, adopt the builder's own published
standard, or use an applicable state standard before relying on this
commercially. Every consumer reads the table through `findTolerance()`, so
swapping the data doesn't touch call sites.
