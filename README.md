# chatbot3D

Chatbot "bạn thân" với avatar 3D (VRM): tán gẫu, trêu đùa, chơi đố vui. Next.js 15 + Three.js + `@pixiv/three-vrm`.

## Chạy

```bash
npm install
cp .env.example .env.local   # tuỳ chọn: điền GEMINI_API_KEY để tán gẫu bằng LLM
npm run dev                  # http://localhost:3000
```

Không có `GEMINI_API_KEY` app vẫn chạy: đố vui / chuyện cười / trêu đùa dùng luật trong `lib/llm.ts`, tán gẫu dùng câu mẫu trong `data/persona.json`.

## Cấu trúc

- `app/chat.tsx` — UI chat + trạng thái đố (`quiz`) giữ ở client, gửi kèm mỗi request.
- `app/api/chat/route.ts` → `lib/llm.ts` — luật đố/đùa (offline) rồi mới tới Gemini cho tán gẫu.
- `data/persona.json` — tên, tính cách, câu gợi ý, câu đùa, **câu đố** (`q`, `a[]` các đáp án chấp nhận, `hint`). Thêm câu đố ở đây.
- `components/avatar/` — render VRM, 5 động tác (cười, vẫy tay, buồn, suy nghĩ, cúi chào), tự phản ứng theo nội dung trả lời (`lib/avatar.ts`), đọc giọng bằng Web Speech API + lip-sync giả lập.

## Avatar

- Model mặc định: `public/avatars/lydia.vrm` — "Lydia" của Polygonal Mind (100Avatars), **CC0**, VRM 0.x, chỉ có blendshape miệng/chớp mắt nên cảm xúc thể hiện qua đầu/thân.
- Thay model: bỏ file `.vrm` khác vào `public/avatars/` và đổi `DEFAULT_AVATAR_URL` trong `lib/avatar.ts` (hoặc truyền `modelUrl` cho `AvatarPanel`). Model VRoid Studio có đủ biểu cảm happy/sad/… sẽ đẹp hơn.

## Kiểm tra

```bash
npm run typecheck && npm run lint && npm run build
```
