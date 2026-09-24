export type Emotion = "neutral" | "happy" | "sad" | "angry" | "surprised" | "relaxed";
export type Gesture = "none" | "wave" | "bow" | "think";

export type Reaction = { emotion: Emotion; gesture: Gesture };

/** VRM mouth shapes. */
export const VISEMES = ["aa", "ih", "ou", "ee", "oh"] as const;
export type Viseme = (typeof VISEMES)[number];
export type Visemes = Record<Viseme, number>;
export const MOUTH_CLOSED: Visemes = { aa: 0, ih: 0, ou: 0, ee: 0, oh: 0 };

const VOWEL_VISEME: Record<string, Viseme> = {
  a: "aa", ă: "aa", â: "aa",
  i: "ih", y: "ih",
  u: "ou", ư: "ou",
  e: "ee", ê: "ee",
  o: "oh", ô: "oh", ơ: "oh",
};

/** Vowel sequence of a word (Vietnamese/Latin), used to time mouth shapes while it is spoken. */
export function wordVisemes(word: string): Viseme[] {
  const base = word.toLowerCase().normalize("NFD").replace(/[\u0300-\u0303\u0309\u0323]/g, "").normalize("NFC");
  const out: Viseme[] = [];
  for (const ch of base) {
    const v = VOWEL_VISEME[ch];
    if (v && out[out.length - 1] !== v) out.push(v);
  }
  return out.length ? out : ["aa"];
}

const EMOTION_RULES: [RegExp, Emotion][] = [
  [/(sai rồi|hụt|chưa đúng|buồn|xin lỗi|tiếc|hic|😢|😭|sorry|ごめん|残念)/i, "sad"],
  [/(wow|thật sao|bất ngờ|không ngờ|hả\?|really\?|😲|まさか|えっ)/i, "surprised"],
  [/(đúng rồi|chuẩn|giỏi|haha|hihi|vui|dễ thương|😄|😆|😏|😜|👏|thank|嬉し|ありがと)/i, "happy"],
  [/(yên tâm|đừng lo|thoải mái|mình ở đây|relax|安心)/i, "relaxed"],
];

const GESTURE_RULES: [RegExp, Gesture][] = [
  [/(chào bạn|xin chào|hello|hi there|tạm biệt|bye|こんにちは|またね)/i, "wave"],
  [/(cảm ơn|xin lỗi|thank|sorry|ありがと|申し訳)/i, "bow"],
  [/(câu \d+ nè|đố|gợi ý|hmm|để mình nghĩ|let me think|うーん|考え)/i, "think"],
];

/** Keyword heuristic so the avatar reacts without an extra LLM call. */
export function detectReaction(text: string): Reaction {
  let emotion: Emotion = "neutral";
  let gesture: Gesture = "none";
  for (const [re, e] of EMOTION_RULES) if (re.test(text)) { emotion = e; break; }
  for (const [re, g] of GESTURE_RULES) if (re.test(text)) { gesture = g; break; }
  return { emotion, gesture };
}

/** Default model; replace with your own VRM (VRoid Studio export) in public/avatars/. */
export const DEFAULT_AVATAR_URL = "/avatars/sample.vrm";
