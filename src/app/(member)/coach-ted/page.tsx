import { requireProfile } from "@/lib/auth";
import { TedChat } from "./TedChat";

const HISTORY_LIMIT = 20;

export default async function CoachTedPage() {
  const { supabase, user } = await requireProfile();

  const { data: conversations } = await supabase
    .from("coach_ted_conversations")
    .select("id, question, answer, created_at")
    .eq("member_id", user.id)
    .order("created_at", { ascending: false })
    .limit(HISTORY_LIMIT);

  const initialMessages = (conversations ?? [])
    .slice()
    .reverse()
    .map((c) => ({ id: c.id, question: c.question, answer: c.answer }));

  return (
    <main className="min-h-screen px-5 py-8">
      <p className="fb-eyebrow mb-1">Fitness Blueprint</p>
      <h1 className="text-2xl font-semibold text-blueprint-ink mb-6">Coach Ted</h1>
      <TedChat initialMessages={initialMessages} />
    </main>
  );
}
