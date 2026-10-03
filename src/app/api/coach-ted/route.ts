import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { streamTedAnswer } from "@/lib/coach-ted/claude";
import { embedText } from "@/lib/coach-ted/gemini";
import { searchPubMed } from "@/lib/coach-ted/pubmed";
import { OWNER_ANSWER_THRESHOLD } from "@/lib/coach-ted/cache";
import { buildMemberProfile, recentTedTurns } from "@/lib/coach-ted/member-context";

// Shown to members; the limit itself is enforced in claim_ted_question() (0039).
const DAILY_QUESTION_LIMIT = 20;


/**
 * Coach Ted's pipeline. Every answer is written fresh for the member
 * asking, from:
 *   - their own profile and recent chat with Ted (member-context.ts),
 *   - Guy's written answers to similar questions (/admin/ted-answers),
 *   - the knowledge base and a PubMed search.
 * Answers aren't shared between members any more (2026-09-25): a reply
 * built around one member's goals and numbers is wrong for anyone else.
 *
 * Auth, rate limiting and the member's own data use the RLS-respecting
 * server client (a member can only ever see their own rows). Guy's
 * answers, the knowledge base and the conversation write use the admin
 * client, per the access model documented in
 * supabase/migrations/0003_coach_ted_vectors.sql and SECURITY.md —
 * members have no direct table access to those.
 */
export async function POST(request: Request) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  // Ted is built on their health info, so he needs their consent (0043).
  const { data: consentRow } = await supabase.from("profiles").select("health_consent").eq("id", user.id).maybeSingle();
  if (!consentRow?.health_consent) {
    return NextResponse.json({ error: "Turn on health tracking to use Coach Ted." }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const question: unknown = body?.question;
  if (typeof question !== "string" || question.trim().length === 0) {
    return NextResponse.json({ error: "Missing question" }, { status: 400 });
  }
  if (question.length > 1000) {
    return NextResponse.json({ error: "Question is too long" }, { status: 400 });
  }

  // --- Rate limit (0039) ----------------------------------------------------
  // Claims a slot before anything is generated, atomically, so questions
  // fired in parallel can't all slip under the limit. The limits (20 per
  // member, 300 gym-wide, per rolling 24h) live in the database function.
  const { data: claim, error: claimError } = await supabase.rpc("claim_ted_question");
  if (claimError) {
    console.error("Coach Ted: claiming a question slot failed:", claimError);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
  if (claim === "member_limit") {
    return NextResponse.json(
      { error: `Coach Ted has a daily limit of ${DAILY_QUESTION_LIMIT} questions per member. Try again tomorrow, or ask your coach directly.` },
      { status: 429 }
    );
  }
  if (claim === "gym_limit") {
    console.error("Coach Ted: gym-wide daily limit reached");
    return NextResponse.json(
      { error: "Coach Ted is taking a breather — he's answered a lot today. Try again tomorrow, or ask your coach directly." },
      { status: 429 }
    );
  }
  if (claim !== "ok") {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const admin = createAdminClient();
  const started = Date.now();
  const timings: Record<string, number> = {};
  const mark = (name: string) => {
    timings[name] = Date.now() - started;
  };

  // A reply to Ted's follow-up question ("about 80kg") means nothing on
  // its own, so searches use the question it answers as well.
  const history = await recentTedTurns(supabase, user.id);
  const lastTurn = history[history.length - 1];
  const searchText = lastTurn ? `${lastTurn.question}
${question}` : question;

  // PubMed and the member's profile don't depend on the embedding, so
  // start them now in parallel.
  const pubmedPromise = searchPubMed(searchText, 5).catch((err) => {
    console.error("PubMed search failed:", err);
    return [];
  });
  const profilePromise = buildMemberProfile(supabase, user.id).catch((err) => {
    console.error("Coach Ted: building the member profile failed:", err);
    return "";
  });

  const questionEmbedding = await embedText(searchText);
  mark("embed");

  const [pubmedResults, kbMatches, ownerMatches, memberProfile] = await Promise.all([
    pubmedPromise,
    admin
      .rpc("match_knowledge_base", { query_embedding: questionEmbedding, match_count: 5 })
      .then((r) => r.data ?? []),
    // match_qa_cache skips answers Guy has hidden (is_flagged).
    admin
      .rpc("match_qa_cache", {
        query_embedding: questionEmbedding,
        match_threshold: OWNER_ANSWER_THRESHOLD,
        match_count: 2,
      })
      .then((r) => r.data ?? []),
    profilePromise,
  ]);
  mark("context");

  const context = {
    memberProfile,
    history,
    ownerAnswers: ownerMatches.map((m: { question: string; answer: string }) => ({
      question: m.question,
      answer: m.answer,
    })),
    pubmedSources: pubmedResults.map((a) => ({
      title: a.title,
      url: a.url,
      snippet: `${a.journal}, ${a.pubDate}`,
    })),
    knowledgeBase: kbMatches.map((k: { category: string; content: string }) => ({
      category: k.category,
      content: k.content,
    })),
  };

  // Streamed as plain text so the answer appears as it's written. The
  // conversation is saved once it's finished — the function stays alive
  // until the stream closes.
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let answer = "";
      let model = "";
      try {
        for await (const chunk of streamTedAnswer(question, context, (m) => (model = m))) {
          if (!timings.firstToken) mark("firstToken");
          answer += chunk;
          controller.enqueue(encoder.encode(chunk));
        }
      } catch (err) {
        console.error("Coach Ted generation failed:", err);
        controller.enqueue(encoder.encode((answer ? "\n\n" : "") + "Sorry — I lost my train of thought. Please try again."));
        controller.close();
        return;
      }
      mark("done");
      console.log("coach-ted timings", timings, { model, pubmed: pubmedResults.length, kb: kbMatches.length });

      if (answer.trim()) {
        const { error: saveError } = await admin.from("coach_ted_conversations").insert({
          member_id: user.id,
          question,
          answer,
          was_served_from_cache: false,
        });
        if (saveError) console.error("Coach Ted: saving the conversation failed:", saveError);
      }
      controller.close();
    },
  });

  return new Response(stream, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
