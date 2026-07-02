"use client";

/**
 * Curated fal.ai model catalog.
 *
 * Deliberately small: fal hosts 600+ models with wildly different input
 * schemas (unlike Muapi's fairly uniform endpoint convention), so each entry
 * here has an explicit buildPayload() instead of a generic param mapper —
 * no guessing at a shape that might silently be wrong for one model.
 *
 * Every falId + schema below is verified against fal's own docs
 * (fal.ai/docs/model-endpoints/queue, and the per-model API reference pages
 * for flux-pro/v1.1, flux-pro/kontext, kling-video/v2.1). Extending this
 * catalog is a data entry, not a code change: copy an entry, point falId at
 * the new model, adjust buildPayload to that model's documented input shape.
 */

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

// ─── Text-to-Image ──────────────────────────────────────────────────────────

export const t2iModels = [
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
];

// ─── Image-to-Image ─────────────────────────────────────────────────────────

export const i2iModels = [
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
];

// ─── Text-to-Video ──────────────────────────────────────────────────────────

export const t2vModels = [
  {
    id: "fal-kling-v21-master-t2v",
    name: "Kling 2.1 Master",
    falId: "fal-ai/kling-video/v2.1/master/text-to-video",
    buildPayload(params) {
      return { prompt: params.prompt };
    },
  },
];

// ─── Image-to-Video ─────────────────────────────────────────────────────────

export const i2vModels = [
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
];

// ─── Video-to-Video ─────────────────────────────────────────────────────────
// No curated v2v entries in v1 (watermark-remover style tools) — empty on
// purpose so VideoStudio's v2v UI stays hidden rather than erroring.

export const v2vModels = [];

export function getV2VModelById() {
  return null;
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
