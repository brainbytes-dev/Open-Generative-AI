"use client";

/**
 * Tracks in-flight generation requests in localStorage so a tab switch or
 * reload doesn't strand them: the request already costs money on the
 * provider's side the moment it's submitted, so losing track of it client-
 * side (previously: an in-memory poll loop, gone the instant the component
 * unmounts) means paying for a result you never see.
 *
 * Flow: trackPending() right after a submit returns a request id,
 * untrackPending() once resolved (success or error). On mount, studios call
 * getPending(kind) to find anything still outstanding from a previous
 * session and resume polling it — no new submit, just re-attaching to the
 * existing request_id.
 */

const STORAGE_KEY = "ogai_pending_generations";
const MAX_AGE_MS = 30 * 60 * 1000; // drop anything older than 30min — assume abandoned/errored upstream

function readAll() {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
  } catch {
    return {};
  }
}

function writeAll(entries) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
}

const listeners = new Set();
export function subscribePending(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
function notify() {
  listeners.forEach((fn) => fn());
}

/** meta: { provider, kind: 'image'|'video', modelName, prompt, statusUrl } */
export function trackPending(requestId, meta) {
  const entries = readAll();
  entries[requestId] = { ...meta, requestId, startedAt: Date.now() };
  writeAll(entries);
  notify();
}

export function untrackPending(requestId) {
  const entries = readAll();
  delete entries[requestId];
  writeAll(entries);
  notify();
}

/** Pending entries for a given provider+kind, pruned of anything stale. */
export function getPending(provider, kind) {
  const entries = readAll();
  const now = Date.now();
  let changed = false;
  const fresh = {};
  for (const [id, entry] of Object.entries(entries)) {
    if (now - entry.startedAt > MAX_AGE_MS) {
      changed = true;
      continue;
    }
    fresh[id] = entry;
  }
  if (changed) writeAll(fresh);
  return Object.values(fresh).filter((e) => e.provider === provider && e.kind === kind);
}
