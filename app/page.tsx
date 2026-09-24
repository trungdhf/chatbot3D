import { PERSONA } from "@/lib/persona";
import Chat from "./chat";

/** `?model=real` picks `public/avatars/<name>.vrm`; omit for the default model. */
export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ model?: string }>;
}) {
  const { model } = await searchParams;
  const modelUrl = model && /^[\w-]+$/.test(model) ? `/avatars/${model}.vrm` : undefined;
  return (
    <Chat
      name={PERSONA.name}
      greeting={PERSONA.greeting}
      suggestions={PERSONA.suggestions}
      modelUrl={modelUrl}
    />
  );
}
