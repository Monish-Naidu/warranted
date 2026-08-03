/**
 * One way to ask a model for structured JSON, whichever model that is.
 *
 * The prompts and the response schemas are the valuable part of this codebase
 * and none of them change when the provider does. What changes is a narrow
 * mechanical layer: how images are attached, how a schema is enforced, and how
 * the JSON comes back out. That is all this file is.
 *
 * Gemini is preferred when configured, because its free tier makes running
 * this thing cost nothing during development. Anthropic is used when it is the
 * only one set. Both are optional: with neither key present the callers throw
 * their own "unavailable" errors and the product degrades to manual entry,
 * which every consumer already handles.
 *
 * Schemas are authored once as JSON Schema (via zod-to-json-schema) and
 * adapted here for Gemini, which accepts a smaller OpenAPI-flavoured subset.
 * The adaptation is lossy in one direction only — it drops constraints Gemini
 * cannot express — so a response is always re-parsed through the original zod
 * schema by the caller. That parse is what actually guarantees the shape; the
 * provider's enforcement is a strong hint, not the contract.
 */

import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenAI } from "@google/genai";
import { env } from "../env.js";

export type Provider = "gemini" | "anthropic";

const GEMINI_MODEL = "gemini-2.5-flash";
const ANTHROPIC_MODEL = "claude-opus-5";

const gemini = env.GEMINI_API_KEY
  ? new GoogleGenAI({ apiKey: env.GEMINI_API_KEY })
  : null;

const anthropic = env.ANTHROPIC_API_KEY
  ? new Anthropic({ apiKey: env.ANTHROPIC_API_KEY })
  : null;

/** Which provider a call will use, or null when nothing is configured. */
export function activeProvider(): Provider | null {
  if (gemini) return "gemini";
  if (anthropic) return "anthropic";
  return null;
}

export function activeModel(): string | null {
  const provider = activeProvider();
  if (provider === "gemini") return GEMINI_MODEL;
  if (provider === "anthropic") return ANTHROPIC_MODEL;
  return null;
}

export interface InlineImage {
  /** "image/jpeg" or "image/png". */
  mediaType: string;
  base64: string;
}

export interface StructuredRequest {
  system: string;
  userText: string;
  images?: InlineImage[];
  /** JSON Schema 7, as produced by zod-to-json-schema with $refStrategy none. */
  schema: Record<string, unknown>;
  maxTokens: number;
}

export interface StructuredResponse {
  /** Raw JSON text. The caller parses it through its own zod schema. */
  text: string;
  model: string;
  provider: Provider;
}

export class ModelRefusalError extends Error {
  constructor(reason: string) {
    super(`The model declined to answer (${reason}). Routing to manual review.`);
    this.name = "ModelRefusalError";
  }
}

export class ModelTruncatedError extends Error {
  constructor() {
    super(
      "The response was cut off before it finished. Try a shorter input, or complete it by hand.",
    );
    this.name = "ModelTruncatedError";
  }
}

export async function generateStructured(
  request: StructuredRequest,
): Promise<StructuredResponse> {
  if (gemini) return viaGemini(request);
  if (anthropic) return viaAnthropic(request);
  throw new Error(
    "No model provider is configured. Set GEMINI_API_KEY or ANTHROPIC_API_KEY.",
  );
}

// ---------------------------------------------------------------------------
// gemini
// ---------------------------------------------------------------------------

async function viaGemini(
  request: StructuredRequest,
): Promise<StructuredResponse> {
  const parts: Array<Record<string, unknown>> = [];

  for (const image of request.images ?? []) {
    parts.push({ inlineData: { mimeType: image.mediaType, data: image.base64 } });
  }
  parts.push({ text: request.userText });

  const response = await gemini!.models.generateContent({
    model: GEMINI_MODEL,
    contents: [{ role: "user", parts }],
    config: {
      systemInstruction: request.system,
      maxOutputTokens: request.maxTokens,
      responseMimeType: "application/json",
      responseSchema: toGeminiSchema(request.schema),
      // Deterministic-ish: these are extraction and classification tasks, not
      // writing tasks, and run-to-run drift makes proposals harder to compare.
      temperature: 0.2,
    },
  });

  const candidate = response.candidates?.[0];
  const finish = candidate?.finishReason;

  if (finish === "SAFETY" || finish === "PROHIBITED_CONTENT" || finish === "BLOCKLIST") {
    throw new ModelRefusalError(String(finish));
  }
  if (finish === "MAX_TOKENS") {
    throw new ModelTruncatedError();
  }

  const text = response.text;
  if (!text || !text.trim()) {
    throw new Error(
      `The model returned nothing usable (finish reason: ${finish ?? "unknown"}).`,
    );
  }

  return { text, model: GEMINI_MODEL, provider: "gemini" };
}

/**
 * Translate JSON Schema 7 into the subset Gemini's `responseSchema` accepts.
 *
 * Gemini takes an OpenAPI 3.0-flavoured schema and rejects or ignores several
 * JSON Schema keywords. Anything it cannot express is dropped rather than
 * approximated, because a constraint it silently misreads is worse than one it
 * never sees — the caller re-parses through zod either way, so nothing is
 * actually lost.
 *
 * Dropped: `additionalProperties`, `$schema`, `default`, `const`, `oneOf`,
 * `allOf`, string/number bounds. Kept: type, properties, required, items,
 * enum, nullable (rewritten from a type union), and description.
 */
function toGeminiSchema(schema: Record<string, unknown>): Record<string, unknown> {
  const convert = (node: unknown): Record<string, unknown> | undefined => {
    if (!node || typeof node !== "object") return undefined;
    const s = node as Record<string, unknown>;

    // zod emits nullable as `type: ["string", "null"]` or an anyOf including
    // a null branch. Gemini expresses it as a `nullable` flag instead.
    let type = s.type;
    let nullable = false;

    if (Array.isArray(type)) {
      const types = type.filter((t) => t !== "null");
      nullable = type.length !== types.length;
      type = types[0];
    }

    if (Array.isArray(s.anyOf)) {
      const branches = (s.anyOf as unknown[]).filter(
        (b) => !(b && typeof b === "object" && (b as Record<string, unknown>).type === "null"),
      );
      nullable = branches.length !== (s.anyOf as unknown[]).length;
      // Gemini has no union type. Take the first non-null branch, which for
      // everything this codebase generates is the only real one.
      if (branches.length > 0) {
        const inner = convert(branches[0]);
        if (inner) return nullable ? { ...inner, nullable: true } : inner;
      }
    }

    const out: Record<string, unknown> = {};
    if (typeof type === "string") out.type = type.toUpperCase();
    if (nullable) out.nullable = true;
    if (typeof s.description === "string") out.description = s.description;
    if (Array.isArray(s.enum)) out.enum = s.enum.map(String);

    if (s.properties && typeof s.properties === "object") {
      const properties: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(s.properties)) {
        const converted = convert(value);
        if (converted) properties[key] = converted;
      }
      out.properties = properties;

      // Gemini honours ordering, which keeps generated objects stable.
      out.propertyOrdering = Object.keys(properties);

      if (Array.isArray(s.required)) {
        out.required = (s.required as string[]).filter((k) => k in properties);
      }
    }

    if (s.items) {
      const items = convert(s.items);
      if (items) out.items = items;
    }

    return out;
  };

  return convert(schema) ?? { type: "OBJECT" };
}

// ---------------------------------------------------------------------------
// anthropic
// ---------------------------------------------------------------------------

async function viaAnthropic(
  request: StructuredRequest,
): Promise<StructuredResponse> {
  const content: Anthropic.ContentBlockParam[] = [];

  for (const image of request.images ?? []) {
    content.push({
      type: "image",
      source: {
        type: "base64",
        media_type: image.mediaType as "image/jpeg" | "image/png",
        data: image.base64,
      },
    });
  }
  content.push({ type: "text", text: request.userText });

  const response = await anthropic!.messages.create({
    model: ANTHROPIC_MODEL,
    max_tokens: request.maxTokens,
    system: request.system,
    output_config: { format: { type: "json_schema", schema: request.schema } },
    messages: [{ role: "user", content }],
  });

  if (response.stop_reason === "refusal") {
    throw new ModelRefusalError(
      response.stop_details?.category ?? "unspecified",
    );
  }
  if (response.stop_reason === "max_tokens") {
    throw new ModelTruncatedError();
  }

  const text = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("");

  return { text, model: ANTHROPIC_MODEL, provider: "anthropic" };
}
