"use client";

/**
 * Dispatcher facade — the ONLY file studio components should import instead
 * of muapi.js. Re-exports the exact same names as muapi.js so this is a
 * pure import-path swap everywhere else (see MERGING.md).
 *
 * Generation primitives (generateImage, generateVideo, uploadFile, …) are
 * routed to whichever provider is active (registry.getActiveProviderId()),
 * looked up live on every call — so switching the provider in Settings
 * takes effect on the next Generate click, no reload needed.
 *
 * Muapi platform/cloud-only functions (workflows, agents, apps, balance,
 * the generic proxy helpers) are NOT provider-routed: fal.ai and any future
 * provider are inference gateways, not workflow/agent runtimes, so these
 * always go straight to the Muapi adapter regardless of the active
 * provider. Calling them without a Muapi key fails the same way it always
 * did (upstream behavior, unchanged).
 */

import * as muapiAdapter from "./muapi.js";
import * as falAdapter from "./providers/fal.js";
import { getActiveProviderId } from "./providers/registry.js";

const ADAPTERS = {
  muapi: muapiAdapter,
  fal: falAdapter,
};

function activeAdapter() {
  return ADAPTERS[getActiveProviderId()] || muapiAdapter;
}

/** Routes a generation call to the active provider; clear error if that provider's adapter doesn't implement it. */
function route(fnName) {
  return (...args) => {
    const adapter = activeAdapter();
    const fn = adapter[fnName];
    if (typeof fn !== "function") {
      const id = getActiveProviderId();
      throw new Error(
        `${fnName} is not supported on provider "${id}" yet. Switch to Muapi in Settings for this feature.`
      );
    }
    return fn(...args);
  };
}

// ─── Provider-routed generation primitives ─────────────────────────────────

export const generateImage = route("generateImage");
export const generateI2I = route("generateI2I");
export const generateVideo = route("generateVideo");
export const generateI2V = route("generateI2V");
export const uploadFile = route("uploadFile");
export const processV2V = route("processV2V");
export const processRecast = route("processRecast");
export const processLipSync = route("processLipSync");
export const generateAudio = route("generateAudio");
export const runClipping = route("runClipping");
export const runMotionGraphics = route("runMotionGraphics");
export const runMotionGraphicsEdit = route("runMotionGraphicsEdit");
export const generateMarketingStudioAd = route("generateMarketingStudioAd");

// ─── Muapi-cloud-only — always the Muapi adapter, never provider-routed ────

export const getUserBalance = muapiAdapter.getUserBalance;
export const getTemplateWorkflows = muapiAdapter.getTemplateWorkflows;
export const getUserWorkflows = muapiAdapter.getUserWorkflows;
export const getPublishedWorkflows = muapiAdapter.getPublishedWorkflows;
export const getTemplateAgents = muapiAdapter.getTemplateAgents;
export const getUserAgents = muapiAdapter.getUserAgents;
export const getPublishedAgents = muapiAdapter.getPublishedAgents;
export const getUserConversations = muapiAdapter.getUserConversations;
export const createWorkflow = muapiAdapter.createWorkflow;
export const updateWorkflowName = muapiAdapter.updateWorkflowName;
export const deleteWorkflow = muapiAdapter.deleteWorkflow;
export const getWorkflowInputs = muapiAdapter.getWorkflowInputs;
export const executeWorkflow = muapiAdapter.executeWorkflow;
export const getAllNodeSchemas = muapiAdapter.getAllNodeSchemas;
export const getWorkflowData = muapiAdapter.getWorkflowData;
export const getNodeSchemas = muapiAdapter.getNodeSchemas;
export const runSingleNode = muapiAdapter.runSingleNode;
export const deleteNodeRun = muapiAdapter.deleteNodeRun;
export const getNodeStatus = muapiAdapter.getNodeStatus;
export const handleProxyRequest = muapiAdapter.handleProxyRequest;
export const handleServerSideProxy = muapiAdapter.handleServerSideProxy;
export const calculateDynamicCost = muapiAdapter.calculateDynamicCost;
export const registerAppInterest = muapiAdapter.registerAppInterest;
export const getAppInterests = muapiAdapter.getAppInterests;
