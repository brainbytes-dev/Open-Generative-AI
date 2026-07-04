"use client";

import { useState, useEffect, useRef, useCallback, useReducer } from "react";
import { generateI2I, generateI2V, uploadFile } from "../client.js";
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

// Three state-of-the-art options, different strengths — not generic indie
// fal apps:
// - HeyGen: commercial industry standard for precise scripted-avatar
//   delivery (exact words, reliable lip-sync, built for marketing/UGC avatars).
// - Kling 3.0 Pro: cinematic motion + confirmed NATIVE audio generation,
//   more natural scene acting, less guaranteed on exact scripted wording.
// - Seedance 2.0: takes up to 9 tagged reference images (our whole angle set)
//   for the strongest identity-lock of the three, native phoneme-level
//   lip-synced audio. Best fit for this studio's actual output — multi-image
//   is a first-class input, not a single-image compromise.
const VIDEO_MODEL_OPTIONS = [
  { id: "fal-seedance-2-reference-to-video", name: "Seedance 2.0 (all 9 angles as reference, native audio)", multiSource: true },
  { id: "fal-heygen-avatar4-i2v", name: "HeyGen Avatar 4 (precise scripted speech)", multiSource: false },
  { id: "fal-kling-v3-pro-i2v", name: "Kling 3.0 Pro (cinematic motion + native audio)", multiSource: false },
];

const HEYGEN_VOICES = [
  "Jenny", "Warm Pro Narrator", "Chill Brian", "Ivy", "Monika Sogam", "Andrew",
  "Jack Sterling - Broadcaster 🎙️", "Cute Chloe - Friendly 😊", "Bold Blake",
  "Georgia", "Stella", "Expressive Evan", "Willow", "Baritone Ben",
  "Professor Dean", "Nassim - Informative", "Chloe - Lifelike",
];

const ASPECT_RATIOS = ["9:16", "16:9", "1:1", "4:5", "5:4"];
const KLING_DURATIONS = ["5", "8", "10", "12", "15"];

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

  // ── Step 2: bring a shot to life (talking / cinematic video) ───────────────
  // Array always, even for single-source models (just constrained to length 1
  // by toggleVideoSource below) — keeps one code path instead of two parallel
  // pieces of state that could drift out of sync.
  const [selectedSources, setSelectedSources] = useState([]);
  const [videoModel, setVideoModel] = useState(VIDEO_MODEL_OPTIONS[0].id);
  const isMultiSource = VIDEO_MODEL_OPTIONS.find((m) => m.id === videoModel)?.multiSource;
  const [script, setScript] = useState("");
  const [voice, setVoice] = useState(HEYGEN_VOICES[0]);
  const [aspectRatio, setAspectRatio] = useState("9:16");
  const [klingDuration, setKlingDuration] = useState(KLING_DURATIONS[0]);
  const [videoGenerating, setVideoGenerating] = useState(false);
  const [videoResult, setVideoResult] = useState(null); // { status, url, error }

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

  // Same recovery mechanism for the talking-video step, scoped to its own
  // "character-video" kind so it doesn't collide with the shots above or
  // with Video Studio's own pending generations.
  useEffect(() => {
    if (getActiveProviderId() !== "fal" || !apiKey) return;
    const pending = getPending("fal", "character-video");
    pending.forEach((entry) => {
      setVideoResult({ status: "loading" });
      resumePending(entry, apiKey)
        .then((res) => {
          if (res?.url) setVideoResult({ status: "done", url: res.url });
        })
        .catch((err) => {
          console.error("[CharacterShotsStudio] Failed to resume pending video:", err);
          setVideoResult({ status: "error", error: err.message });
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

  const handleGenerateVideo = async () => {
    if (selectedSources.length === 0 || !script.trim() || videoGenerating) return;
    setVideoGenerating(true);
    setVideoResult({ status: "loading" });
    try {
      const res = await generateI2V(apiKey, {
        model: videoModel,
        image_url: selectedSources[0],
        images_list: isMultiSource ? selectedSources : undefined,
        text_input: script.trim(),
        voice,
        aspect_ratio: aspectRatio,
        resolution: "1080p",
        duration: klingDuration,
        kind: "character-video",
      });
      if (res?.url) setVideoResult({ status: "done", url: res.url });
      else throw new Error("No video URL returned by API");
    } catch (err) {
      setVideoResult({ status: "error", error: err.message });
    } finally {
      setVideoGenerating(false);
    }
  };

  const availableSources = [
    referenceUrl ? { id: "__reference__", url: referenceUrl, label: "Original" } : null,
    ...ANGLE_PRESETS.filter((p) => shots[p.id]?.status === "done").map((p) => ({
      id: p.id,
      url: shots[p.id].url,
      label: p.label,
    })),
  ].filter(Boolean);

  // Multi-source models (Seedance) get the most value from ALL angles at
  // once — default to everything selected instead of making the user click
  // 9 times. Re-syncs whenever the model switches or the available set grows
  // (e.g. a shot finishes generating after Seedance was already selected).
  useEffect(() => {
    if (!isMultiSource) return;
    setSelectedSources(availableSources.map((s) => s.url));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMultiSource, availableSources.length]);

  const toggleVideoSource = (url) => {
    if (isMultiSource) {
      setSelectedSources((prev) =>
        prev.includes(url) ? prev.filter((u) => u !== url) : [...prev, url],
      );
    } else {
      setSelectedSources([url]);
    }
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

        {/* ── Step 2: Bring it to life ── */}
        {availableSources.length > 0 && (
          <div className="mt-10 pt-8 border-t border-white/10">
            <h2 className="text-xl font-bold text-white mb-1">Step 2 — Bring It to Life</h2>
            <p className="text-white/40 text-sm mb-6">
              {isMultiSource
                ? "All angles are used as reference for maximum identity consistency — deselect any you don't want included."
                : "Pick one shot, write the script, generate a talking UGC video ready for TikTok/Reels."}
            </p>

            <div className="bg-white/5 border border-white/[0.03] rounded-xl p-5 flex flex-col gap-4">
              <div className="flex flex-wrap gap-3">
                {availableSources.map((s) => {
                  const isSelected = selectedSources.includes(s.url);
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => toggleVideoSource(s.url)}
                      className={`relative w-16 h-16 rounded-lg overflow-hidden border-2 transition-all ${
                        isSelected ? "border-primary" : "border-white/10 hover:border-white/30"
                      }`}
                      title={s.label}
                    >
                      <img src={s.url} alt={s.label} className="w-full h-full object-cover" />
                      {isSelected && (
                        <div className="absolute top-0.5 right-0.5 w-4 h-4 bg-primary rounded-full flex items-center justify-center">
                          <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="black" strokeWidth="4">
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-xs font-bold text-white/40">Model</label>
                <select
                  value={videoModel}
                  onChange={(e) => setVideoModel(e.target.value)}
                  className="bg-white/5 border border-white/10 rounded-md px-3 py-2 text-sm text-white"
                >
                  {VIDEO_MODEL_OPTIONS.map((m) => (
                    <option key={m.id} value={m.id} className="bg-[#0a0a0a]">
                      {m.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-xs font-bold text-white/40">
                  {videoModel === "fal-kling-v3-pro-i2v"
                    ? "Scene / script (spoken line + action description)"
                    : "Script (what the character says)"}
                </label>
                <textarea
                  value={script}
                  onChange={(e) => setScript(e.target.value)}
                  placeholder="e.g. Hey! I've been using this for two weeks and honestly it changed my morning routine completely..."
                  rows={3}
                  className="bg-white/5 border border-white/10 rounded-md px-3 py-2 text-sm text-white placeholder:text-white/20 resize-none"
                />
              </div>

              <div className="flex flex-wrap gap-4">
                {videoModel === "fal-heygen-avatar4-i2v" && (
                  <div className="flex flex-col gap-2">
                    <label className="text-xs font-bold text-white/40">Voice</label>
                    <select
                      value={voice}
                      onChange={(e) => setVoice(e.target.value)}
                      className="bg-white/5 border border-white/10 rounded-md px-3 py-2 text-sm text-white"
                    >
                      {HEYGEN_VOICES.map((v) => (
                        <option key={v} value={v} className="bg-[#0a0a0a]">
                          {v}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                {videoModel !== "fal-kling-v3-pro-i2v" && (
                  <div className="flex flex-col gap-2">
                    <label className="text-xs font-bold text-white/40">Aspect Ratio</label>
                    <select
                      value={aspectRatio}
                      onChange={(e) => setAspectRatio(e.target.value)}
                      className="bg-white/5 border border-white/10 rounded-md px-3 py-2 text-sm text-white"
                    >
                      {ASPECT_RATIOS.map((ar) => (
                        <option key={ar} value={ar} className="bg-[#0a0a0a]">
                          {ar}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                {videoModel !== "fal-heygen-avatar4-i2v" && (
                  <div className="flex flex-col gap-2 max-w-[160px]">
                    <label className="text-xs font-bold text-white/40">Duration (seconds)</label>
                    <select
                      value={klingDuration}
                      onChange={(e) => setKlingDuration(e.target.value)}
                      className="bg-white/5 border border-white/10 rounded-md px-3 py-2 text-sm text-white"
                    >
                      {(videoModel === "fal-seedance-2-reference-to-video"
                        ? ["auto", ...KLING_DURATIONS]
                        : KLING_DURATIONS
                      ).map((d) => (
                        <option key={d} value={d} className="bg-[#0a0a0a]">
                          {d === "auto" ? "Auto" : `${d}s`}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={handleGenerateVideo}
                disabled={selectedSources.length === 0 || !script.trim() || videoGenerating}
                className="self-start bg-[#22d3ee] text-black px-5 py-2.5 rounded-md font-medium text-sm hover:bg-[#e5ff33] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {videoGenerating ? "Generating talking video…" : "Generate Talking Video"}
              </button>

              {videoResult?.status === "loading" && (
                <div className="flex items-center gap-2 text-xs text-white/40">
                  <div className="w-4 h-4 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
                  HeyGen is generating — this can take a minute or two.
                </div>
              )}
              {videoResult?.status === "error" && (
                <p className="text-xs text-red-400">{videoResult.error}</p>
              )}
              {videoResult?.status === "done" && (
                <div className="max-w-xs">
                  <video src={videoResult.url} controls className="w-full rounded-lg border border-white/10" />
                  <button
                    type="button"
                    onClick={() => downloadImage(videoResult.url, "character-talking-video.mp4")}
                    className="mt-2 w-full text-center text-xs font-semibold text-primary hover:text-white transition-colors"
                  >
                    Download
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
