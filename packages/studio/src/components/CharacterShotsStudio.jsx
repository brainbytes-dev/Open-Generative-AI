"use client";

import { useState, useEffect, useRef, useCallback, useReducer } from "react";
import { generateI2I, uploadFile } from "../client.js";
import { getActiveProviderId } from "../providers/registry.js";
import { getPending } from "../providers/pending-tracker.js";
import { resumePending } from "../providers/fal.js";

// Fixed 9-angle recipe — reproduces the identity-preserve, image-to-image
// prompt format from the character-angle-sheet skill convention: never
// redescribe the face, only state what changes about the camera/pose.
// Lighting/background/framing stay constant across the set on purpose —
// that sameness is what keeps every shot reading as the same person.
const ANGLE_PRESETS = [
  {
    id: "three-quarter-left",
    label: "Three-Quarter Left",
    change:
      "turn the head about 35 degrees to camera left, three-quarter view, eyes still toward the lens",
  },
  {
    id: "three-quarter-right",
    label: "Three-Quarter Right",
    change:
      "turn the head about 35 degrees to camera right, three-quarter view, eyes still toward the lens",
  },
  {
    id: "left-profile",
    label: "Left Profile",
    change: "full left profile, head turned 90 degrees to camera left",
  },
  {
    id: "right-profile",
    label: "Right Profile",
    change: "full right profile, head turned 90 degrees to camera right",
  },
  {
    id: "high-angle",
    label: "High Angle",
    change:
      "camera positioned slightly above eye level, looking down at a gentle angle, face still toward camera",
  },
  {
    id: "low-angle",
    label: "Low Angle",
    change:
      "camera positioned slightly below eye level, looking up at a gentle angle, face still toward camera",
  },
  {
    id: "close-up",
    label: "Close-Up",
    change: "extreme close-up on the face only, filling most of the frame, straight-on angle unchanged",
  },
  {
    id: "half-body-left",
    label: "Half-Body Left",
    change:
      "widen the framing to half-body (waist-up), body turned slightly three-quarter to camera left, head turned back toward the lens",
  },
  {
    id: "half-body-right",
    label: "Half-Body Right",
    change:
      "widen the framing to half-body (waist-up), body turned slightly three-quarter to camera right, head turned back toward the lens",
  },
];

const MODEL_OPTIONS = [
  { id: "fal-nano-banana-2-edit", name: "Nano Banana 2 Edit" },
  { id: "fal-gpt-image-2-edit", name: "GPT Image 2 Edit" },
];

function buildAnglePrompt(preset, signatureNotes) {
  const signature = signatureNotes?.trim()
    ? ` Signature: keep ${signatureNotes.trim()} clearly visible.`
    : "";
  return (
    `Use the reference photo to keep the EXACT same face, eyes, hair, skin, and identity — ` +
    `same person, do NOT modify or reinterpret the face.${signature}\n\n` +
    `Only change: ${preset.change}. Same soft even frontal studio lighting, same seamless plain ` +
    `white background, same head-and-shoulders framing, eye level, 85mm look.`
  );
}

async function downloadImage(url, filename) {
  try {
    const response = await fetch(url);
    const blob = await response.blob();
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(blobUrl);
  } catch {
    window.open(url, "_blank");
  }
}

export default function CharacterShotsStudio({ apiKey }) {
  const [referenceUrl, setReferenceUrl] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [selectedModel, setSelectedModel] = useState(MODEL_OPTIONS[0].id);
  const [signatureNotes, setSignatureNotes] = useState("");
  const [generating, setGenerating] = useState(false);
  // { [presetId]: { status: 'idle'|'loading'|'done'|'error', url, error } }
  const [shots, setShots] = useState({});
  const fileInputRef = useRef(null);

  const [, forceRerender] = useReducer((x) => x + 1, 0);

  const applyResult = useCallback((presetId, res) => {
    setShots((prev) => ({ ...prev, [presetId]: { status: "done", url: res.url } }));
  }, []);

  // Recover any of the 9 shots that were still in-flight on fal.ai when this
  // component last unmounted (tab switch, reload). Same mechanism as
  // ImageStudio/VideoStudio (see providers/pending-tracker.js), scoped to
  // this studio's own "character-shot" kind so it doesn't collide with
  // Image Studio's own pending image generations.
  useEffect(() => {
    if (getActiveProviderId() !== "fal" || !apiKey) return;
    const pending = getPending("fal", "character-shot");
    pending.forEach((entry) => {
      const presetId = entry.presetId;
      if (presetId) setShots((prev) => ({ ...prev, [presetId]: { status: "loading" } }));
      resumePending(entry, apiKey)
        .then((res) => {
          if (res?.url && presetId) applyResult(presetId, res);
        })
        .catch((err) => {
          console.error("[CharacterShotsStudio] Failed to resume pending shot:", err);
          if (presetId) setShots((prev) => ({ ...prev, [presetId]: { status: "error", error: err.message } }));
        });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleFileChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    e.target.value = "";
    if (file.size > 10 * 1024 * 1024) {
      alert("Image exceeds 10MB limit.");
      return;
    }
    setUploading(true);
    try {
      const url = await uploadFile(apiKey, file);
      setReferenceUrl(url);
      setShots({});
    } catch (err) {
      alert(`Upload failed: ${err.message}`);
    } finally {
      setUploading(false);
    }
  };

  const handleGenerateAll = async () => {
    if (!referenceUrl || generating) return;
    setGenerating(true);
    setShots(Object.fromEntries(ANGLE_PRESETS.map((p) => [p.id, { status: "loading" }])));

    await Promise.allSettled(
      ANGLE_PRESETS.map(async (preset) => {
        try {
          const res = await generateI2I(apiKey, {
            model: selectedModel,
            image_url: referenceUrl,
            prompt: buildAnglePrompt(preset, signatureNotes),
            kind: "character-shot",
            onRequestId: (requestId) => {
              // Tag the pending-tracker entry with which preset it belongs to,
              // so a resume after reload knows which grid cell to fill.
              const raw = localStorage.getItem("ogai_pending_generations");
              if (!raw) return;
              try {
                const all = JSON.parse(raw);
                if (all[requestId]) {
                  all[requestId].presetId = preset.id;
                  localStorage.setItem("ogai_pending_generations", JSON.stringify(all));
                }
              } catch {
                // best-effort tagging only
              }
            },
          });
          if (res?.url) applyResult(preset.id, res);
          else throw new Error("No image URL returned by API");
        } catch (err) {
          setShots((prev) => ({ ...prev, [preset.id]: { status: "error", error: err.message } }));
        }
      }),
    );

    setGenerating(false);
  };

  const allDone =
    ANGLE_PRESETS.length > 0 && ANGLE_PRESETS.every((p) => shots[p.id]?.status === "done");

  return (
    <div className="w-full h-full flex flex-col bg-app-bg overflow-y-auto custom-scrollbar p-6">
      <div className="max-w-5xl mx-auto w-full">
        <h1 className="text-2xl font-bold text-white mb-1">Character Shots</h1>
        <p className="text-white/40 text-sm mb-6">
          Upload one reference photo, generate 9 consistent angle shots of the same person in one click.
        </p>

        {/* ── Controls ── */}
        <div className="bg-white/5 border border-white/[0.03] rounded-xl p-5 mb-6 flex flex-col gap-4">
          <div className="flex flex-wrap items-start gap-4">
            <div className="flex flex-col gap-2">
              <label className="text-xs font-bold text-white/40">Reference Image</label>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleFileChange}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-24 h-24 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 flex items-center justify-center overflow-hidden relative"
              >
                {uploading ? (
                  <span className="text-[10px] text-primary animate-pulse">Uploading…</span>
                ) : referenceUrl ? (
                  <img src={referenceUrl} alt="Reference" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-[10px] text-white/40 px-2 text-center">Click to upload</span>
                )}
              </button>
            </div>

            <div className="flex flex-col gap-2 flex-1 min-w-[220px]">
              <label className="text-xs font-bold text-white/40">Model</label>
              <select
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value)}
                className="bg-white/5 border border-white/10 rounded-md px-3 py-2 text-sm text-white"
              >
                {MODEL_OPTIONS.map((m) => (
                  <option key={m.id} value={m.id} className="bg-[#0a0a0a]">
                    {m.name}
                  </option>
                ))}
              </select>

              <label className="text-xs font-bold text-white/40 mt-2">
                Signature / identity notes (optional)
              </label>
              <input
                type="text"
                value={signatureNotes}
                onChange={(e) => setSignatureNotes(e.target.value)}
                placeholder="e.g. small beauty mark above the right corner of the mouth"
                className="bg-white/5 border border-white/10 rounded-md px-3 py-2 text-sm text-white placeholder:text-white/20"
              />
            </div>
          </div>

          <button
            type="button"
            onClick={handleGenerateAll}
            disabled={!referenceUrl || generating}
            className="self-start bg-[#22d3ee] text-black px-5 py-2.5 rounded-md font-medium text-sm hover:bg-[#e5ff33] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {generating ? "Generating 9 shots…" : "Generate All 9"}
          </button>
        </div>

        {/* ── Grid ── */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {ANGLE_PRESETS.map((preset) => {
            const shot = shots[preset.id];
            return (
              <div
                key={preset.id}
                className="aspect-[3/4] rounded-lg border border-white/10 bg-[#0a0a0a] overflow-hidden relative flex items-center justify-center"
              >
                {shot?.status === "loading" && (
                  <div className="w-8 h-8 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
                )}
                {shot?.status === "error" && (
                  <span className="text-[11px] text-red-400 px-3 text-center">{shot.error}</span>
                )}
                {shot?.status === "done" && (
                  <>
                    <img src={shot.url} alt={preset.label} className="w-full h-full object-cover" />
                    <button
                      type="button"
                      onClick={() => downloadImage(shot.url, `character-${preset.id}.jpg`)}
                      className="absolute top-2 right-2 p-1.5 bg-black/60 backdrop-blur-md rounded-full text-white hover:bg-primary hover:text-black transition-all border border-white/10"
                      title="Download"
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" />
                      </svg>
                    </button>
                  </>
                )}
                {!shot && (
                  <span className="text-[10px] text-white/20">{preset.label}</span>
                )}
                <span className="absolute bottom-1 left-1.5 text-[9px] font-bold text-white/50 bg-black/50 px-1.5 py-0.5 rounded">
                  {preset.label}
                </span>
              </div>
            );
          })}
        </div>

        {allDone && (
          <p className="text-center text-xs text-primary mt-4">All 9 shots generated.</p>
        )}
      </div>
    </div>
  );
}
