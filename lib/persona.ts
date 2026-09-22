import persona from "@/data/persona.json";

export type Riddle = { q: string; a: string[]; hint: string };

export const PERSONA = persona as {
  name: string;
  greeting: string;
  personality: string;
  suggestions: string[];
  smallTalk: string[];
  jokes: string[];
  riddles: Riddle[];
};

export function normalize(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function isCorrect(riddle: Riddle, answer: string) {
  const n = normalize(answer);
  return riddle.a.some((a) => n.includes(normalize(a)));
}
