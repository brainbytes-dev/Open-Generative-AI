"use client";

/**
 * fal.ai adapter — implements the same function names/signatures as
 * muapi.js (apiKey, params) => Promise<{url, ...}> so client.js can route
 * to it transparently.
 *
 * Submit/poll/result: verified against fal's Queue API docs
 * (fal.ai/docs/model-endpoints/queue) — raw fetch, same style as the
 * existing muapi.js, routed through our own /api/fal proxy (mirrors how
 * muapi.js routes through /api to dodge browser CORS).
 *
 * File upload: fal's own docs state the raw REST upload contract is NOT
 * public/stable ("the SDK automatically handles reliability by falling
 * back between multiple upload endpoints") — so uploadFile() uses the
 * official @fal-ai/client SDK's fal.storage.upload() instead of
 * reimplementing an undocumented endpoint. This is the one place this
 * adapter depends on an npm package rather than raw fetch.
 */

import { getModelById, getI2IModelById, getVideoModelById, getI2VModelById } from "./catalog.fal.js";

const BASE_URL =
  typeof window !== "undefined" && window.location?.protocol?.startsWith("http")
    ? "/api/fal"
    : "https://queue.fal.run";

function authHeaders(apiKey) {
  return { "Content-Type": "application/json", "x-fal-key": apiKey };
}

async function pollForResult(falModelId, requestId, apiKey, maxAttempts = 900, interval = 2000) {
  const statusUrl = `${BASE_URL}/${falModelId}/requests/${requestId}/status`;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, interval));
    let res;
    try {
      res = await fetch(statusUrl, { headers: authHeaders(apiKey) });
    } catch (err) {
      if (attempt === maxAttempts) throw err;
      continue;
    }
    if (!res.ok) {
      if (res.status >= 500) continue;
      const errText = await res.text();
      throw new Error(`fal poll failed: ${res.status} - ${errText.slice(0, 100)}`);
    }
    const data = await res.json();
    if (data.status === "COMPLETED") {
      const resultRes = await fetch(`${BASE_URL}/${falModelId}/requests/${requestId}`, {
        headers: authHeaders(apiKey),
      });
      if (!resultRes.ok) {
        const errText = await resultRes.text();
        throw new Error(`fal result fetch failed: ${resultRes.status} - ${errText.slice(0, 100)}`);
      }
      return await resultRes.json();
    }
    if (data.status === "ERROR") {
      throw new Error(`fal generation failed: ${data.error?.message || data.error || "Unknown error"}`);
    }
    // IN_QUEUE / IN_PROGRESS — keep polling
  }
  throw new Error("fal generation timed out after polling.");
}

async function submitAndPoll(falModelId, payload, apiKey, onRequestId, maxAttempts = 60) {
  if (!apiKey) throw new Error("No fal.ai API key set. Add one in Settings.");
  const res = await fetch(`${BASE_URL}/${falModelId}`, {
    method: "POST",
    headers: authHeaders(apiKey),
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`fal request failed: ${res.status} ${res.statusText} - ${errText.slice(0, 200)}`);
  }
  const submitData = await res.json();
  const requestId = submitData.request_id;
  if (!requestId) return submitData;
  if (onRequestId) onRequestId(requestId);
  const result = await pollForResult(falModelId, requestId, apiKey, maxAttempts);
  const outputUrl =
    result.images?.[0]?.url || result.video?.url || result.image?.url || result.audio?.url || result.video_url;
  return { ...result, url: outputUrl };
}

function requireModel(modelInfo, id, kind) {
  if (!modelInfo) {
    throw new Error(`Model "${id}" is not in the fal.ai ${kind} catalog yet. Try a different model, or switch to Muapi in Settings.`);
  }
  return modelInfo;
}

export async function generateImage(apiKey, params) {
  const modelInfo = requireModel(getModelById(params.model), params.model, "text-to-image");
  const payload = await modelInfo.buildPayload(params, apiKey);
  return submitAndPoll(modelInfo.falId, payload, apiKey, params.onRequestId, 60);
}

export async function generateI2I(apiKey, params) {
  const modelInfo = requireModel(getI2IModelById(params.model), params.model, "image-to-image");
  const payload = await modelInfo.buildPayload(
    { ...params, image_url: params.image_url || params.images_list?.[0] },
    apiKey,
  );
  return submitAndPoll(modelInfo.falId, payload, apiKey, params.onRequestId, 60);
}

export async function generateVideo(apiKey, params) {
  const modelInfo = requireModel(getVideoModelById(params.model), params.model, "text-to-video");
  const payload = await modelInfo.buildPayload(params, apiKey);
  return submitAndPoll(modelInfo.falId, payload, apiKey, params.onRequestId, 900);
}

export async function generateI2V(apiKey, params) {
  const modelInfo = requireModel(getI2VModelById(params.model), params.model, "image-to-video");
  const payload = await modelInfo.buildPayload(
    { ...params, image_url: params.image_url || params.images_list?.[0] },
    apiKey,
  );
  return submitAndPoll(modelInfo.falId, payload, apiKey, params.onRequestId, 900);
}

// fal.storage.upload() — see file header for why this uses the SDK, not raw fetch.
export function uploadFile(apiKey, file, onProgress) {
  if (!apiKey) return Promise.reject(new Error("No fal.ai API key set. Add one in Settings."));
  return import("@fal-ai/client").then(async ({ fal }) => {
    fal.config({ credentials: apiKey });
    if (onProgress) onProgress(10); // fal's storage.upload() has no native progress callback
    try {
      const url = await fal.storage.upload(file);
      if (onProgress) onProgress(100);
      return url;
    } catch (err) {
      throw new Error(`fal.ai file upload failed: ${err.message || err}`);
    }
  });
}
