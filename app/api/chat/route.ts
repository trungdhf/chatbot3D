import { NextResponse } from "next/server";
import { chat, type ChatMessage, type Quiz } from "@/lib/llm";
import { PERSONA } from "@/lib/persona";

export const runtime = "nodejs";

function parseQuiz(q: unknown): Quiz {
  if (!q || typeof q !== "object") return null;
  const { index, hints, score, asked } = q as Record<string, unknown>;
  if (
    typeof index !== "number" ||
    !Number.isInteger(index) ||
    index < 0 ||
    index >= PERSONA.riddles.length
  )
    return null;
  const num = (v: unknown) => (typeof v === "number" && v >= 0 ? Math.floor(v) : 0);
  return { index, hints: num(hints), score: num(score), asked: num(asked) };
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as
    | { messages?: ChatMessage[]; quiz?: unknown }
    | null;
  const messages = body?.messages?.filter(
    (m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string",
  );
  if (!messages?.length) {
    return NextResponse.json({ error: "messages required" }, { status: 400 });
  }
  const result = await chat(messages.slice(-20), parseQuiz(body?.quiz));
  return NextResponse.json(result);
}
