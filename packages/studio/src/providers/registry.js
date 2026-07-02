"use client";

/**
 * Provider registry — the single place that lists which inference backends
 * this app can talk to. Adding a new provider (apifree.ai, replicate, …)
 * later is a data entry here + a providers/<id>.js adapter + a
 * providers/catalog.<id>.js model list. Nothing else in the app needs to
 * change (see client.js, providers/catalog.js).
 */

export const PROVIDERS = [
  {
    id: "muapi",
    label: "Muapi.ai",
    keyStorageKey: "muapi_key",
    keyUrl: "https://muapi.ai/access-keys",
    keyLabel: "Muapi API Key",
    description: "200+ models, all 12 studios (Workflows/Agents/Apps included).",
  },
  {
    id: "fal",
    label: "fal.ai",
    keyStorageKey: "fal_key",
    keyUrl: "https://fal.ai/dashboard/keys",
    keyLabel: "fal.ai API Key",
    description: "Image + Video Studio, curated model set. Other studios need Muapi.",
  },
];

export const DEFAULT_PROVIDER_ID = "muapi";
const PROVIDER_STORAGE_KEY = "ogai_provider";

export function getProviderConfig(id) {
  return PROVIDERS.find((p) => p.id === id) || PROVIDERS[0];
}

export function getActiveProviderId() {
  if (typeof window === "undefined") return DEFAULT_PROVIDER_ID;
  const stored = localStorage.getItem(PROVIDER_STORAGE_KEY);
  return PROVIDERS.some((p) => p.id === stored) ? stored : DEFAULT_PROVIDER_ID;
}

export function setActiveProviderId(id) {
  if (typeof window === "undefined") return;
  if (!PROVIDERS.some((p) => p.id === id)) return;
  localStorage.setItem(PROVIDER_STORAGE_KEY, id);
}

export function getStoredKey(providerId) {
  if (typeof window === "undefined") return null;
  const cfg = getProviderConfig(providerId);
  return localStorage.getItem(cfg.keyStorageKey);
}

export function setStoredKey(providerId, key) {
  if (typeof window === "undefined") return;
  const cfg = getProviderConfig(providerId);
  if (key) localStorage.setItem(cfg.keyStorageKey, key);
  else localStorage.removeItem(cfg.keyStorageKey);
}

/** Any provider with a stored key — used to decide whether to show the app or the key gate. */
export function hasAnyKey() {
  return PROVIDERS.some((p) => !!getStoredKey(p.id));
}
