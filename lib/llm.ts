import { GoogleGenerativeAI } from "@google/generative-ai";
import { PERSONA, isCorrect, normalize } from "./persona";

export type ChatMessage = { role: "user" | "assistant"; content: string };

/** Active riddle: index into PERSONA.riddles plus how many hints were given. */
export type Quiz = { index: number; hints: number; score: number; asked: number } | null;

export type ChatResult = { reply: string; provider: "gemini" | "mock"; quiz: Quiz };

const pick = <T,>(xs: T[]) => xs[Math.floor(Math.random() * xs.length)];

const WANT_QUIZ = /(do minh|do toi|do di|cau do|choi do|hoi do|do tiep|cau khac|cau nua|quiz|riddle)/;
const WANT_HINT = /(goi y|hint|bi roi|chiu|khong biet|ko biet|k biet)/;
const GIVE_UP = /(bo qua|dap an|thua|skip|chiu thua|dau hang)/;
const WANT_JOKE = /(chuyen cuoi|ke chuyen|joke|hai huoc|cho cuoi)/;
const WANT_TEASE = /(treu|choc|tease)/;
const STOP_QUIZ = /(thoi|dung choi|ngung|khong choi|het do|stop)/;

function startRiddle(prev: Quiz): { reply: string; quiz: Quiz } {
  const used = prev?.index ?? -1;
  let index = Math.floor(Math.random() * PERSONA.riddles.length);
  if (PERSONA.riddles.length > 1 && index === used) index = (index + 1) % PERSONA.riddles.length;
  const quiz: Quiz = { index, hints: 0, score: prev?.score ?? 0, asked: (prev?.asked ?? 0) + 1 };
  return { reply: `Câu ${quiz.asked} nè: ${PERSONA.riddles[index].q}`, quiz };
}

/** Deterministic quiz/joke/small-talk engine; also the offline fallback. */
function rules(text: string, quiz: Quiz): { reply: string; quiz: Quiz } | null {
  const n = normalize(text);

  if (quiz) {
    const r = PERSONA.riddles[quiz.index];
    if (STOP_QUIZ.test(n)) {
      const done = quiz.asked - 1;
      return {
        reply:
          done === 0
            ? "OK, nghỉ đố nhé. Chưa trả lời câu nào mà đã chạy rồi 😏"
            : `OK, nghỉ đố nhé. Bạn được ${quiz.score}/${done} câu. ${quiz.score >= done / 2 ? "Không tệ đâu 😎" : "Lần sau gỡ lại nha 😏"}`,
        quiz: null,
      };
    }
    if (WANT_QUIZ.test(n)) return startRiddle(quiz);
    if (GIVE_UP.test(n)) {
      const next = startRiddle(quiz);
      return { reply: `Đáp án là "${r.a[0]}" đó! Dễ mà, bạn bí thật à? 😆 ${next.reply}`, quiz: next.quiz };
    }
    if (WANT_HINT.test(n)) {
      return {
        reply: quiz.hints === 0 ? `Gợi ý nè: ${r.hint}` : `Gợi ý lần nữa thôi nha: ${r.hint} Bí nữa thì nói "bỏ qua".`,
        quiz: { ...quiz, hints: quiz.hints + 1 },
      };
    }
    if (isCorrect(r, text)) {
      const next = startRiddle({ ...quiz, score: quiz.score + 1 });
      return {
        reply: `${pick(["Đúng rồi! Giỏi quá 👏", "Chuẩn luôn! Không ngờ bạn thông minh vậy 😏", "Wow, đúng rồi đó!"])} ${next.reply}`,
        quiz: next.quiz,
      };
    }
    return {
      reply: pick([
        "Sai rồi nha 😜 Thử lại đi, hoặc nói 'gợi ý' nếu bí.",
        "Hụt! Gần đúng… mà vẫn sai 😆 Thử lại nào.",
        "Chưa đúng đâu. Suy nghĩ kỹ chút nữa xem, mình tin bạn 😉",
      ]),
      quiz,
    };
  }

  if (WANT_QUIZ.test(n)) return startRiddle(null);
  if (WANT_JOKE.test(n)) return { reply: pick(PERSONA.jokes), quiz: null };
  if (WANT_TEASE.test(n)) {
    return {
      reply: pick([
        "Trêu bạn hả? Thôi, mình sợ bạn dỗi rồi lại đòi mình dỗ 😏",
        "Người gõ chữ chậm như bạn mà đòi được trêu à? Đùa thôi, bạn dễ thương mà 😆",
      ]),
      quiz: null,
    };
  }
  return null;
}

const SYSTEM_PROMPT = `Bạn là ${PERSONA.name}. ${PERSONA.personality}
Trả lời ngắn (1–3 câu), tự nhiên như tin nhắn bạn bè, bằng ngôn ngữ của người dùng (mặc định tiếng Việt).
Nếu người dùng muốn chơi đố, hãy bảo họ nói "đố mình đi" để bắt đầu.`;

export async function chat(history: ChatMessage[], quiz: Quiz): Promise<ChatResult> {
  const last = history.at(-1);
  if (!last || last.role !== "user") throw new Error("last message must be from user");

  const ruled = rules(last.content, quiz);
  if (ruled) return { ...ruled, provider: "mock" };

  const key = process.env.GEMINI_API_KEY;
  if (!key) return { reply: pick(PERSONA.smallTalk), provider: "mock", quiz };

  try {
    const model = new GoogleGenerativeAI(key).getGenerativeModel({
      model: process.env.GEMINI_MODEL ?? "gemini-2.5-flash",
      systemInstruction: SYSTEM_PROMPT,
    });
    const prior = history.slice(0, -1);
    // Gemini requires history to start with a user turn.
    const firstUser = prior.findIndex((m) => m.role === "user");
    const session = model.startChat({
      history: (firstUser < 0 ? [] : prior.slice(firstUser)).map((m) => ({
        role: m.role === "user" ? "user" : "model",
        parts: [{ text: m.content }],
      })),
    });
    const res = await session.sendMessage(last.content);
    return { reply: res.response.text().trim(), provider: "gemini", quiz };
  } catch (e) {
    console.error("Gemini failed, falling back to mock", e);
    return { reply: pick(PERSONA.smallTalk), provider: "mock", quiz };
  }
}
