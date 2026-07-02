"use client";

/**
 * fal.ai Platform API — model discovery + OpenAPI schema resolution.
 *
 * Verified live against the real API (2026-07-02):
 *   GET /v1/models?category=X&status=active&limit=100  -> { models, has_more, next_cursor }
 *   GET /v1/models?endpoint_id=X&expand=openapi-3.0     -> { models: [{ endpoint_id, metadata, openapi }] }
 *
 * The openapi field is a standard OpenAPI 3.0 doc: paths['/{endpoint_id}'].post
 * .requestBody.content['application/json'].schema is a $ref into
 * components.schemas — resolved here into a plain JSON Schema object with
 * `properties`/`required`, which buildGenericPayload() below maps our app's
 * normalized generation params onto.
 *
 * This is what makes "every fal model" tractable without hand-writing a
 * buildPayload per model: we ask fal what a model's input actually looks
 * like at call time, instead of guessing.
 */

const BASE_URL =
  typeof window !== "undefined" && window.location?.protocol?.startsWith("http")
    ? "/api/fal/v1"
    : "https://api.fal.ai/v1";

function authHeaders(apiKey) {
  return { "Content-Type": "application/json", "x-fal-key": apiKey };
}

const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6h
const listCache = new Map(); // category -> { ts, models }
const schemaCache = new Map(); // endpointId -> { ts, schema }

export async function listModels(category, apiKey, { maxModels = 400 } = {}) {
  const cached = listCache.get(category);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) return cached.models;

  const results = [];
  let cursor = null;
  while (results.length < maxModels) {
    const qs = new URLSearchParams({ category, status: "active", limit: "100" });
    if (cursor) qs.set("cursor", cursor);
    const res = await fetch(`${BASE_URL}/models?${qs}`, { headers: authHeaders(apiKey) });
    if (!res.ok) throw new Error(`fal model list failed: ${res.status} ${res.statusText}`);
    const data = await res.json();
    const page = data.models || data.data || [];
    results.push(
      ...page.map((m) => ({
        id: m.endpoint_id,
        name: m.metadata?.display_name || m.endpoint_id,
        description: m.metadata?.description || "",
      })),
    );
    if (!data.has_more || !data.next_cursor) break;
    cursor = data.next_cursor;
  }
  listCache.set(category, { ts: Date.now(), models: results });
  return results;
}

function resolveRef(schemas, ref) {
  const name = ref.replace("#/components/schemas/", "");
  return schemas[name];
}

/** Fetches + resolves the input JSON Schema for one model. Cached per endpoint. */
export async function getModelInputSchema(endpointId, apiKey) {
  const cached = schemaCache.get(endpointId);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) return cached.schema;

  const qs = new URLSearchParams({ endpoint_id: endpointId, expand: "openapi-3.0" });
  const res = await fetch(`${BASE_URL}/models?${qs}`, { headers: authHeaders(apiKey) });
  if (!res.ok) throw new Error(`fal schema fetch failed for ${endpointId}: ${res.status}`);
  const data = await res.json();
  const model = (data.models || data.data || [])[0];
  const openapi = model?.openapi;
  if (!openapi) throw new Error(`No OpenAPI schema returned for ${endpointId}`);

  const schemas = openapi.components?.schemas || {};
  const submitEntry = Object.entries(openapi.paths || {}).find(
    ([path, methods]) => methods.post && !path.includes("{"),
  );
  if (!submitEntry) throw new Error(`No submit path found in schema for ${endpointId}`);
  let bodySchema = submitEntry[1].post?.requestBody?.content?.["application/json"]?.schema || {};
  if (bodySchema.$ref) bodySchema = resolveRef(schemas, bodySchema.$ref) || {};

  const schema = { properties: bodySchema.properties || {}, required: bodySchema.required || [] };
  schemaCache.set(endpointId, { ts: Date.now(), schema });
  return schema;
}

const AR_TO_IMAGE_SIZE = {
  "1:1": "square_hd",
  "4:3": "landscape_4_3",
  "16:9": "landscape_16_9",
  "3:4": "portrait_4_3",
  "9:16": "portrait_16_9",
};

/**
 * Maps our app's normalized generation params onto whatever field names a
 * specific model's schema actually declares. A field is only set if the
 * schema has it — fields the model doesn't accept are silently omitted
 * rather than sent and rejected. Covers the handful of concepts every studio
 * UI produces (prompt, one reference image, aspect ratio, seed, duration);
 * anything more model-specific needs a hand-written catalog entry instead.
 */
export function buildGenericPayload(inputSchema, params) {
  const props = inputSchema?.properties || {};
  const payload = {};
  if (props.prompt !== undefined && params.prompt !== undefined) payload.prompt = params.prompt;
  if (params.image_url) {
    if (props.image_url !== undefined) payload.image_url = params.image_url;
    else if (props.image_urls !== undefined) payload.image_urls = [params.image_url];
  }
  if (props.aspect_ratio !== undefined && params.aspect_ratio) {
    payload.aspect_ratio = params.aspect_ratio;
  } else if (props.image_size !== undefined && params.aspect_ratio) {
    payload.image_size = AR_TO_IMAGE_SIZE[params.aspect_ratio] || "square_hd";
  }
  if (props.seed !== undefined && params.seed && params.seed !== -1) payload.seed = params.seed;
  if (props.duration !== undefined && params.duration) payload.duration = String(params.duration);
  return payload;
}
