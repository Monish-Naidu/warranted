/**
 * Breaking a warranty document into tagged clauses.
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

import Anthropic from "@anthropic-ai/sdk";
import { suggestedTermsSchema, type SuggestedTerms } from "@warranted/shared";
import { zodToJsonSchema } from "zod-to-json-schema";
import { env } from "../env.js";

/** Bump when the prompt changes so proposals stay comparable over time. */
export const CLAUSE_PROMPT_VERSION = "2026-08-03.1";

const MODEL = "claude-opus-5";

const client = env.ANTHROPIC_API_KEY
  ? new Anthropic({ apiKey: env.ANTHROPIC_API_KEY })
  : null;

const TERMS_JSON_SCHEMA = zodToJsonSchema(suggestedTermsSchema, {
  target: "jsonSchema7",
  $refStrategy: "none",
});

export class ClauseExtractionUnavailableError extends Error {
  constructor() {
    super(
      "Clause extraction needs ANTHROPIC_API_KEY. Add clauses by hand until it is set.",
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
  if (!client) throw new ClauseExtractionUnavailableError();

  const startedAt = Date.now();

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 16000,
    system: SYSTEM_PROMPT,
    output_config: {
      format: { type: "json_schema", schema: TERMS_JSON_SCHEMA },
    },
    messages: [
      {
        role: "user",
        content: `Document title: ${documentTitle}

--- BEGIN WARRANTY DOCUMENT ---
${documentText}
--- END WARRANTY DOCUMENT ---

Break this into tagged clauses.`,
      },
    ],
  });

  const latencyMs = Date.now() - startedAt;

  if (response.stop_reason === "refusal") {
    throw new Error(
      `Clause extraction declined by safety classifier (${response.stop_details?.category ?? "unspecified"}).`,
    );
  }
  if (response.stop_reason === "max_tokens") {
    throw new Error(
      "The response was truncated before the document finished. Try a shorter document, or add the remaining clauses by hand.",
    );
  }

  const text = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("");

  const parsed = suggestedTermsSchema.safeParse(JSON.parse(text));
  if (!parsed.success) {
    throw new Error(`Clause extraction returned malformed terms: ${parsed.error.message}`);
  }

  return {
    terms: parsed.data.terms,
    model: MODEL,
    promptVersion: CLAUSE_PROMPT_VERSION,
    latencyMs,
  };
}

export const clauseExtractionEnabled = Boolean(client);
