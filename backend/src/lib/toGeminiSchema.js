/**
 * Gemini's structured-output responseSchema uses OpenAPI-style types and a
 * `nullable: true` flag instead of JSON Schema's `type: ["string", "null"]`
 * union style that we use for the Anthropic tool schema. This converts one
 * to the other so both providers are generated from the SAME source of
 * truth (schema.js) and can never drift apart.
 */
export function toGeminiSchema(jsonSchema) {
  if (Array.isArray(jsonSchema.type)) {
    const nonNullTypes = jsonSchema.type.filter((t) => t !== "null");
    const nullable = jsonSchema.type.includes("null");
    return {
      ...stripUnsupportedKeys(jsonSchema),
      type: nonNullTypes[0]?.toUpperCase() ?? "STRING",
      nullable,
    };
  }

  if (jsonSchema.type === "object" && jsonSchema.properties) {
    const properties = {};
    for (const [key, value] of Object.entries(jsonSchema.properties)) {
      properties[key] = toGeminiSchema(value);
    }
    return {
      type: "OBJECT",
      properties,
      required: jsonSchema.required,
    };
  }

  if (jsonSchema.type === "array") {
    return {
      type: "ARRAY",
      items: toGeminiSchema(jsonSchema.items),
    };
  }

  return {
    ...stripUnsupportedKeys(jsonSchema),
    type: (jsonSchema.type ?? "string").toUpperCase(),
  };
}

function stripUnsupportedKeys({ description, enum: enumValues }) {
  const out = {};
  if (description) out.description = description;
  if (enumValues) out.enum = enumValues.filter((v) => v !== null);
  return out;
}
