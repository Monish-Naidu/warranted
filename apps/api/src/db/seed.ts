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
  backcharges,
  builders,
  claimEvents,
  claims,
  communities,
  coverageTerms,
  determinations,
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

/**
 * Lots whose 11-month review is deliberately still unbooked. That single fact
 * is what turns an exposure warning into a critical alert, so the demo needs
 * both cases present — not every lot failing.
 */
const ELEVEN_MONTH_UNSCHEDULED = new Set(["42", "19"]);
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

  const [
    admin,
    coordinator,
    ownerA,
    ownerB,
    ownerC,
    ownerD,
    ownerE,
    ownerF,
    ownerG,
    ownerH,
    ownerI,
    ownerJ,
  ] = await db
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
      // The rest of the community. These homes carry the claim history that
      // makes plan-level patterns and the subcontractor scorecard meaningful.
      {
        email: "owner.lot8@example.com",
        passwordHash,
        fullName: "Bea Okonkwo",
        role: "homeowner",
        builderId: null,
      },
      {
        email: "owner.lot19@example.com",
        passwordHash,
        fullName: "Curtis Delgado",
        role: "homeowner",
        builderId: null,
      },
      {
        email: "owner.lot27@example.com",
        passwordHash,
        fullName: "Yuki Tanabe",
        role: "homeowner",
        builderId: null,
      },
      {
        email: "owner.lot23@example.com",
        passwordHash,
        fullName: "Ravi Menon",
        role: "homeowner",
        builderId: null,
      },
      {
        email: "owner.lot31@example.com",
        passwordHash,
        fullName: "Alma Fitzgerald",
        role: "homeowner",
        builderId: null,
      },
      {
        email: "owner.lot44@example.com",
        passwordHash,
        fullName: "Theo Brandt",
        role: "homeowner",
        builderId: null,
      },
      {
        email: "owner.lot51@example.com",
        passwordHash,
        fullName: "Nina Sørensen",
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

  const [aspen, birch, cypress] = await db
    .insert(plans)
    .values([
      { builderId: builder.id, name: "Aspen", elevation: "B", squareFeet: 2410 },
      { builderId: builder.id, name: "Birch", elevation: "A", squareFeet: 1980 },
      { builderId: builder.id, name: "Cypress", elevation: "C", squareFeet: 2760 },
    ])
    .returning();

  // -------------------------------------------------------------------------
  // homes
  // -------------------------------------------------------------------------

  const [lot42, lot7, lot15, lot8, lot19, lot27, lot23, lot31, lot44, lot51] = await db
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

      // ----------------------------------------------------------------------
      // The rest of Cedar Hollow.
      //
      // Three lots on Aspen and two on Birch alongside the originals, plus two
      // on Cypress. Repeating plans are the point: they are what let the same
      // defect show up as a pattern rather than as unrelated one-offs.
      // ----------------------------------------------------------------------
      {
        builderId: builder.id,
        communityId: community.id,
        planId: aspen?.id ?? null,
        lotNumber: "8",
        addressLine1: "1122 Cedar Hollow Dr",
        city: "Round Rock",
        state: "TX",
        postalCode: "78665",
        latitude: 30.5374,
        longitude: -97.6299,
        certificateOfOccupancyDate: monthsAgo(12),
        closingDate: monthsAgo(11),
        possessionDate: monthsAgo(11),
        warrantyStartDate: monthsAgo(11),
        warrantyStartSource: "closing_date",
        warrantyStartNote: "Standard closing-date start.",
      },
      {
        builderId: builder.id,
        communityId: community.id,
        planId: aspen?.id ?? null,
        lotNumber: "19",
        addressLine1: "1206 Cedar Hollow Dr",
        city: "Round Rock",
        state: "TX",
        postalCode: "78665",
        latitude: 30.5383,
        longitude: -97.6284,
        certificateOfOccupancyDate: monthsAgo(15),
        closingDate: monthsAgo(9),
        possessionDate: monthsAgo(9),
        warrantyStartDate: monthsAgo(9),
        warrantyStartSource: "closing_date",
        warrantyStartNote:
          "Second spec on the phase. CO six months before closing — same clock mismatch as Lot 42.",
      },
      {
        builderId: builder.id,
        communityId: community.id,
        planId: aspen?.id ?? null,
        lotNumber: "27",
        addressLine1: "1240 Cedar Hollow Dr",
        city: "Round Rock",
        state: "TX",
        postalCode: "78665",
        latitude: 30.5391,
        longitude: -97.6277,
        certificateOfOccupancyDate: monthsAgo(8),
        closingDate: monthsAgo(8),
        possessionDate: monthsAgo(8),
        warrantyStartDate: monthsAgo(8),
        warrantyStartSource: "closing_date",
        warrantyStartNote: "Build-to-order.",
      },
      {
        builderId: builder.id,
        communityId: community.id,
        planId: birch?.id ?? null,
        lotNumber: "23",
        addressLine1: "1218 Cedar Hollow Dr",
        city: "Round Rock",
        state: "TX",
        postalCode: "78665",
        latitude: 30.5386,
        longitude: -97.6281,
        certificateOfOccupancyDate: monthsAgo(14),
        closingDate: monthsAgo(13),
        possessionDate: monthsAgo(13),
        warrantyStartDate: monthsAgo(13),
        warrantyStartSource: "certificate_of_occupancy",
        warrantyStartNote:
          "Buyer took possession at CO under an early-occupancy agreement; warranty runs from CO, not the later closing.",
      },
      {
        builderId: builder.id,
        communityId: community.id,
        planId: birch?.id ?? null,
        lotNumber: "31",
        addressLine1: "1254 Cedar Hollow Dr",
        city: "Round Rock",
        state: "TX",
        postalCode: "78665",
        latitude: 30.5394,
        longitude: -97.6271,
        certificateOfOccupancyDate: monthsAgo(5),
        closingDate: monthsAgo(4),
        possessionDate: monthsAgo(4),
        warrantyStartDate: monthsAgo(4),
        warrantyStartSource: "closing_date",
        warrantyStartNote: "Standard closing-date start.",
      },
      {
        builderId: builder.id,
        communityId: community.id,
        planId: cypress?.id ?? null,
        lotNumber: "44",
        addressLine1: "1301 Cedar Hollow Ct",
        city: "Round Rock",
        state: "TX",
        postalCode: "78665",
        latitude: 30.5401,
        longitude: -97.6264,
        certificateOfOccupancyDate: monthsAgo(7),
        closingDate: monthsAgo(7),
        possessionDate: monthsAgo(7),
        warrantyStartDate: monthsAgo(7),
        warrantyStartSource: "closing_date",
        warrantyStartNote: "Standard closing-date start.",
      },
      {
        builderId: builder.id,
        communityId: community.id,
        planId: cypress?.id ?? null,
        lotNumber: "51",
        addressLine1: "1315 Cedar Hollow Ct",
        city: "Round Rock",
        state: "TX",
        postalCode: "78665",
        latitude: 30.5406,
        longitude: -97.6258,
        certificateOfOccupancyDate: monthsAgo(6),
        closingDate: monthsAgo(5),
        possessionDate: monthsAgo(5),
        warrantyStartDate: monthsAgo(5),
        warrantyStartSource: "closing_date",
        warrantyStartNote: "Standard closing-date start.",
      },
    ])
    .returning();

  if (!lot42 || !lot7 || !lot15) throw new Error("home insert failed");
  if (!lot8 || !lot19 || !lot27 || !lot23 || !lot31 || !lot44 || !lot51) {
    throw new Error("home insert failed");
  }

  const allHomes = [lot42, lot7, lot15, lot8, lot19, lot27, lot23, lot31, lot44, lot51];

  await db.insert(homeOwnerships).values(
    [
      [lot42, ownerA],
      [lot7, ownerB],
      [lot15, ownerC],
      [lot8, ownerD],
      [lot19, ownerE],
      [lot27, ownerF],
      [lot23, ownerG],
      [lot31, ownerH],
      [lot44, ownerI],
      [lot51, ownerJ],
    ].map(([home, owner]) => ({
      homeId: (home as typeof lot42).id,
      userId: (owner as NonNullable<typeof ownerA>).id,
      isOriginalOwner: true,
      startedAt: (home as typeof lot42).warrantyStartDate,
    })),
  );

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

  for (const home of allHomes) {
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

    // Milestones. The 11-month is left unscheduled on Lot 42 and Lot 19 on
    // purpose — an unscheduled 11-month is what escalates an exposure alert
    // from warning to critical, and both are spec homes whose sub clocks are
    // already closing. The rest are booked, so the board shows the healthy
    // case alongside the failing one.
    const elevenMonthBooked = !ELEVEN_MONTH_UNSCHEDULED.has(home.lotNumber);

    await db.insert(milestones).values(
      milestoneSchedule(start, TODAY).map((m) => ({
        homeId: home.id,
        kind: m.kind,
        dueDate: m.dueDate,
        status:
          m.kind === "eleven_month"
            ? elevenMonthBooked
              ? ("scheduled" as const)
              : ("pending" as const)
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
      {
        builderId: builder.id,
        companyName: "Sabine Tile & Stone",
        primaryTrade: "tile",
        contactName: "Marisol Cabrera",
        email: "marisol@sabinetile.example",
        phone: "512-555-0133",
        insuranceExpiresOn: addMonths(TODAY, 5),
        defaultWarrantyMonths: 12,
      },
      {
        builderId: builder.id,
        companyName: "Guadalupe Roofing",
        primaryTrade: "roofing",
        contactName: "Owen Farrell",
        email: "owen@guadaluperoofing.example",
        phone: "512-555-0122",
        insuranceExpiresOn: addMonths(TODAY, 11),
        defaultWarrantyMonths: 24,
      },
    ])
    .returning();

  const [drywall, plumbing, hvac, framing, electrical, tile, roofing] = subs;

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
    {
      homeId: lot15.id,
      subcontractorId: plumbing!.id,
      trade: "plumbing",
      completedAt: monthsAgo(9),
      subWarrantyMonths: 24,
      contractReference: "PO-2025-0338",
    },

    // Lot 8 — closed a month after CO; clocks nearly line up.
    ...[
      { sub: drywall!, trade: "drywall" as const, months: 12, done: 12 },
      { sub: plumbing!, trade: "plumbing" as const, months: 24, done: 13 },
      { sub: electrical!, trade: "electrical" as const, months: 24, done: 13 },
    ].map((a, i) => ({
      homeId: lot8.id,
      subcontractorId: a.sub.id,
      trade: a.trade,
      completedAt: monthsAgo(a.done),
      subWarrantyMonths: a.months,
      contractReference: `PO-2025-05${10 + i}`,
    })),

    // Lot 19 — the second spec. Same shape as Lot 42: trades finished long
    // before the sale, so the tail is wide and the 11-month is still unbooked.
    ...[
      { sub: drywall!, trade: "drywall" as const, months: 12, done: 16 },
      { sub: hvac!, trade: "hvac" as const, months: 24, done: 16 },
      { sub: roofing!, trade: "roofing" as const, months: 24, done: 17 },
    ].map((a, i) => ({
      homeId: lot19.id,
      subcontractorId: a.sub.id,
      trade: a.trade,
      completedAt: monthsAgo(a.done),
      subWarrantyMonths: a.months,
      contractReference: `PO-2024-06${20 + i}`,
    })),

    // Lot 27 — healthy build-to-order.
    ...[
      { sub: drywall!, trade: "drywall" as const, months: 12, done: 8 },
      { sub: hvac!, trade: "hvac" as const, months: 24, done: 9 },
    ].map((a, i) => ({
      homeId: lot27.id,
      subcontractorId: a.sub.id,
      trade: a.trade,
      completedAt: monthsAgo(a.done),
      subWarrantyMonths: a.months,
      contractReference: `PO-2025-07${30 + i}`,
    })),

    // Lot 23 — oldest home in the community; workmanship year already closed.
    ...[
      { sub: plumbing!, trade: "plumbing" as const, months: 24, done: 15 },
      { sub: drywall!, trade: "drywall" as const, months: 12, done: 14 },
    ].map((a, i) => ({
      homeId: lot23.id,
      subcontractorId: a.sub.id,
      trade: a.trade,
      completedAt: monthsAgo(a.done),
      subWarrantyMonths: a.months,
      contractReference: `PO-2024-08${40 + i}`,
    })),

    // Lot 31 — newest. Everything still comfortably covered.
    ...[
      { sub: plumbing!, trade: "plumbing" as const, months: 24, done: 5 },
      { sub: drywall!, trade: "drywall" as const, months: 12, done: 5 },
    ].map((a, i) => ({
      homeId: lot31.id,
      subcontractorId: a.sub.id,
      trade: a.trade,
      completedAt: monthsAgo(a.done),
      subWarrantyMonths: a.months,
      contractReference: `PO-2026-09${50 + i}`,
    })),

    // Lots 44 and 51 — Cypress. The tile sub is the one to watch here.
    ...[
      { sub: tile!, trade: "tile" as const, months: 12, done: 8 },
      { sub: plumbing!, trade: "plumbing" as const, months: 24, done: 9 },
    ].map((a, i) => ({
      homeId: lot44.id,
      subcontractorId: a.sub.id,
      trade: a.trade,
      completedAt: monthsAgo(a.done),
      subWarrantyMonths: a.months,
      contractReference: `PO-2025-10${60 + i}`,
    })),
    ...[
      { sub: tile!, trade: "tile" as const, months: 12, done: 7 },
      { sub: roofing!, trade: "roofing" as const, months: 24, done: 8 },
    ].map((a, i) => ({
      homeId: lot51.id,
      subcontractorId: a.sub.id,
      trade: a.trade,
      completedAt: monthsAgo(a.done),
      subWarrantyMonths: a.months,
      contractReference: `PO-2025-11${70 + i}`,
    })),
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

  // ---------------------------------------------------------------------------
  // claim history
  //
  // The two claims above are left untriaged so the triage flow has something to
  // act on. Everything below is settled history, and it is what makes the rest
  // of the portal say anything:
  //
  //   - Plan patterns needs the same trade claimed on two or more homes of the
  //     same plan. Drywall on three Aspens, plumbing on three Birches, and tile
  //     on both Cypresses are the repeats worth surfacing.
  //   - The subcontractor scorecard reads backcharges, not claims. Without a
  //     recorded determination and a backcharge, every column is zero.
  //
  // The mix of recoverable and expired backcharges is the point of the page:
  // the same defect costs the builder nothing or costs it everything depending
  // on whether anyone noticed before the sub's clock ran out.
  // ---------------------------------------------------------------------------

  type Settled = {
    home: typeof lot42;
    owner: NonNullable<typeof ownerA>;
    reference: string;
    title: string;
    description: string;
    room: string;
    trade: "drywall" | "plumbing" | "hvac" | "tile" | "roofing" | "electrical";
    tier: "workmanship" | "systems" | "structural";
    severity: "emergency" | "urgent" | "routine" | "cosmetic";
    monthsAgoFiled: number;
    status: "verified" | "denied" | "scheduled" | "approved" | "referred";
    outcome:
      | "covered"
      | "not_covered_tolerance"
      | "homeowner_maintenance"
      | "not_covered_expired"
      | "goodwill";
    reason: string;
    costCents: number | null;
    /** null when the outcome puts no cost on the builder at all. */
    backcharge: {
      sub: NonNullable<typeof drywall>;
      status: "recoverable" | "expired" | "no_sub_assigned" | "collected";
      amountCents: number;
      rationale: string;
      daysLate: number | null;
    } | null;
  };

  const settled: Settled[] = [
    // -- Aspen · drywall -----------------------------------------------------
    // Three homes on the same plan, same trade. Two recoverable, one not,
    // purely because of when it was caught.
    {
      home: lot8,
      owner: ownerD!,
      reference: "WC-0912",
      title: "Nail pops along the upstairs hallway",
      description:
        "A row of small round bumps has appeared down the hallway wall upstairs. Maybe a dozen of them.",
      room: "Upstairs hallway",
      trade: "drywall",
      tier: "workmanship",
      severity: "cosmetic",
      monthsAgoFiled: 6,
      status: "verified",
      outcome: "covered",
      reason:
        "Nail pops beyond the one-per-wall allowance in the performance standard. Repaired and repainted at the 11-month visit.",
      costCents: 42_000,
      backcharge: {
        sub: drywall!,
        status: "collected",
        amountCents: 42_000,
        rationale:
          "Valley Drywall's warranty was open when the claim was filed. Backcharged and collected against PO-2025-0510.",
        daysLate: null,
      },
    },
    {
      home: lot19,
      owner: ownerE!,
      reference: "WC-0948",
      title: "Seam showing on the living room ceiling",
      description:
        "There's a straight line across the ceiling that catches the light in the afternoon. It wasn't there when we moved in.",
      room: "Living room",
      trade: "drywall",
      tier: "workmanship",
      severity: "cosmetic",
      monthsAgoFiled: 3,
      status: "verified",
      outcome: "covered",
      reason:
        "Visible seam under normal lighting exceeds the finish standard. Re-floated and repainted.",
      costCents: 68_000,
      backcharge: {
        sub: drywall!,
        // The spec-home tail, in one row: the house sold six months after the
        // sub finished, so their clock closed while the homeowner's ran on.
        status: "expired",
        amountCents: 68_000,
        rationale:
          "Valley Drywall's warranty closed 118 days before this claim was filed — Lot 19 sat as inventory for six months after they finished. Not recoverable.",
        daysLate: 118,
      },
    },
    {
      home: lot27,
      owner: ownerF!,
      reference: "WC-1015",
      title: "Hairline crack over the pantry door",
      description: "Small crack above the pantry doorframe, about four inches long.",
      room: "Kitchen",
      trade: "drywall",
      tier: "workmanship",
      severity: "cosmetic",
      monthsAgoFiled: 2,
      status: "denied",
      outcome: "not_covered_tolerance",
      reason:
        "Measured at approximately 1/32 inch. The performance standard treats cracks under 1/16 inch as normal first-year drying shrinkage, not a defect.",
      costCents: null,
      backcharge: null,
    },

    // -- Birch · plumbing ----------------------------------------------------
    {
      home: lot15,
      owner: ownerC!,
      reference: "WC-0977",
      title: "Master shower drains slowly",
      description:
        "Water pools around my feet in the master shower and takes a few minutes to clear after.",
      room: "Master bathroom",
      trade: "plumbing",
      tier: "systems",
      severity: "routine",
      monthsAgoFiled: 3,
      status: "verified",
      outcome: "covered",
      reason:
        "Shower pan slope out of tolerance toward the drain. Pan reset and retested.",
      costCents: 138_000,
      backcharge: {
        sub: plumbing!,
        status: "recoverable",
        amountCents: 138_000,
        rationale:
          "Copper State's two-year warranty runs well past this claim. Backcharge issued against PO-2025-0338.",
        daysLate: null,
      },
    },
    {
      home: lot23,
      owner: ownerG!,
      reference: "WC-0854",
      title: "Water hammer when the washer shuts off",
      description:
        "Loud bang in the wall every time the washing machine finishes filling.",
      room: "Laundry",
      trade: "plumbing",
      tier: "systems",
      severity: "routine",
      monthsAgoFiled: 8,
      status: "verified",
      outcome: "covered",
      reason: "Missing arrestor on the washer supply. Installed and verified.",
      costCents: 31_000,
      backcharge: {
        sub: plumbing!,
        status: "collected",
        amountCents: 31_000,
        rationale: "Within Copper State's window. Backcharged and collected.",
        daysLate: null,
      },
    },
    {
      home: lot31,
      owner: ownerH!,
      reference: "WC-1042",
      title: "Kitchen faucet drips at the base",
      description: "Small puddle around the base of the kitchen faucet each morning.",
      room: "Kitchen",
      trade: "plumbing",
      tier: "systems",
      severity: "routine",
      monthsAgoFiled: 1,
      status: "scheduled",
      outcome: "covered",
      reason: "Failed supply connection at the faucet base. Scheduled for reseal.",
      costCents: 18_000,
      backcharge: {
        sub: plumbing!,
        status: "recoverable",
        amountCents: 18_000,
        rationale:
          "Copper State's warranty is open through the systems tier. Recoverable in full.",
        daysLate: null,
      },
    },

    // -- Cypress · tile ------------------------------------------------------
    // Both homes on the plan, same trade, same failure. This is the pattern
    // that should prompt a look at the installation detail, not two repairs.
    {
      home: lot44,
      owner: ownerI!,
      reference: "WC-0993",
      title: "Grout cracking along the shower corner",
      description:
        "The grout in the corner of the guest shower has cracked and a piece came out.",
      room: "Guest bathroom",
      trade: "tile",
      tier: "workmanship",
      severity: "routine",
      monthsAgoFiled: 4,
      status: "verified",
      outcome: "covered",
      reason:
        "Grout used in a change-of-plane joint where flexible sealant is required. Raked out and resealed correctly.",
      costCents: 54_000,
      backcharge: {
        sub: tile!,
        status: "recoverable",
        amountCents: 54_000,
        rationale: "Sabine Tile's warranty is open. Backcharge issued.",
        daysLate: null,
      },
    },
    {
      home: lot51,
      owner: ownerJ!,
      reference: "WC-1028",
      title: "Same grout cracking in the master shower",
      description:
        "Grout is cracked where the shower wall meets the floor, all along one side.",
      room: "Master bathroom",
      trade: "tile",
      tier: "workmanship",
      severity: "routine",
      monthsAgoFiled: 2,
      status: "approved",
      outcome: "covered",
      reason:
        "Identical detail to Lot 44 — rigid grout at a change of plane. Same correction.",
      costCents: 61_000,
      backcharge: {
        sub: tile!,
        status: "recoverable",
        amountCents: 61_000,
        rationale:
          "Sabine Tile's warranty is open. Second occurrence on the Cypress plan — raise the installation detail before the next start.",
        daysLate: null,
      },
    },

    // -- Aspen · hvac --------------------------------------------------------
    {
      home: lot19,
      owner: ownerE!,
      reference: "WC-0951",
      title: "Upstairs won't hold temperature",
      description: "Upstairs runs six or seven degrees warm on hot days.",
      room: "Upstairs",
      trade: "hvac",
      tier: "systems",
      severity: "urgent",
      monthsAgoFiled: 3,
      status: "verified",
      outcome: "covered",
      reason:
        "Return undersized for the upstairs zone against the design. Return enlarged and balanced.",
      costCents: 219_000,
      backcharge: {
        sub: hvac!,
        status: "expired",
        amountCents: 219_000,
        rationale:
          "Lone Star Mechanical's warranty closed before this claim, and their certificate of insurance has since lapsed. Unrecoverable on both counts.",
        daysLate: 64,
      },
    },
    {
      home: lot27,
      owner: ownerF!,
      reference: "WC-1009",
      title: "Condensate line backing up",
      description: "Water dripping from the ceiling below the air handler closet.",
      room: "Hallway ceiling",
      trade: "hvac",
      tier: "systems",
      severity: "emergency",
      monthsAgoFiled: 2,
      status: "verified",
      outcome: "covered",
      reason:
        "Condensate line laid without fall and unglued at one joint. Re-run, glued, and the ceiling patched.",
      costCents: 96_000,
      backcharge: {
        sub: hvac!,
        status: "recoverable",
        amountCents: 96_000,
        rationale: "Within Lone Star's two-year window. Backcharge issued.",
        daysLate: null,
      },
    },

    // -- the bus-factor failure, priced ---------------------------------------
    {
      home: lot15,
      owner: ownerC!,
      reference: "WC-0961",
      title: "Floor squeak across the upstairs landing",
      description:
        "The landing squeaks badly in three or four spots, worse in the mornings.",
      room: "Upstairs landing",
      trade: "drywall",
      tier: "workmanship",
      severity: "routine",
      monthsAgoFiled: 4,
      status: "verified",
      outcome: "covered",
      reason:
        "Subfloor fastening short of spec at the landing. Screwed off from below and re-secured.",
      costCents: 87_000,
      backcharge: {
        sub: framing!,
        // The whole argument for recording completion dates, in one row.
        status: "no_sub_assigned",
        amountCents: 87_000,
        rationale:
          "Hill Country Framing is the sub of record for Lot 15, but no completion date was ever entered, so their warranty window can't be established. Nothing to charge back against.",
        daysLate: null,
      },
    },

    // -- excluded, so the coordinator's judgment is visible too ---------------
    {
      home: lot23,
      owner: ownerG!,
      reference: "WC-0866",
      title: "Mildew along the tub caulk",
      description: "Black spots in the caulk line around the guest tub.",
      room: "Guest bathroom",
      trade: "tile",
      tier: "workmanship",
      severity: "cosmetic",
      monthsAgoFiled: 7,
      status: "referred",
      outcome: "homeowner_maintenance",
      reason:
        "§3.0(b) puts re-caulking of tubs and showers on the homeowner. Sent the maintenance guidance rather than a service visit.",
      costCents: null,
      backcharge: null,
    },
    {
      home: lot23,
      owner: ownerG!,
      reference: "WC-0871",
      title: "Roof shingle lifted after the storm",
      description: "Two shingles on the back slope are curled up after last week's wind.",
      room: "Roof",
      trade: "roofing",
      tier: "workmanship",
      severity: "urgent",
      monthsAgoFiled: 6,
      status: "verified",
      outcome: "goodwill",
      reason:
        "Storm damage is excluded under §3.0(e) and belongs to the homeowner's policy. Two shingles — replaced at our cost rather than send them to a deductible.",
      costCents: 24_000,
      backcharge: null,
    },
  ];

  for (const spec of settled) {
    const [claim] = await db
      .insert(claims)
      .values({
        builderId: builder.id,
        homeId: spec.home.id,
        reportedByUserId: spec.owner.id,
        reference: spec.reference,
        title: spec.title,
        description: spec.description,
        room: spec.room,
        trade: spec.trade,
        tier: spec.tier,
        reportedSeverity: spec.severity,
        assessedSeverity: spec.severity,
        reportedOn: monthsAgo(spec.monthsAgoFiled),
        status: spec.status,
      })
      .returning();

    if (!claim) continue;

    await db.insert(claimEvents).values([
      {
        claimId: claim.id,
        actorUserId: spec.owner.id,
        kind: "submitted",
        toStatus: "submitted",
        note: "Filed from the mobile app.",
      },
      {
        claimId: claim.id,
        actorUserId: coordinator!.id,
        kind: "determined",
        fromStatus: "under_review",
        toStatus: spec.status,
        note: spec.reason,
      },
    ]);

    await db.insert(determinations).values({
      claimId: claim.id,
      decidedByUserId: coordinator!.id,
      outcome: spec.outcome,
      tier: spec.tier,
      trade: spec.trade,
      reason: spec.reason,
      // No AI proposal behind these — they predate triage being switched on,
      // which is also why agreedWithAi is null rather than false.
      aiAssessmentId: null,
      agreedWithAi: null,
      responsibleSubcontractorId: spec.backcharge?.sub.id ?? null,
      estimatedCostCents: spec.costCents,
    });

    if (spec.backcharge) {
      await db.insert(backcharges).values({
        claimId: claim.id,
        subcontractorId: spec.backcharge.sub.id,
        subAssignmentId: null,
        status: spec.backcharge.status,
        amountCents: spec.backcharge.amountCents,
        rationale: spec.backcharge.rationale,
        daysLate: spec.backcharge.daysLate,
        issuedAt:
          spec.backcharge.status === "collected" ||
          spec.backcharge.status === "recoverable"
            ? new Date()
            : null,
        collectedAt: spec.backcharge.status === "collected" ? new Date() : null,
      });
    }
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
