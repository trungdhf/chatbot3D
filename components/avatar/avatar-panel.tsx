"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import {
  DEFAULT_AVATAR_URL,
  MOUTH_CLOSED,
  detectReaction,
  wordVisemes,
  type Emotion,
  type Gesture,
  type Reaction,
  type Viseme,
  type Visemes,
} from "@/lib/avatar";

/** Estimated speaking time per vowel at rate ~1 (ms). */
const MS_PER_VOWEL = 150;
const MS_PER_WORD_MIN = 180;

function mix(v: Viseme, amount: number): Visemes {
  return { ...MOUTH_CLOSED, [v]: amount };
}

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
  /** Latest assistant message; drives emotion, gesture and speech. Falls back to keyword detection without `reaction`. */
  line: { id: string; text: string; reaction?: Reaction } | null;
  /** While waiting for the bot, the avatar holds the "think" pose. */
  thinking?: boolean;
  name?: string;
  modelUrl?: string;
  lang?: string;
}) {
  const [emotion, setEmotion] = useState<Emotion>("neutral");
  const [gesture, setGesture] = useState<Gesture>("none");
  const [gestureKey, setGestureKey] = useState(0);
  const [mouth, setMouth] = useState<Visemes>(MOUTH_CLOSED);
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
  const lineReaction = line?.reaction;

  useEffect(() => {
    if (!lineText) return;
    const r = lineReaction ?? detectReaction(lineText);
    trigger(r.emotion, r.gesture);
    const reset = setTimeout(() => setEmotion("neutral"), 6000);
    return () => clearTimeout(reset);
  }, [lineId, lineText, lineReaction]);

  useEffect(() => {
    if (!lineText || !voice || typeof speechSynthesis === "undefined") return;
    const u = new SpeechSynthesisUtterance(lineText.replace(/[*_`#>]/g, ""));
    u.lang = lang;
    u.rate = 1.05;
    const v = speechSynthesis.getVoices().find((x) => x.lang.startsWith(lang.slice(0, 2)));
    if (v) u.voice = v;

    // SpeechSynthesis exposes no audio, so sync on word boundaries: each spoken word plays
    // its vowel shapes in order, then the mouth closes until the next boundary fires.
    let word: { visemes: Viseme[]; start: number; duration: number } | null = null;
    let gotBoundary = false;
    let started = 0;
    const animate = () => {
      const now = performance.now();
      if (word) {
        const p = (now - word.start) / word.duration;
        if (p < 1) {
          const i = Math.min(word.visemes.length - 1, Math.floor(p * word.visemes.length));
          const local = (p * word.visemes.length) % 1;
          setMouth(mix(word.visemes[i], 0.45 + 0.55 * Math.sin(Math.PI * local)));
        } else {
          word = null;
          setMouth(MOUTH_CLOSED);
        }
      } else if (!gotBoundary && now - started > 400) {
        // Voice without boundary events: fall back to a generic syllable rhythm.
        const t = now / 1000;
        setMouth(mix("aa", 0.3 + 0.4 * Math.abs(Math.sin(t * 11))));
      }
      mouthRaf.current = requestAnimationFrame(animate);
    };
    const stop = () => {
      cancelAnimationFrame(mouthRaf.current);
      setMouth(MOUTH_CLOSED);
    };
    u.onstart = () => {
      started = performance.now();
      mouthRaf.current = requestAnimationFrame(animate);
    };
    u.onboundary = (ev) => {
      if (ev.name !== "word") return;
      gotBoundary = true;
      const len = ev.charLength || u.text.slice(ev.charIndex).search(/\s|$/);
      const visemes = wordVisemes(u.text.slice(ev.charIndex, ev.charIndex + len));
      word = {
        visemes,
        start: performance.now(),
        duration: Math.max(MS_PER_WORD_MIN, (visemes.length * MS_PER_VOWEL) / u.rate),
      };
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
