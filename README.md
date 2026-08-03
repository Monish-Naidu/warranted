# Warranted

Warranty infrastructure connecting home buyers to their builders.

Homeowners photograph problems in their new home; the system checks them against the
actual warranty they were given, tracks the deadlines nobody remembers, and routes the
work. Builders get a shared system of record for coverage, subcontractor liability, and
scheduling — instead of one person's spreadsheet and memory.

---

## Why this exists

### The homeowner problem

New-home warranties follow a **1‑2‑10** structure almost everywhere in the US:

| Tier | Duration | Covers |
| --- | --- | --- |
| Workmanship & materials | 1 year | Drywall, paint, trim, doors, flooring, fixtures, caulk |
| Systems | 2 years | Plumbing, electrical, HVAC, mechanical distribution |
| Major structural | 10 years | Load-bearing failure only (foundation, framing, roof structure) |

The industry service ritual is **orientation walkthrough at closing → 30/60-day →
11-month**. The 11-month visit exists because it is the last chance to file against the
1-year workmanship tier — the largest and most-claimed bucket.

Homeowners routinely miss it. Their warranty is a PDF in a closing binder. Nobody reminds
them. They report problems by text to one person, so there is no timestamped record when
it's disputed at month 13. And they can't tell a real defect from normal first-year
settling, so they file excluded items and lose trust, or stay quiet about real ones.

### The builder problem — the money leak

The builder's exposure is not that homeowners file too much. It is a **clock mismatch**:

- The **homeowner's** warranty starts at **closing**.
- The **subcontractor's** warranty to the builder starts at **their completion** — often
  3–9 months earlier on a slow-selling phase or a spec home.

So a drywall sub who finished in March on a house that closed in September has ~3 months
of coverage left when the homeowner's 12-month clock is only starting. **Every workmanship
claim filed after the sub's window closes is cash out of the builder's pocket for work
someone else owes.**

That makes the core object of this product not "the warranty" but **two clocks per trade
per lot**. The single highest-value alert in the system is:

> *Lot 42 — electrical sub warranty expires in 21 days, and the 11-month inspection is
> not yet scheduled.*

Nobody sells that today.

### The other builder gaps

- **Bus factor.** One warranty coordinator holds the lot→sub mapping, the side deals, and
  the repair history in their head. When they leave, the company loses the ability to
  prove who did the work — and therefore to backcharge at all.
- **Scheduling is the real bottleneck**, not adjudication. Three-way coordination between
  homeowner, coordinator, and sub. Trades that should be batched into one visit aren't.
- **No pattern detection.** Plans repeat. If "Aspen elevation B" has shower-pan failures
  in 6 of 40 homes, that should surface at home 6, not home 30.
- **No sub scorecard.** Claim rate, response time, and warranty spend per sub is
  procurement leverage worth more than the warranty savings themselves.
- **Statutory right-to-cure exposure.** Most states (TX RCLA, CA Civ. Code §895 et seq.,
  FL Ch. 558, WA, and ~30 others) require written notice and a defined builder response
  window before a homeowner can sue. A timestamped notice/response log is a litigation
  asset — often the reason a builder's attorney wants this software.

### The gap neither side sees

Closing date, certificate-of-occupancy date, and possession date differ, and warranty
documents are inconsistent about which starts the clock. It is the most common source of
boundary disputes. Here, `warranty_start_date` is an **explicit, sourced, auditable field**
on every home with the document it came from — never a derived value.

---

## Where AI belongs, and where it doesn't

Triage is grounded in **two** documents, not one:

1. The builder's specific warranty agreement — coverage, exclusions, terms.
2. An industry **performance tolerance table** — the standard that defines *when* a
   condition becomes a defect (drywall cracks over ⅛", concrete over ¼", floors out of
   level more than ⅜" in 32"). This is what turns "here's a photo of a crack" into a
   defensible determination.

The model **classifies, cites, routes, and drafts**: tags the trade, matches the clause and
tolerance, flags emergency vs. routine, identifies manufacturer-passthrough items, detects
duplicates on the same lot, and surfaces plan-level patterns.

The model **does not decide**. An automated coverage denial sent to a consumer with no
human in the loop is a liability in a deposition and a consumer-protection risk in several
states. The flow is **AI proposes with citations → coordinator approves in one tap**.
That also produces labeled data — every agreement and override is recorded in
`determinations` for evaluating and improving triage quality.

> ⚠️ **Tolerance data.** `packages/warranty/src/tolerances.ts` ships with commonly-cited
> industry values as a *structural placeholder*. The NAHB Residential Construction
> Performance Guidelines are copyrighted — license them, or substitute your own published
> standard, before relying on this commercially.

Photo EXIF timestamps and geotags are captured and checked against the lot's coordinates.
That kills the "you took that photo at your old house" and "you reported that last week,
not last year" dispute classes for nearly free.

---

## Architecture

```
warranted/
├── apps/
│   ├── mobile/     Expo (React Native) — iOS + Android, homeowner-facing
│   ├── web/        Vite + React — builder portal
│   └── api/        Hono + TypeScript, Postgres via Drizzle
└── packages/
    ├── shared/     zod schemas, shared types, typed API client
    └── warranty/   coverage rules engine + tolerance table + clock math
```

One TypeScript codebase for iOS and Android, sharing validation and types with the portal
and API, so a claim shape can't drift between the three surfaces.

---

## Setup

Requires Node 22+, pnpm 11+, and Postgres 17.

```bash
# Postgres (macOS)
brew install postgresql@17
brew services start postgresql@17
createdb warranted

# App
pnpm install
cp apps/api/.env.example apps/api/.env   # then add your ANTHROPIC_API_KEY
pnpm db:migrate
pnpm db:seed
```

Run it:

```bash
pnpm dev          # API on :3001, builder portal on :5173
pnpm dev:mobile   # Expo — press i for iOS simulator, or scan for a device
```

Seeded logins are printed by `pnpm db:seed`.

---

## Status

Early scaffold. See `docs/ROADMAP.md` for what's built and what's next.
