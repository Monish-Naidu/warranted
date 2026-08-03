/**
 * AI claim triage.
 *
 * The model classifies, cites, routes, and drafts. It does NOT decide.
 *
 * An automated coverage denial delivered to a consumer with no human in the
 * loop is a liability in a deposition and a consumer-protection risk in several
 * states. Every output of this module is a *proposal* written to
 * `ai_assessments`; a coordinator's approval is what creates a `determination`.
 * That split is also what produces labeled data — every agreement and override
 * is recorded against the assessment that prompted it.
 */

import Anthropic from "@anthropic-ai/sdk";
import { zodToJsonSchema } from "zod-to-json-schema";
import {
  aiAssessmentSchema,
  type AiAssessment,
  type Severity,
  type Trade,
} from "@warranted/shared";
import {
  checkCoverage,
  tolerancesAsPromptContext,
  type IsoDate,
  type Tolerance,
} from "@warranted/warranty";
import { readFile } from "node:fs/promises";
import { env } from "../env.js";

/** Bump when the prompt changes so assessments stay comparable over time. */
export const PROMPT_VERSION = "2026-08-02.1";

const MODEL = "claude-opus-5";

const client = env.ANTHROPIC_API_KEY
  ? new Anthropic({ apiKey: env.ANTHROPIC_API_KEY })
  : null;

/**
 * The API constrains generation to this schema. We still parse the result back
 * through the zod schema afterwards — the constraint guarantees shape, and the
 * parse applies our defaults and narrows the enums to the domain types.
 */
const ASSESSMENT_JSON_SCHEMA = zodToJsonSchema(aiAssessmentSchema, {
  target: "jsonSchema7",
  $refStrategy: "none",
});

export interface TriageContext {
  claim: {
    id: string;
    title: string;
    description: string;
    room: string | null;
    reportedSeverity: Severity;
    reportedOn: IsoDate;
  };
  home: {
    lotNumber: string;
    communityName: string;
    planName: string | null;
    state: string;
    warrantyStartDate: IsoDate;
  };
  /** Extracted text of the builder's warranty agreement for this home. */
  warrantyDocumentText: string | null;
  /**
   * The same document, broken into clauses a coordinator has reviewed and
   * tagged. Passed alongside the raw text rather than instead of it: the
   * headings give a citation something exact to point at, and `citations[].
   * reference` is what a coordinator reads back to a homeowner. An uncited
   * proposal is forced to needsHumanReview, so this materially changes how
   * often triage produces something usable.
   */
  coverageTerms: Array<{
    heading: string;
    body: string;
    tier: string | null;
    trade: string | null;
    isCoverage: boolean;
  }>;
  /**
   * The builder's own performance standard, when they have supplied one.
   * Undefined falls back to the built-in placeholder set, which is a
   * development convenience and not something to rely on commercially — see
   * the licensing note in `packages/warranty/src/tolerances.ts`.
   */
  tolerances?: readonly Tolerance[];
  zeroToleranceIds?: readonly string[];
  /** Prior claims on this same home, for duplicate detection. */
  priorClaims: Array<{
    id: string;
    reference: string;
    title: string;
    trade: Trade | null;
    reportedOn: IsoDate;
    status: string;
  }>;
  /** Local file paths of the homeowner's photos. */
  photoPaths: Array<{ path: string; contentType: string }>;
}

export interface TriageResult {
  assessment: AiAssessment;
  model: string;
  promptVersion: string;
  latencyMs: number;
  inputTokens: number | null;
  outputTokens: number | null;
}

const SYSTEM_PROMPT = `You are a warranty triage assistant for a residential homebuilder. You review defect reports submitted by homeowners on newly built homes and prepare a recommendation for a human warranty coordinator.

You do not decide claims. A coordinator reviews everything you produce and makes the actual determination. Write for that reader: precise, factual, and easy to act on or overrule.

## How to reason about a claim

Three separate questions have to pass before a claim is covered. Keep them distinct — conflating them is the most common error in this domain.

1. Is the observed condition a defect at all, or is it within normal construction tolerance? Cracking, settling, shrinkage, and seasonal movement are expected in the first year.
2. Which warranty tier does the trade fall under, and is that tier still in force on the claim date? You are given the computed answer; do not recalculate it.
3. Do the builder's own warranty terms cover or exclude this specific condition?

## Rules

- Describe only what is actually visible in the photos. If the photos are unclear, blurry, or don't show the described condition, say so and set needsHumanReview.
- Estimate measurements only when there is a scale reference in the photo. If there isn't, leave estimatedMeasurement null rather than guessing — a fabricated measurement produces a defensible-looking but wrong determination.
- Cite the clause or tolerance you relied on. An uncited proposal is treated as low confidence regardless of the number you report.
- Flag emergencies aggressively. Active water intrusion, sewage, no heat or cooling in extreme weather, no electricity, and gas odor are emergencies regardless of coverage status — consequential damage compounds fast and the response obligation is separate from the coverage question.
- Route appliances and equipment carrying their own manufacturer warranty to manufacturer_warranty, even when the builder installed them.
- Watch for homeowner maintenance: HVAC filters, caulk and grout in wet areas, grading altered after closing, and landscape watering are the usual ones.
- Check the prior claims list for duplicates. Same room plus same trade plus a similar description on the same home usually means a repeat visit for unresolved work, not a new claim — that distinction changes who pays and whether the original sub is back on the hook.
- Storm, impact, and accidental damage are insurance matters, not warranty.
- Set needsHumanReview whenever you are genuinely uncertain. A low-confidence flag costs a coordinator thirty seconds; a confident wrong answer costs a lawsuit.`;

function buildUserPrompt(ctx: TriageContext): string {
  const coverageByTrade = ([
    "drywall",
    "plumbing",
    "electrical",
    "hvac",
    "roofing",
    "concrete",
    "framing",
  ] as const)
    .map((trade) => {
      const verdict = checkCoverage({
        trade,
        warrantyStartDate: ctx.home.warrantyStartDate,
        claimDate: ctx.claim.reportedOn,
      });
      return `- ${trade} (${verdict.tier} tier): ${verdict.covered ? "IN FORCE" : "EXPIRED"} — ${verdict.reason}`;
    })
    .join("\n");

  /*
   * Exclusions are listed as plainly as grants. They are the clauses a
   * coordinator quotes most, and a model that only sees what is covered will
   * quietly under-weight what is not.
   */
  const clauseContext =
    ctx.coverageTerms.length > 0
      ? ctx.coverageTerms
          .map((term) => {
            const tags = [
              term.isCoverage ? "GRANTS COVERAGE" : "EXCLUDES",
              term.tier ? `tier: ${term.tier}` : null,
              term.trade ? `trade: ${term.trade}` : null,
            ]
              .filter(Boolean)
              .join(", ");
            return `- ${term.heading} (${tags})\n  ${term.body}`;
          })
          .join("\n")
      : "No clauses have been tagged for this builder yet. Read the full text below, and set needsHumanReview since a citation cannot be checked against a reviewed clause.";

  const priorClaims =
    ctx.priorClaims.length > 0
      ? ctx.priorClaims
          .map(
            (c) =>
              `- [${c.id}] ${c.reference} (${c.reportedOn}, ${c.status}): ${c.title}${c.trade ? ` — trade: ${c.trade}` : ""}`,
          )
          .join("\n")
      : "None on record for this home.";

  return `## The claim

Title: ${ctx.claim.title}
Room: ${ctx.claim.room ?? "not specified"}
Reported on: ${ctx.claim.reportedOn}
Homeowner's own urgency assessment: ${ctx.claim.reportedSeverity}

Description as written by the homeowner:
"""
${ctx.claim.description}
"""

## The home

Lot ${ctx.home.lotNumber}, ${ctx.home.communityName} (${ctx.home.state})
Floor plan: ${ctx.home.planName ?? "not recorded"}
Warranty start date: ${ctx.home.warrantyStartDate}

## Coverage windows, already computed — use these, do not recalculate

${coverageByTrade}

## Performance tolerances

These decide whether a condition is a defect or is within acceptable tolerance. Cite by id.

${tolerancesAsPromptContext(ctx.tolerances, ctx.zeroToleranceIds)}

## The builder's warranty agreement, by clause

Cite these by their exact heading. These have been reviewed by the builder, so prefer them over your own reading of the raw text below.

${clauseContext}

## The builder's warranty agreement, full text

${ctx.warrantyDocumentText ?? "No warranty document text is on file for this home. Rely on the tolerance table and standard 1-2-10 structure, note the absence in your summary, and set needsHumanReview."}

## Prior claims on this home

${priorClaims}

## Your task

Assess the photos and the description together. Produce your structured recommendation for the coordinator.`;
}

async function buildPhotoBlocks(
  photos: TriageContext["photoPaths"],
): Promise<Anthropic.ImageBlockParam[]> {
  // Cap at 8. Beyond that the marginal photo rarely changes the determination
  // and the token cost is real — a coordinator can request more if needed.
  const capped = photos.slice(0, 8);
  return Promise.all(
    capped.map(async (photo) => {
      const data = await readFile(photo.path);
      return {
        type: "image" as const,
        source: {
          type: "base64" as const,
          media_type: photo.contentType as "image/jpeg" | "image/png",
          data: data.toString("base64"),
        },
      };
    }),
  );
}

export class TriageUnavailableError extends Error {
  constructor() {
    super(
      "Claim triage is unavailable: ANTHROPIC_API_KEY is not set. Claims are still accepted and queued for manual review.",
    );
    this.name = "TriageUnavailableError";
  }
}

/**
 * Run triage on a single claim.
 *
 * Throws `TriageUnavailableError` when no API key is configured — callers
 * should treat that as "claim accepted, awaiting manual review" rather than as
 * a submission failure. A homeowner should never be blocked from filing
 * because an internal service is down.
 */
export async function triageClaim(ctx: TriageContext): Promise<TriageResult> {
  if (!client) throw new TriageUnavailableError();

  const photoBlocks = await buildPhotoBlocks(ctx.photoPaths);
  const startedAt = Date.now();

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 16000,
    system: SYSTEM_PROMPT,
    output_config: {
      format: { type: "json_schema", schema: ASSESSMENT_JSON_SCHEMA },
    },
    messages: [
      {
        role: "user",
        content: [
          ...photoBlocks,
          { type: "text", text: buildUserPrompt(ctx) },
        ],
      },
    ],
  });

  const latencyMs = Date.now() - startedAt;

  if (response.stop_reason === "refusal") {
    throw new Error(
      `Triage declined by safety classifier (${response.stop_details?.category ?? "unspecified"}). Routing to manual review.`,
    );
  }
  if (response.stop_reason === "max_tokens") {
    throw new Error("Triage response was truncated. Routing to manual review.");
  }

  const text = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("");

  const parsed = aiAssessmentSchema.safeParse(JSON.parse(text));
  if (!parsed.success) {
    throw new Error(
      `Triage returned a malformed assessment: ${parsed.error.message}`,
    );
  }
  const assessment = parsed.data;

  return {
    // An uncited proposal is not trustworthy no matter what confidence the
    // model reports, so the flag is forced here rather than left to the prompt.
    assessment: {
      ...assessment,
      needsHumanReview: assessment.needsHumanReview || assessment.citations.length === 0,
    },
    model: MODEL,
    promptVersion: PROMPT_VERSION,
    latencyMs,
    inputTokens: response.usage.input_tokens ?? null,
    outputTokens: response.usage.output_tokens ?? null,
  };
}
