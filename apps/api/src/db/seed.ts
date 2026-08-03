/**
 * Demo data for a small regional builder.
 *
 * Constructed so the exposure math is visible immediately: Lot 42 is a spec
 * home whose trades finished months before it closed, which is exactly the
 * clock mismatch that costs builders real money. Lot 7 is a healthy build-to-
 * order for contrast, and Lot 15 has an undocumented framing sub — the
 * bus-factor failure.
 */

import { addMonths, milestoneSchedule, today, type IsoDate } from "@warranted/warranty";
import { hashPassword } from "../auth/password.js";
import { db, pool } from "./index.js";
import {
  builders,
  claimEvents,
  claims,
  communities,
  coverageTerms,
  homeOwnerships,
  homes,
  milestones,
  plans,
  subAssignments,
  subcontractors,
  users,
  warranties,
  warrantyDocuments,
} from "./schema.js";

const DEMO_PASSWORD = "warranted-demo-2026";

/** Anchor the fixtures to today so the countdowns are always meaningful. */
const TODAY = today();
function monthsAgo(n: number): IsoDate {
  return addMonths(TODAY, -n);
}

async function main() {
  console.log("Seeding…");

  const passwordHash = await hashPassword(DEMO_PASSWORD);

  const [builder] = await db
    .insert(builders)
    .values({
      name: "Sandoval Homes",
      slug: "sandoval",
      state: "TX",
      phone: "512-555-0142",
      supportEmail: "warranty@sandovalhomes.example",
    })
    .returning();
  if (!builder) throw new Error("builder insert failed");

  const [admin, coordinator, ownerA, ownerB, ownerC] = await db
    .insert(users)
    .values([
      {
        email: "admin@sandovalhomes.example",
        passwordHash,
        fullName: "Dana Sandoval",
        role: "builder_admin",
        builderId: builder.id,
      },
      {
        email: "coordinator@sandovalhomes.example",
        passwordHash,
        fullName: "Rae Whitfield",
        role: "warranty_coordinator",
        builderId: builder.id,
      },
      {
        email: "owner.lot42@example.com",
        passwordHash,
        fullName: "Priya Raman",
        role: "homeowner",
        builderId: null,
      },
      {
        email: "owner.lot7@example.com",
        passwordHash,
        fullName: "Marcus Oyelaran",
        role: "homeowner",
        builderId: null,
      },
      {
        email: "owner.lot15@example.com",
        passwordHash,
        fullName: "Sam Trelawny",
        role: "homeowner",
        builderId: null,
      },
    ])
    .returning();

  const [community] = await db
    .insert(communities)
    .values({
      builderId: builder.id,
      name: "Cedar Hollow",
      city: "Round Rock",
      state: "TX",
      postalCode: "78665",
    })
    .returning();
  if (!community) throw new Error("community insert failed");

  const [aspen, birch] = await db
    .insert(plans)
    .values([
      { builderId: builder.id, name: "Aspen", elevation: "B", squareFeet: 2410 },
      { builderId: builder.id, name: "Birch", elevation: "A", squareFeet: 1980 },
    ])
    .returning();

  // -------------------------------------------------------------------------
  // homes
  // -------------------------------------------------------------------------

  const [lot42, lot7, lot15] = await db
    .insert(homes)
    .values([
      {
        builderId: builder.id,
        communityId: community.id,
        planId: aspen?.id ?? null,
        lotNumber: "42",
        addressLine1: "1204 Cedar Hollow Dr",
        city: "Round Rock",
        state: "TX",
        postalCode: "78665",
        latitude: 30.5388,
        longitude: -97.6289,
        // A spec home: finished well before it sold.
        certificateOfOccupancyDate: monthsAgo(16),
        closingDate: monthsAgo(10),
        possessionDate: monthsAgo(10),
        warrantyStartDate: monthsAgo(10),
        warrantyStartSource: "closing_date",
        warrantyStartNote:
          "Warranty agreement §2.1 runs from closing. CO predates closing by six months (standing inventory) — subcontractor clocks started at completion, not at closing.",
      },
      {
        builderId: builder.id,
        communityId: community.id,
        planId: aspen?.id ?? null,
        lotNumber: "7",
        addressLine1: "1118 Cedar Hollow Dr",
        city: "Round Rock",
        state: "TX",
        postalCode: "78665",
        latitude: 30.5372,
        longitude: -97.6301,
        certificateOfOccupancyDate: monthsAgo(9),
        closingDate: monthsAgo(9),
        possessionDate: monthsAgo(9),
        warrantyStartDate: monthsAgo(9),
        warrantyStartSource: "closing_date",
        warrantyStartNote: "Build-to-order; CO and closing within the same week.",
      },
      {
        builderId: builder.id,
        communityId: community.id,
        planId: birch?.id ?? null,
        lotNumber: "15",
        addressLine1: "1150 Cedar Hollow Dr",
        city: "Round Rock",
        state: "TX",
        postalCode: "78665",
        latitude: 30.5379,
        longitude: -97.6295,
        certificateOfOccupancyDate: monthsAgo(7),
        closingDate: monthsAgo(6),
        possessionDate: monthsAgo(6),
        warrantyStartDate: monthsAgo(6),
        warrantyStartSource: "closing_date",
        warrantyStartNote: "Standard closing-date start.",
      },
    ])
    .returning();

  if (!lot42 || !lot7 || !lot15) throw new Error("home insert failed");

  await db.insert(homeOwnerships).values([
    { homeId: lot42.id, userId: ownerA!.id, isOriginalOwner: true, startedAt: lot42.warrantyStartDate },
    { homeId: lot7.id, userId: ownerB!.id, isOriginalOwner: true, startedAt: lot7.warrantyStartDate },
    { homeId: lot15.id, userId: ownerC!.id, isOriginalOwner: true, startedAt: lot15.warrantyStartDate },
  ]);

  // -------------------------------------------------------------------------
  // warranty document + terms
  // -------------------------------------------------------------------------

  const [doc] = await db
    .insert(warrantyDocuments)
    .values({
      builderId: builder.id,
      title: "Sandoval Homes Limited Warranty (2026 program)",
      effectiveDate: monthsAgo(24),
      extractedText: `SANDOVAL HOMES LIMITED WARRANTY

2.1 TERM. Coverage begins on the date of closing and continues as follows:
  (a) One (1) year on workmanship and materials.
  (b) Two (2) years on plumbing, electrical, heating, ventilation, air conditioning, and mechanical distribution systems.
  (c) Ten (10) years on major structural components, defined as load-bearing elements whose failure makes the home unsafe or unlivable.

3.0 EXCLUSIONS. This warranty does not cover:
  (a) Normal wear and tear, or damage from ordinary use.
  (b) Damage caused by the Homeowner's failure to perform routine maintenance, including but not limited to replacement of HVAC filters, re-caulking of tubs, showers, sinks, and countertops, re-sealing of grout in wet areas, and maintenance of original grading and drainage.
  (c) Alterations, additions, pools, spas, or landscaping installed after closing, and any condition arising from them.
  (d) Consumer products and appliances, which carry the manufacturer's own warranty and are assigned to the Homeowner at closing.
  (e) Damage from storm, hail, wind, flood, fire, impact, or other casualty, which is the subject of the Homeowner's insurance.
  (f) Conditions within the tolerances set out in the applicable performance standards.

4.0 EMERGENCY SERVICE. The Builder shall respond within twenty-four (24) hours to conditions presenting immediate risk to health, safety, or the structure, including total loss of heating or cooling in extreme weather, total loss of electrical service, plumbing leaks causing active water damage, sewage backup, and gas leaks. Emergency response does not itself establish coverage.

5.0 NOTICE AND OPPORTUNITY TO REPAIR. The Homeowner shall provide written notice of any claimed defect. The Builder shall have sixty (60) days from receipt to inspect and offer to repair, consistent with Chapter 27 of the Texas Property Code.

6.0 TRANSFER. Coverage under §2.1(c) transfers to a subsequent owner for the remainder of its term. Coverage under §2.1(a) and §2.1(b) is personal to the original Homeowner and does not transfer.`,
    })
    .returning();

  if (doc) {
    await db.insert(coverageTerms).values([
      {
        documentId: doc.id,
        tier: "workmanship",
        heading: "§2.1(a) Workmanship and materials",
        body: "One (1) year on workmanship and materials from the date of closing.",
        isCoverage: true,
        pageNumber: 1,
      },
      {
        documentId: doc.id,
        tier: "systems",
        heading: "§2.1(b) Systems",
        body: "Two (2) years on plumbing, electrical, HVAC, and mechanical distribution.",
        isCoverage: true,
        pageNumber: 1,
      },
      {
        documentId: doc.id,
        tier: "structural",
        heading: "§2.1(c) Major structural",
        body: "Ten (10) years on load-bearing elements whose failure makes the home unsafe or unlivable.",
        isCoverage: true,
        pageNumber: 1,
      },
      {
        documentId: doc.id,
        heading: "§3.0(b) Homeowner maintenance",
        body: "Excludes damage from failure to perform routine maintenance: HVAC filters, re-caulking, grout sealing, and maintenance of original grading and drainage.",
        isCoverage: false,
        pageNumber: 2,
      },
      {
        documentId: doc.id,
        trade: "appliances",
        heading: "§3.0(d) Consumer products",
        body: "Appliances carry the manufacturer's own warranty, assigned to the Homeowner at closing.",
        isCoverage: false,
        pageNumber: 2,
      },
    ]);
  }

  for (const home of [lot42, lot7, lot15]) {
    const start = home.warrantyStartDate as IsoDate;
    await db.insert(warranties).values([
      {
        homeId: home.id,
        tier: "workmanship",
        startDate: start,
        endDate: addMonths(start, 12),
        documentId: doc?.id ?? null,
        transfersOnResale: false,
      },
      {
        homeId: home.id,
        tier: "systems",
        startDate: start,
        endDate: addMonths(start, 24),
        documentId: doc?.id ?? null,
        transfersOnResale: false,
      },
      {
        homeId: home.id,
        tier: "structural",
        startDate: start,
        endDate: addMonths(start, 120),
        documentId: doc?.id ?? null,
        administrator: "2-10 Home Buyers Warranty",
        policyNumber: `TX-${home.lotNumber}-88231`,
        transfersOnResale: true,
      },
    ]);

    // Milestones, with the 11-month left unscheduled on Lot 42 on purpose —
    // that combination is what escalates its alerts to critical.
    await db.insert(milestones).values(
      milestoneSchedule(start, TODAY).map((m) => ({
        homeId: home.id,
        kind: m.kind,
        dueDate: m.dueDate,
        status:
          m.kind === "eleven_month"
            ? ("pending" as const)
            : m.overdue
              ? ("completed" as const)
              : ("pending" as const),
        completedAt: m.kind !== "eleven_month" && m.overdue ? new Date() : null,
      })),
    );
  }

  // -------------------------------------------------------------------------
  // subcontractors and the second clock
  // -------------------------------------------------------------------------

  const subs = await db
    .insert(subcontractors)
    .values([
      {
        builderId: builder.id,
        companyName: "Valley Drywall & Paint",
        primaryTrade: "drywall",
        contactName: "Hector Villarreal",
        email: "hector@valleydrywall.example",
        phone: "512-555-0188",
        insuranceExpiresOn: addMonths(TODAY, 4),
        defaultWarrantyMonths: 12,
      },
      {
        builderId: builder.id,
        companyName: "Copper State Plumbing",
        primaryTrade: "plumbing",
        contactName: "Nadia Kwon",
        email: "nadia@copperstate.example",
        phone: "512-555-0177",
        insuranceExpiresOn: addMonths(TODAY, 9),
        defaultWarrantyMonths: 24,
      },
      {
        builderId: builder.id,
        companyName: "Lone Star Mechanical",
        primaryTrade: "hvac",
        contactName: "Devon Achebe",
        email: "devon@lonestarmech.example",
        phone: "512-555-0166",
        insuranceExpiresOn: addMonths(TODAY, -1), // lapsed — its own liability
        defaultWarrantyMonths: 24,
      },
      {
        builderId: builder.id,
        companyName: "Hill Country Framing",
        primaryTrade: "framing",
        contactName: "Tomasz Bielecki",
        email: "tomasz@hcframing.example",
        phone: "512-555-0155",
        defaultWarrantyMonths: 12,
      },
      {
        builderId: builder.id,
        companyName: "Brightline Electric",
        primaryTrade: "electrical",
        contactName: "Ines Moreau",
        email: "ines@brightline.example",
        phone: "512-555-0144",
        insuranceExpiresOn: addMonths(TODAY, 7),
        defaultWarrantyMonths: 24,
      },
    ])
    .returning();

  const [drywall, plumbing, hvac, framing, electrical] = subs;

  await db.insert(subAssignments).values([
    // Lot 42 — the spec home. Trades finished ~16 months ago; the house closed
    // ten months ago. Sub warranties are already closing while the homeowner's
    // workmanship year still has two months to run.
    {
      homeId: lot42.id,
      subcontractorId: drywall!.id,
      trade: "drywall",
      scopeDescription: "Hang, tape, float, texture; interior paint",
      completedAt: monthsAgo(17),
      subWarrantyMonths: 12,
      contractReference: "PO-2024-0412",
    },
    {
      homeId: lot42.id,
      subcontractorId: electrical!.id,
      trade: "electrical",
      scopeDescription: "Rough-in and trim-out",
      completedAt: monthsAgo(18),
      subWarrantyMonths: 24,
      contractReference: "PO-2024-0399",
    },
    {
      homeId: lot42.id,
      subcontractorId: plumbing!.id,
      trade: "plumbing",
      scopeDescription: "Rough-in, top-out, trim",
      completedAt: monthsAgo(19),
      subWarrantyMonths: 24,
      contractReference: "PO-2024-0381",
    },
    {
      homeId: lot42.id,
      subcontractorId: hvac!.id,
      trade: "hvac",
      scopeDescription: "Equipment set, duct, registers, start-up",
      completedAt: monthsAgo(17),
      subWarrantyMonths: 24,
      contractReference: "PO-2024-0405",
    },

    // Lot 7 — healthy. Trades finished close to closing, so the clocks line up.
    {
      homeId: lot7.id,
      subcontractorId: drywall!.id,
      trade: "drywall",
      completedAt: monthsAgo(10),
      subWarrantyMonths: 12,
      contractReference: "PO-2025-0117",
    },
    {
      homeId: lot7.id,
      subcontractorId: plumbing!.id,
      trade: "plumbing",
      completedAt: monthsAgo(11),
      subWarrantyMonths: 24,
      contractReference: "PO-2025-0108",
    },

    // Lot 15 — the bus-factor failure. Nobody recorded when framing finished,
    // so there is no provable window to charge back against.
    {
      homeId: lot15.id,
      subcontractorId: framing!.id,
      trade: "framing",
      scopeDescription: "Frame, sheath, dry-in",
      completedAt: null,
      subWarrantyMonths: 12,
      contractReference: null,
    },
    {
      homeId: lot15.id,
      subcontractorId: drywall!.id,
      trade: "drywall",
      completedAt: monthsAgo(8),
      subWarrantyMonths: 12,
      contractReference: "PO-2025-0341",
    },
  ]);

  // -------------------------------------------------------------------------
  // a couple of claims
  // -------------------------------------------------------------------------

  const [crack, hvacClaim] = await db
    .insert(claims)
    .values([
      {
        builderId: builder.id,
        homeId: lot42.id,
        reportedByUserId: ownerA!.id,
        reference: "WC-1001",
        title: "Crack above the living room doorway",
        description:
          "There's a crack in the drywall running diagonally up from the corner of the doorway into the living room. It's maybe a foot long. It seems to have gotten a bit longer since we moved in.",
        room: "Living room",
        reportedSeverity: "routine",
        reportedOn: TODAY,
        status: "submitted",
      },
      {
        builderId: builder.id,
        homeId: lot42.id,
        reportedByUserId: ownerA!.id,
        reference: "WC-1002",
        title: "Upstairs bedrooms won't cool",
        description:
          "The two bedrooms upstairs stay about 8 degrees warmer than the thermostat setting on hot afternoons. Downstairs is fine. We changed the filter last month.",
        room: "Upstairs bedrooms",
        reportedSeverity: "urgent",
        reportedOn: TODAY,
        status: "submitted",
      },
    ])
    .returning();

  for (const claim of [crack, hvacClaim]) {
    if (!claim) continue;
    await db.insert(claimEvents).values({
      claimId: claim.id,
      actorUserId: ownerA!.id,
      kind: "submitted",
      toStatus: "submitted",
      note: "Filed from the mobile app.",
    });
  }

  console.log(`
Seeded Sandoval Homes (Cedar Hollow, Round Rock TX).

  Builder portal — http://localhost:5173
    admin@sandovalhomes.example         (builder admin)
    coordinator@sandovalhomes.example   (warranty coordinator)

  Mobile app
    owner.lot42@example.com   Lot 42 — spec home, sub clocks already closing
    owner.lot7@example.com    Lot 7  — healthy build-to-order
    owner.lot15@example.com   Lot 15 — framing sub undocumented

  Password for every account: ${DEMO_PASSWORD}

Open the builder portal's exposure board to see Lot 42's uncovered tail.
`);

  await pool.end();
}

main().catch(async (error) => {
  console.error("Seed failed:", error);
  await pool.end();
  process.exit(1);
});
