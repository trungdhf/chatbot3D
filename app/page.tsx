import { PERSONA } from "@/lib/persona";
import Chat from "./chat";

export default function Home() {
  return (
    <Chat name={PERSONA.name} greeting={PERSONA.greeting} suggestions={PERSONA.suggestions} />
  );
}
