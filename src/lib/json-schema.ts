import { z } from "zod";

// Structured outputs constrain decoding to a JSON schema but don't support
// numeric ranges, string lengths or patterns, so those are dropped here and
// enforced by the Zod schema's own parse afterwards. Built by hand rather
// than with the SDK's zodOutputFormat, which turns enums into descriptions
// and so loses the constraints that matter most (categories, spot kinds).
const UNSUPPORTED_KEYWORDS = new Set(["$schema", "minimum", "maximum", "minLength", "maxLength", "pattern", "maxItems"]);

function stripUnsupported(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(stripUnsupported);
  if (node && typeof node === "object") {
    return Object.fromEntries(
      Object.entries(node)
        .filter(([key]) => !UNSUPPORTED_KEYWORDS.has(key))
        .map(([key, value]) => [key, stripUnsupported(value)]),
    );
  }
  return node;
}

/** A JSON schema for structured outputs (`output_config.format`) from a Zod schema. */
export function jsonSchemaFor(schema: z.ZodType): Record<string, unknown> {
  return stripUnsupported(z.toJSONSchema(schema)) as Record<string, unknown>;
}
