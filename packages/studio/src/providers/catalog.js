"use client";

/**
 * Provider-aware model catalog bundle for Image/Video Studio.
 *
 * Both bundles expose the exact same function/array names (matching the
 * upstream models.js interface), so a studio component only needs to swap
 * its import source — no per-provider branching inside the component.
 */

import * as muapiModels from "../models.js";
import * as falModels from "./catalog.fal.js";

const BUNDLES = {
  muapi: muapiModels,
  fal: falModels,
};

export function getModelLists(providerId) {
  return BUNDLES[providerId] || BUNDLES.muapi;
}
