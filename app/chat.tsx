"use client";

import { useEffect, useRef, useState } from "react";
import AvatarPanel from "@/components/avatar/avatar-panel";
import type { ChatMessage, Quiz } from "@/lib/llm";

type Msg = ChatMessage & { id: string };

let seq = 0;
const nextId = () => `m${Date.now()}-${seq++}`;

export default function Chat({
  name,
  greeting,
  suggestions,
}: {
  name: string;
  greeting: string;
  suggestions: string[];
}) {
  const [messages, setMessages] = useState<Msg[]>([
    { id: "greeting", role: "assistant", content: greeting },
  ]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAvatar, setShowAvatar] = useState(true);
  const [quiz, setQuiz] = useState<Quiz>(null);
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, busy]);

  async function send(text: string) {
    const content = text.trim();
    if (!content || busy) return;
    setError(null);
    setInput("");
    const next: Msg[] = [...messages, { id: nextId(), role: "user", content }];
    setMessages(next);
    setBusy(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          messages: next.map(({ role, content }) => ({ role, content })),
          quiz,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { reply: string; quiz: Quiz };
      setQuiz(data.quiz);
      setMessages((m) => [...m, { id: nextId(), role: "assistant", content: data.reply }]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Lỗi không xác định");
    } finally {
      setBusy(false);
    }
  }

  const last = [...messages].reverse().find((m) => m.role === "assistant");

  return (
    <main className="mx-auto flex min-h-screen max-w-6xl flex-col gap-4 p-4 md:flex-row">
      <section className="flex min-h-[70vh] flex-1 flex-col rounded-2xl border border-slate-800 bg-slate-900">
        <header className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
          <div>
            <h1 className="text-sm font-semibold">{name} · bạn chat của bạn</h1>
            <p className="text-xs text-slate-400">
              {quiz ? `Đang chơi đố · ${quiz.score}/${quiz.asked - 1} đúng` : "Tán gẫu · trêu đùa · đố vui"}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowAvatar((v) => !v)}
            className="rounded-full border border-slate-700 px-3 py-1 text-xs text-slate-300 hover:border-emerald-400 md:hidden"
          >
            {showAvatar ? "Ẩn avatar" : "Hiện avatar"}
          </button>
        </header>

        <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
          {messages.map((m) => (
            <div key={m.id} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
              <div
                className={
                  m.role === "user"
                    ? "max-w-[80%] rounded-2xl rounded-br-sm bg-emerald-600 px-3.5 py-2 text-sm"
                    : "max-w-[80%] rounded-2xl rounded-bl-sm bg-slate-800 px-3.5 py-2 text-sm"
                }
              >
                <p className="whitespace-pre-wrap">{m.content}</p>
              </div>
            </div>
          ))}
          {busy && (
            <div className="flex justify-start">
              <div className="rounded-2xl bg-slate-800 px-3.5 py-2 text-sm text-slate-400">
                {name} đang gõ…
              </div>
            </div>
          )}
          {error && <p className="text-xs text-rose-400">Lỗi: {error}</p>}
          <div ref={bottom} />
        </div>

        {(messages.length <= 1 || quiz) && (
          <div className="flex flex-wrap gap-2 px-4 pb-2">
            {(quiz ? ["Gợi ý", "Bỏ qua", "Thôi không chơi nữa"] : suggestions).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => send(s)}
                className="rounded-full border border-slate-700 px-3 py-1 text-xs text-slate-300 hover:border-emerald-400 hover:text-emerald-300"
              >
                {s}
              </button>
            ))}
          </div>
        )}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
          className="flex gap-2 border-t border-slate-800 p-3"
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={quiz ? "Đáp án của bạn…" : "Nhắn gì đó cho Linh…"}
            aria-label="Tin nhắn"
            className="flex-1 rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-emerald-400"
          />
          <button
            type="submit"
            disabled={busy || !input.trim()}
            className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium disabled:opacity-40"
          >
            Gửi
          </button>
        </form>
      </section>

      <aside className={`${showAvatar ? "block" : "hidden"} w-full md:block md:w-80`}>
        <AvatarPanel
          name={name}
          thinking={busy}
          line={last ? { id: last.id, text: last.content } : null}
        />
      </aside>
    </main>
  );
}
