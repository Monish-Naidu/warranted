/**
 * Reading a builder's own documents into structured rules.
 *
 * Two extractions live here because they are the same job with different
 * targets: the warranty agreement becomes tagged clauses, and the performance
 * standard becomes measurable thresholds. Together they are the two documents
 * every triage proposal is grounded in.
 *
 * Same rule as triage: the model proposes, a human decides. Nothing this
 * returns is written to `coverage_terms` until a coordinator has looked at it
 * and saved it. The difference is what a mistake costs. A bad triage proposal
 * misjudges one claim; a bad clause tag is quietly wrong on every claim that
 * cites it for the next five years, which is a reason for more human review
 * here, not less.
 *
 * Why tag at all, when triage already reads the raw text: a citation needs
 * something to point at. `aiAssessmentSchema` requires a `reference` string,
 * and an uncited proposal is forced to `needsHumanReview` regardless of the
 * confidence the model reports. Feeding triage a list of clauses with real
 * headings turns "the warranty says something about maintenance" into
 * "§3.0(b)".
 */

import {
  suggestedTermsSchema,
  suggestedTolerancesSchema,
  type SuggestedTerms,
  type SuggestedTolerances,
} from "@warranted/shared";
import { zodToJsonSchema } from "zod-to-json-schema";
import { activeProvider, generateStructured } from "./provider.js";

/** Bump when the prompt changes so proposals stay comparable over time. */
export const CLAUSE_PROMPT_VERSION = "2026-08-03.1";

const TERMS_JSON_SCHEMA = zodToJsonSchema(suggestedTermsSchema, {
  target: "jsonSchema7",
  $refStrategy: "none",
});

export class ClauseExtractionUnavailableError extends Error {
  constructor(subject = "Clause extraction", byHand = "clauses") {
    super(
      `${subject} needs a model provider. Set GEMINI_API_KEY or ANTHROPIC_API_KEY. Add ${byHand} by hand until one is set.`,
    );
    this.name = "ClauseExtractionUnavailableError";
  }
}

const SYSTEM_PROMPT = `You break a homebuilder's limited warranty into individual clauses so a warranty coordinator can cite them.

You are reading the builder's own warranty agreement. Split it into the clauses that a coverage decision would actually rest on, and tag each one.

Rules:

- Use the document's own numbering in the heading, exactly as printed. "§3.0(b) Homeowner maintenance" is a usable citation; "Exclusions part two" is not.
- Set isCoverage false for any clause that denies, excludes, limits, or shifts responsibility elsewhere. Set it true for clauses that grant coverage. Exclusions are the clauses coordinators quote most, so do not skip or merge them.
- Set tier only when the clause is clearly about one of workmanship, systems, or structural. A general exclusion applies across tiers: leave tier null.
- Set trade only when the clause names one trade specifically. Most clauses do not.
- Keep the body faithful. Condense wording, never meaning, and never invent a limit, a duration, or a threshold the document does not state.
- Include procedural clauses covering notice, right to repair, transfer on resale, and emergency response. They are not coverage grants, but they decide outcomes.
- If a passage is boilerplate with no bearing on whether a defect is covered, leave it out.

Return only clauses that are actually in the text you are given.`;

export interface ClauseExtractionResult {
  terms: SuggestedTerms["terms"];
  model: string;
  promptVersion: string;
  latencyMs: number;
}

export async function suggestClauses(
  documentText: string,
  documentTitle: string,
): Promise<ClauseExtractionResult> {
  if (!activeProvider()) throw new ClauseExtractionUnavailableError();

  const startedAt = Date.now();

  const response = await generateStructured({
    system: SYSTEM_PROMPT,
    userText: `Document title: ${documentTitle}

--- BEGIN WARRANTY DOCUMENT ---
${documentText}
--- END WARRANTY DOCUMENT ---

Break this into tagged clauses.`,
    schema: TERMS_JSON_SCHEMA,
    maxTokens: 16000,
  });

  const latencyMs = Date.now() - startedAt;

  const parsed = suggestedTermsSchema.safeParse(JSON.parse(response.text));
  if (!parsed.success) {
    throw new Error(`Clause extraction returned malformed terms: ${parsed.error.message}`);
  }

  return {
    terms: parsed.data.terms,
    model: response.model,
    promptVersion: CLAUSE_PROMPT_VERSION,
    latencyMs,
  };
}

export const clauseExtractionEnabled = activeProvider() !== null;


// ---------------------------------------------------------------------------
// performance standards
// ---------------------------------------------------------------------------

const TOLERANCES_JSON_SCHEMA = zodToJsonSchema(suggestedTolerancesSchema, {
  target: "jsonSchema7",
  $refStrategy: "none",
});

const TOLERANCE_SYSTEM_PROMPT = `You read a homebuilder's performance standard and turn it into measurable thresholds a warranty coordinator can apply.

Each threshold answers one question: at what point does an observed condition stop being acceptable and become a defect?

Rules:

- code: a short stable slug, lowercase, dotted, trade first. "drywall.crack", "concrete.slab_crack", "tile.grout_cracking". This is what a citation points at and it must not read like prose.
- condition: phrase it the way a homeowner would describe the problem, not the way a spec writes it. "Cracks in drywall walls or ceilings", not "Gypsum board surface discontinuity".
- threshold: the exact point of failure as the document states it, including the units and the span it is measured over.
- measurementUnit and measurementMax: fill these only when the standard gives a number that can be compared mechanically. Convert fractions to decimals, so 1/8 inch becomes 0.125. Leave both null when the standard calls for judgment rather than a measurement, and do not invent a number to fill the field.
- measurementOver: the span, when one is given. "32 inches", "any 10 foot run".
- isZeroTolerance: true only where the standard admits no acceptable amount at any size. Structural failure, active water intrusion, gas leaks, life-safety. Everything else is false.
- typicalWindowMonths: which warranty year the condition is normally observed and corrected in. Default 12 when the standard does not say.

Never invent a threshold the document does not state. If a section describes a condition without giving a limit, still return it with the threshold quoted as written and the measurement fields null. A coordinator can decide what to do with it; a number you made up is worse than a gap.`;

export interface ToleranceExtractionResult {
  tolerances: SuggestedTolerances["tolerances"];
  model: string;
  promptVersion: string;
  latencyMs: number;
}

export async function suggestTolerances(
  documentText: string,
  documentTitle: string,
): Promise<ToleranceExtractionResult> {
  if (!activeProvider()) {
    throw new ClauseExtractionUnavailableError(
      "Reading a performance standard",
      "thresholds",
    );
  }

  const startedAt = Date.now();

  const response = await generateStructured({
    system: TOLERANCE_SYSTEM_PROMPT,
    userText: `Document title: ${documentTitle}

--- BEGIN PERFORMANCE STANDARD ---
${documentText}
--- END PERFORMANCE STANDARD ---

Turn this into measurable thresholds.`,
    schema: TOLERANCES_JSON_SCHEMA,
    maxTokens: 16000,
  });

  const latencyMs = Date.now() - startedAt;

  const parsed = suggestedTolerancesSchema.safeParse(JSON.parse(response.text));
  if (!parsed.success) {
    throw new Error(`Extraction returned malformed thresholds: ${parsed.error.message}`);
  }

  return {
    tolerances: parsed.data.tolerances,
    model: response.model,
    promptVersion: CLAUSE_PROMPT_VERSION,
    latencyMs,
  };
}
