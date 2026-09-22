"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { DEFAULT_AVATAR_URL, detectReaction, type Emotion, type Gesture } from "@/lib/avatar";

const VrmAvatar = dynamic(() => import("./vrm-avatar"), { ssr: false });

const CONTROLS: { label: string; emotion?: Emotion; gesture?: Gesture }[] = [
  { label: "Cười", emotion: "happy" },
  { label: "Vẫy tay", gesture: "wave", emotion: "happy" },
  { label: "Buồn", emotion: "sad" },
  { label: "Suy nghĩ", gesture: "think", emotion: "neutral" },
  { label: "Cúi chào", gesture: "bow", emotion: "relaxed" },
];

export default function AvatarPanel({
  line,
  thinking,
  name,
  modelUrl = DEFAULT_AVATAR_URL,
  lang = "vi-VN",
}: {
  /** Latest assistant message; drives emotion, gesture and speech. */
  line: { id: string; text: string } | null;
  /** While waiting for the bot, the avatar holds the "think" pose. */
  thinking?: boolean;
  name?: string;
  modelUrl?: string;
  lang?: string;
}) {
  const [emotion, setEmotion] = useState<Emotion>("neutral");
  const [gesture, setGesture] = useState<Gesture>("none");
  const [gestureKey, setGestureKey] = useState(0);
  const [mouth, setMouth] = useState(0);
  const [voice, setVoice] = useState(false);
  const mouthRaf = useRef(0);

  function trigger(e?: Emotion, g?: Gesture) {
    if (e) setEmotion(e);
    if (g) {
      setGesture(g);
      setGestureKey((k) => k + 1);
    }
  }

  useEffect(() => {
    if (thinking) trigger("neutral", "think");
  }, [thinking]);

  const lineId = line?.id;
  const lineText = line?.text;

  useEffect(() => {
    if (!lineText) return;
    const r = detectReaction(lineText);
    trigger(r.emotion, r.gesture);
    const reset = setTimeout(() => setEmotion("neutral"), 6000);
    return () => clearTimeout(reset);
  }, [lineId, lineText]);

  useEffect(() => {
    if (!lineText || !voice || typeof speechSynthesis === "undefined") return;
    const u = new SpeechSynthesisUtterance(lineText.replace(/[*_`#>]/g, ""));
    u.lang = lang;
    u.rate = 1.05;
    const v = speechSynthesis.getVoices().find((x) => x.lang.startsWith(lang.slice(0, 2)));
    if (v) u.voice = v;

    // No audio analyser for SpeechSynthesis, so fake syllable openness while speaking.
    const animate = () => {
      const t = performance.now() / 1000;
      setMouth(0.35 + 0.35 * Math.abs(Math.sin(t * 11)) * (0.6 + 0.4 * Math.sin(t * 3.7)));
      mouthRaf.current = requestAnimationFrame(animate);
    };
    const stop = () => {
      cancelAnimationFrame(mouthRaf.current);
      setMouth(0);
    };
    u.onstart = () => {
      mouthRaf.current = requestAnimationFrame(animate);
    };
    u.onend = stop;
    u.onerror = stop;
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
    return () => {
      speechSynthesis.cancel();
      stop();
    };
  }, [lineId, lineText, voice, lang]);

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-700 bg-slate-900">
      <div className="relative aspect-[3/4] w-full bg-gradient-to-b from-slate-800 to-slate-900">
        <VrmAvatar
          url={modelUrl}
          emotion={emotion}
          gesture={gesture}
          gestureKey={gestureKey}
          mouth={mouth}
          className="h-full w-full"
        />
        {name && (
          <span className="absolute left-3 top-3 rounded-full bg-black/60 px-2.5 py-1 text-xs text-emerald-300">
            {name}
          </span>
        )}
        <button
          type="button"
          onClick={() => setVoice((v) => !v)}
          aria-pressed={voice}
          title="Đọc câu trả lời bằng giọng trình duyệt"
          className="absolute right-3 top-3 rounded-full bg-black/60 px-2.5 py-1 text-xs text-slate-300 hover:text-white"
        >
          {voice ? "🔊 Giọng ON" : "🔇 Giọng OFF"}
        </button>
      </div>
      <div className="flex flex-wrap gap-1.5 p-3">
        {CONTROLS.map((c) => (
          <button
            key={c.label}
            type="button"
            onClick={() => trigger(c.emotion, c.gesture)}
            className="rounded-full border border-slate-700 px-2.5 py-1 text-xs text-slate-300 hover:border-emerald-400 hover:text-emerald-300"
          >
            {c.label}
          </button>
        ))}
      </div>
    </div>
  );
}
