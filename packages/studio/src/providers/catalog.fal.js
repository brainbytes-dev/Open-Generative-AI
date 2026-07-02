"use client";

/**
 * fal.ai model catalog — curated entries + a live-loaded full catalog.
 *
 * A handful of entries below have a hand-written buildPayload() for models
 * worth a first-class experience. Everything else fal.ai offers (600+
 * models) is loaded live from fal's Platform API (see fal-discovery.js) and
 * uses a *generic* payload builder driven by that model's actual OpenAPI
 * schema — fetched on demand, not guessed. See ensureFalCatalogLoaded().
 *
 * t2iModels/i2iModels/t2vModels/i2vModels are `let` bindings, not `const`:
 * ensureFalCatalogLoaded() reassigns them once the live list arrives. ES
 * module bindings are live, so any code that re-reads them (e.g. a React
 * component re-rendering after subscribeFalCatalog() fires) sees the
 * expanded list without needing this module to notify via a promise.
 */

import { listModels, getModelInputSchema, buildGenericPayload } from "./fal-discovery.js";

const AR_TO_IMAGE_SIZE = {
  "1:1": "square_hd",
  "4:3": "landscape_4_3",
  "16:9": "landscape_16_9",
  "3:4": "portrait_4_3",
  "9:16": "portrait_16_9",
};

function aspectRatioToImageSize(ar) {
  return AR_TO_IMAGE_SIZE[ar] || "square_hd";
}

/**
 * Dynamic (schema-driven) models get this instead of a hand-written
 * buildPayload. Every buildPayload — curated or dynamic — is called as
 * `buildPayload(params, apiKey)`; curated ones just ignore the second arg.
 */
function makeDynamicBuildPayload(falId) {
  return async function buildPayload(params, apiKey) {
    const schema = await getModelInputSchema(falId, apiKey);
    return buildGenericPayload(schema, params);
  };
}

function toDynamicEntry(m) {
  return {
    id: m.id,
    name: m.name,
    falId: m.id,
    description: m.description,
    dynamic: true,
    buildPayload: makeDynamicBuildPayload(m.id),
  };
}

// ─── Text-to-Image (curated) ────────────────────────────────────────────────

const CURATED_T2I = [
  {
    id: "fal-flux-pro-v11",
    name: "Flux 1.1 Pro",
    falId: "fal-ai/flux-pro/v1.1",
    inputs: {
      aspect_ratio: { enum: ["1:1", "4:3", "16:9", "3:4", "9:16"], default: "1:1" },
    },
    buildPayload(params) {
      return {
        prompt: params.prompt,
        image_size: aspectRatioToImageSize(params.aspect_ratio),
        ...(params.seed && params.seed !== -1 ? { seed: params.seed } : {}),
      };
    },
  },
  {
    id: "fal-nano-banana",
    name: "Nano Banana (Gemini Flash Image)",
    falId: "fal-ai/nano-banana",
    inputs: {
      aspect_ratio: { enum: ["1:1", "4:3", "16:9", "3:4", "9:16"], default: "1:1" },
    },
    buildPayload(params) {
      return {
        prompt: params.prompt,
        aspect_ratio: params.aspect_ratio || "1:1",
      };
    },
  },
  {
    id: "fal-seedream-v4",
    name: "Seedream 4.0",
    falId: "fal-ai/bytedance/seedream/v4/text-to-image",
    buildPayload(params) {
      return { prompt: params.prompt };
    },
  },
  {
    id: "fal-ideogram-v3",
    name: "Ideogram V3",
    falId: "fal-ai/ideogram/v3",
    buildPayload(params) {
      return { prompt: params.prompt };
    },
  },
];

// ─── Image-to-Image (curated) ───────────────────────────────────────────────

const CURATED_I2I = [
  {
    id: "fal-flux-pro-kontext",
    name: "Flux Pro Kontext",
    falId: "fal-ai/flux-pro/kontext",
    imageField: "image_url",
    inputs: {
      aspect_ratio: { enum: ["1:1", "4:3", "16:9", "3:4", "9:16"], default: "1:1" },
    },
    buildPayload(params) {
      return {
        prompt: params.prompt || "",
        image_url: params.image_url,
        image_size: aspectRatioToImageSize(params.aspect_ratio),
      };
    },
  },
  {
    id: "fal-gemini-3-pro-image-edit",
    name: "Gemini 3 Pro Image Edit",
    falId: "fal-ai/gemini-3-pro-image-preview/edit",
    imageField: "image_url",
    inputs: {
      aspect_ratio: { enum: ["auto", "1:1", "4:3", "16:9", "3:4", "9:16"], default: "auto" },
    },
    buildPayload(params) {
      return {
        prompt: params.prompt || "",
        image_urls: [params.image_url],
        aspect_ratio: params.aspect_ratio || "auto",
      };
    },
  },
];

// ─── Text-to-Video (curated) ────────────────────────────────────────────────

const CURATED_T2V = [
  {
    id: "fal-kling-v21-master-t2v",
    name: "Kling 2.1 Master",
    falId: "fal-ai/kling-video/v2.1/master/text-to-video",
    buildPayload(params) {
      return { prompt: params.prompt };
    },
  },
  {
    id: "fal-hailuo-02-pro-t2v",
    name: "Hailuo 02 Pro",
    falId: "fal-ai/minimax/hailuo-02/pro/text-to-video",
    buildPayload(params) {
      return { prompt: params.prompt };
    },
  },
];

// ─── Image-to-Video (curated) ───────────────────────────────────────────────

const CURATED_I2V = [
  {
    id: "fal-kling-v21-standard-i2v",
    name: "Kling 2.1 Standard I2V",
    falId: "fal-ai/kling-video/v2.1/standard/image-to-video",
    imageField: "image_url",
    inputs: {
      duration: { enum: ["5", "10"], default: "5" },
    },
    buildPayload(params) {
      return {
        prompt: params.prompt || "",
        image_url: params.image_url,
        duration: params.duration || "5",
      };
    },
  },
  {
    id: "fal-kling-v21-pro-i2v",
    name: "Kling 2.1 Pro I2V",
    falId: "fal-ai/kling-video/v2.1/pro/image-to-video",
    imageField: "image_url",
    inputs: {
      aspect_ratio: { enum: ["16:9", "9:16", "1:1"], default: "16:9" },
      duration: { enum: ["5", "10"], default: "5" },
    },
    buildPayload(params) {
      return {
        prompt: params.prompt || "",
        image_url: params.image_url,
        aspect_ratio: params.aspect_ratio || "16:9",
        duration: params.duration || "5",
      };
    },
  },
  {
    id: "fal-veo31-fast-i2v",
    name: "Veo 3.1 Fast I2V",
    falId: "fal-ai/veo3.1/fast/image-to-video",
    imageField: "image_url",
    inputs: {
      aspect_ratio: { enum: ["auto", "16:9", "9:16"], default: "auto" },
      duration: { enum: ["4s", "6s", "8s"], default: "8s" },
    },
    buildPayload(params) {
      return {
        prompt: params.prompt || "",
        image_url: params.image_url,
        aspect_ratio: params.aspect_ratio || "auto",
        duration: params.duration || "8s",
      };
    },
  },
];

// ─── Video-to-Video ─────────────────────────────────────────────────────────
// No curated v2v entries in v1 (watermark-remover style tools) — empty on
// purpose so VideoStudio's v2v UI stays hidden rather than erroring.

export const v2vModels = [];

export function getV2VModelById() {
  return null;
}

// ─── Live catalog store ─────────────────────────────────────────────────────
// Starts as just the curated arrays above (works instantly, no network wait).
// ensureFalCatalogLoaded() fetches fal's full model list per category and
// reassigns these bindings to curated + everything else fal offers. Because
// these are `let` exports, any module that re-reads them (e.g. a component
// re-rendering after subscribeFalCatalog() fires) sees the expanded list —
// see ImageStudio.jsx / VideoStudio.jsx for the subscribe + trigger side.

export let t2iModels = [...CURATED_T2I];
export let i2iModels = [...CURATED_I2I];
export let t2vModels = [...CURATED_T2V];
export let i2vModels = [...CURATED_I2V];

const listeners = new Set();
export function subscribeFalCatalog(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
function notifyFalCatalog() {
  listeners.forEach((fn) => fn());
}

let loadedForKey = null;
let loadingPromise = null;

export function ensureFalCatalogLoaded(apiKey) {
  if (!apiKey || loadedForKey === apiKey) return loadingPromise || Promise.resolve();
  if (loadingPromise) return loadingPromise;

  loadingPromise = Promise.all([
    listModels("text-to-image", apiKey),
    listModels("image-to-image", apiKey),
    listModels("text-to-video", apiKey),
    listModels("image-to-video", apiKey),
  ])
    .then(([t2iRaw, i2iRaw, t2vRaw, i2vRaw]) => {
      const dedupe = (curated, raw) => {
        const curatedIds = new Set(curated.map((m) => m.falId));
        return [...curated, ...raw.filter((m) => !curatedIds.has(m.id)).map(toDynamicEntry)];
      };
      t2iModels = dedupe(CURATED_T2I, t2iRaw);
      i2iModels = dedupe(CURATED_I2I, i2iRaw);
      t2vModels = dedupe(CURATED_T2V, t2vRaw);
      i2vModels = dedupe(CURATED_I2V, i2vRaw);
      loadedForKey = apiKey;
      notifyFalCatalog();
    })
    .catch((err) => {
      console.error("[fal catalog] Failed to load full model list, staying on curated set:", err);
      loadedForKey = null; // allow retry on next call
    })
    .finally(() => {
      loadingPromise = null;
    });

  return loadingPromise;
}

// ─── Getters (mirror models.js naming so client code stays uniform) ────────

export function getModelById(id) {
  return t2iModels.find((m) => m.id === id) || null;
}
export function getI2IModelById(id) {
  return i2iModels.find((m) => m.id === id) || null;
}
export function getVideoModelById(id) {
  return t2vModels.find((m) => m.id === id) || null;
}
export function getI2VModelById(id) {
  return i2vModels.find((m) => m.id === id) || null;
}

export function getAspectRatiosForModel(id) {
  return getModelById(id)?.inputs?.aspect_ratio?.enum || [];
}
export function getResolutionsForModel() {
  return []; // no quality/resolution picker in the v1 fal catalog
}
export function getQualityFieldForModel() {
  return null;
}

export function getAspectRatiosForI2IModel(id) {
  return getI2IModelById(id)?.inputs?.aspect_ratio?.enum || [];
}
export function getResolutionsForI2IModel() {
  return [];
}
export function getQualityFieldForI2IModel() {
  return null;
}
export function getMaxImagesForI2IModel() {
  return 1; // curated fal i2i entries take a single reference image
}
export function getEffectsForI2IModel() {
  return [];
}
export function getDefaultEffectForI2IModel() {
  return null;
}

export function getAspectRatiosForVideoModel() {
  return []; // fal-kling-v21-master-t2v is prompt-only
}
export function getDurationsForModel() {
  return [];
}
export function getResolutionsForVideoModel() {
  return [];
}

export function getAspectRatiosForI2VModel(id) {
  return getI2VModelById(id)?.inputs?.aspect_ratio?.enum || [];
}
export function getDurationsForI2VModel(id) {
  return getI2VModelById(id)?.inputs?.duration?.enum || [];
}
export function getResolutionsForI2VModel() {
  return [];
}
export function getEffectsForI2VModel() {
  return [];
}
export function getDefaultEffectForI2VModel() {
  return null;
}
export function getModesForModel() {
  return [];
}
export function getMaxImagesForI2VModel() {
  return 1;
}
