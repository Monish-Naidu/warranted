# Getting a builder running, and the coordinator's week

How a new builder goes from nothing to a working warranty operation, what the
warranty coordinator actually does day to day, and where this product earns its
place in that work.

Read `docs/DOMAIN.md` first if you want the reasoning behind the model. This
document is the operational view: who does what, in what order, and what
changes because the system exists.

---

## What this replaces

At almost every regional builder, warranty operations today look like this:

- A binder or PDF of the limited warranty, handed to the homeowner at closing
  and never opened again.
- A spreadsheet of lots and closing dates, maintained by one person.
- Purchase orders in the accounting system, which record who was hired but not
  when they finished.
- The lot-to-sub mapping, the side deals, and the "we already fixed that once"
  history, held in the coordinator's memory.
- Homeowners texting one person's cell phone.

None of that is dysfunctional by accident. It works, right up until the
coordinator leaves, a homeowner disputes a date, or someone asks how much the
company spent last year on work a subcontractor should have paid for.

The three questions that system cannot answer are the three this product is
built around:

1. **Which trades am I carrying alone right now, and until when?**
2. **This repair cost me money. Can I still bill it to the sub who caused it?**
3. **Is this defect one house, or is it the plan?**

---

## Phase 1: Onboarding the builder

Done once, by whoever sets up the account. Perhaps an hour of work.

### 1.1 The builder record and staff

The builder org, then the people: a `builder_admin`, one or more
`warranty_coordinator`s, and `superintendent`s who see only their communities.

Roles matter beyond permissions. Every determination is stamped with the person
who made it, which is what makes the claim history hold up when a decision is
questioned a year later.

### 1.2 The warranty document

This is the single most important setup step, and the one most likely to be
rushed.

The builder's limited warranty is loaded once as `warranty_documents`, with its
clauses broken into `coverage_terms` tagged by tier and by whether each clause
grants coverage or excludes it. If the builder uses a third-party administrator
(2-10 HBW, PWSC, RWC, StrucSure), the structural tier points at their policy
while workmanship and systems stay with the builder.

Two documents are needed, not one: the warranty agreement *and* a performance
tolerance table. Without tolerances, "there is a crack in my drywall" has no
defensible answer. A 1/32 inch crack and a 1/4 inch crack are different
conversations, and only one of them is a defect.

**Why it matters:** every coverage decision the system proposes cites this
document by clause. A determination that quotes section 3.0(b) back to a
homeowner ends an argument. A determination that says "not covered" starts one.

### 1.3 Communities, plans, subcontractors

Communities and plans are small, stable lists. Plans matter more than they look:
they are what makes pattern detection possible later, so plan and elevation
should be recorded properly rather than lumped together.

Subcontractors come from the vendor master in accounts payable. Capture the
trade, the contact, the default warranty term from their contract, and the
certificate of insurance expiry.

**Why it matters:** a lapsed certificate of insurance turns a backcharge into a
write-off. The system flags it on the scorecard before it costs anything.

---

## Phase 2: Bringing a community online

Per community, at launch.

### 2.1 The lots

Homes are created as lots are released, from the builder's ERP (Hyphen, BuildPro,
MarkSystems, Newstar, BuilderTrend) rather than typed by hand.

### 2.2 Subcontractor assignments, as trades finish

This is the step that determines whether the entire product works, and it is
the one that fails at most builders.

Each trade on each lot gets an assignment: who did it, under which purchase
order, and **the date they finished**. That completion date starts the
subcontractor's warranty clock. It is not the same as the homeowner's clock and
must never be collapsed into it.

The volume is real. A builder doing 200 homes a year across roughly 20 to 25
trade purchase orders each is 4,000 to 5,000 assignment records annually. Nobody
types that. Three paths, in order of preference:

1. **Integration.** The purchase order closing, or the sub's invoice being
   approved, is the completion signal. This is the integration worth building
   first.
2. **Bulk import** at onboarding, and periodically after.
3. **The superintendent's phone**, recording completion at sign-off. Slower to
   build, but the most accurate, because it is captured by the person who
   actually knows.

Manual entry is the exception path, not the primary one.

**Why it matters:** an assignment with no completion date means there is no
provable window, so the trade cannot be backcharged at all, regardless of how
fast the claim arrives. In the demo data, Lot 15's framing has no completion
date, and the result is that the full 3,652 day structural window is
unrecoverable. One missing date, ten years of exposure.

---

## Phase 3: At closing, per lot

### 3.1 The warranty start date

Recorded with **which date it came from**: closing, certificate of occupancy,
possession, or first occupancy. Never derived.

Closing, CO, and possession routinely differ, and warranty documents disagree
about which one governs. This is the most disputed field in the domain. The
schema stores the source and a free-text note beside the date, and the portal
shows all three candidate dates with a flag when they disagree.

In the demo, Lot 23 runs from certificate of occupancy rather than the later
closing, because the buyer took possession early. Twelve months later, when that
homeowner argues their workmanship year has not expired, the answer and its
reasoning are already on the screen.

### 3.2 Milestones

The 30-day, 60-day, and 11-month reviews are scheduled from the warranty start.

The 11-month is the one that matters. It is the last practical chance to file
against the one-year workmanship tier, which is the largest and most-claimed
bucket. Homeowners miss it because nobody reminds them.

**Why it matters:** an unscheduled 11-month review on a lot whose subcontractor
warranties are already closing is the single highest-value alert in the system.
It is the difference between finding a defect while someone else still owes for
it, and finding it afterward.

---

## Phase 4: The coordinator's rhythm

### Every morning: the exposure board

Open on **Exposure**. The board answers "what is bleeding" in one screen:
critical alerts, warnings, trades with no completion date, unscheduled 11-month
reviews.

Each lot shows one bar per trade. The bar spans the builder's whole obligation
for that trade. The solid green segment is what the subcontractor's own warranty
still covers, the hatched red tail is what the builder carries alone, the green
line is where the sub's warranty ends, and the white line is today.

A critical alert means one of two things: a trade with no completion date, or a
subcontractor warranty about to close on a lot whose 11-month review is not yet
booked. Both are fixable in the minute you notice them, and expensive in the
month you do not.

### Every morning: missing dates

**Missing dates** lists every trade with no completion date, worst window first,
with the field to fix it on the row. Enter the date, the row disappears, the
lot's bar redraws with a real covered span, and the alert drops from critical to
a dated warning.

This is the highest-value data entry in the product. It is also the one that
walks out the door when the coordinator leaves, which is the whole reason the
ledger exists outside their head.

### Through the day: claims

A homeowner photographs a problem from their phone. The photo's capture time and
geotag are stored separately from the upload time, so "that photo is not of this
house" and "that was taken before closing" are both settled before they become
arguments.

Triage reads the claim against the warranty document and the tolerance table,
and proposes a determination with citations. It proposes. It never decides.

The coordinator reviews and records the determination. Two things happen at that
moment:

- The decision is stamped with who made it and whether it agreed with or
  overrode the proposal, which produces labelled data for measuring whether
  triage is any good.
- **Backcharge recoverability is computed then and there**, while the sub's
  window may still be open, rather than at invoice time months later when it is
  too late to act.

That second point is the design decision that makes the money work. "We think we
can charge this back" becomes a determination the coordinator can act on today.

### Weekly: subcontractors

**Subcontractors** splits warranty cost four ways, and the split is the point:

| Column | Meaning |
| --- | --- |
| To bill | Their warranty is open, nobody has invoiced them. **Actionable today.** |
| In flight | Billed, unsettled. Chase. |
| Collected | Actually recovered. |
| Lost | Expired, no sub of record, or written off. The leak. |

Expand a row for the individual backcharges, each linked to the claim it came
from, with the rationale recorded at the moment of decision, plus the sub's
contact details and a drafted chase email.

**Why it matters:** in the demo, $3,670 sits in "to bill". That money was
previously invisible, folded into a column labelled "recovered", which is
exactly how it goes uncollected in real life. Nobody chases what the report says
is already handled.

### Monthly: plan patterns

**Plan patterns** surfaces the same trade failing across multiple homes of one
plan. Two shower pans on the same plan is a coincidence. Six is a detail drawing
that needs changing before the next phase starts.

In the demo, the Cypress plan has grout cracking at a change of plane on both
homes. Same detail, same failure. That is a conversation with the tile
contractor and possibly the architect, not two repair tickets.

---

## Where the value lands

The clearest illustration is in the demo data, and it is not a hypothetical.

**Two identical defects. One collected, one written off.**

Lot 8 and Lot 19 are the same plan, the same drywall subcontractor, the same
finish defect. Lot 8's repair was collected in full. Lot 19's was written off,
118 days too late.

The only difference between them: Lot 19 sat as standing inventory for six
months after the drywall was finished, so the subcontractor's warranty closed
while the homeowner's had barely started. Nothing about the defect, the sub, or
the repair differed. Only the gap between two clocks that nobody was watching.

That gap is invisible in a spreadsheet of closing dates. It is the first thing
on the screen here.

**The rest of it:**

- $3,670 currently billable, which was previously reported as already recovered.
- $3,740 written off, itemised by which subcontractor caused it, which is a
  pricing conversation at the next bid rather than a vague sense that warranty
  costs too much.
- One missing completion date on Lot 15 costing a 3,652 day unrecoverable
  window, now sitting in a worklist with a field next to it.
- Four repeating plan defects that would otherwise have surfaced at home thirty
  instead of home six.

---

## What is built, and what is not

Honest, as of this document.

### Working end to end

| Capability | Route |
| --- | --- |
| Sign in | `POST /api/auth/login`, `GET /api/auth/me` |
| Exposure board and alerts | `GET /api/builder/exposure` |
| Record a subcontractor assignment | `POST /api/builder/homes/:homeId/assignments` |
| Backfill a completion date | `PATCH /api/builder/assignments/:assignmentId` |
| Schedule a milestone | `POST /api/homes/:homeId/milestones/:kind/schedule` |
| File a claim, with photos | `POST /api/claims`, `POST /api/claims/photos` |
| Triage a claim | `POST /api/claims/:claimId/triage` |
| Record a determination and compute the backcharge | `POST /api/claims/:claimId/determination` |
| Move a claim's status | `POST /api/claims/:claimId/status` |
| Subcontractor scorecard | `GET /api/builder/subcontractors/scorecard` |
| Plan patterns | `GET /api/builder/patterns` |

### Not built

- **No write path for homes, communities, plans, subcontractors, or warranty
  documents.** Phase 1 and Phase 2.1 above cannot be done through the product
  today. They come from the seed script. This is the gap that blocks onboarding
  a real builder.
- **No bulk import and no ERP integration.** Given the volume in Phase 2.2, this
  is what makes the difference between a demo and a deployment.
- **No backcharge status transitions.** The scorecard surfaces what to bill, but
  marking one issued or collected happens outside the system.
- **`appointments` and `appointment_claims` are schema only.** Scheduling is
  named in `docs/DOMAIN.md` as the real operational bottleneck, and nothing in
  the product touches it yet.
- **Right-to-cure columns are unwritten.** `statutory_notice_sent_at` and its
  siblings exist on `claims` and nothing sets them. This is a compliance feature
  with legal weight.
- **Photos are on local disk**, which does not work on the current deployment.
  Claim photos are evidence and belong in object storage with signed URLs.

`docs/ROADMAP.md` is the maintained list.
