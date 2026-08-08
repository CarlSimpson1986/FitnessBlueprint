import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { embedText, generateTedAnswer } from "@/lib/coach-ted/gemini";
import { searchPubMed } from "@/lib/coach-ted/pubmed";

const DAILY_QUESTION_LIMIT = 20;
const CACHE_SIMILARITY_THRESHOLD = 0.85;

/**
 * Coach Ted's pipeline. Three tiers, cheapest first:
 *   1. Strong match in the Q&A cache → serve instantly, no API calls.
 *   2. No match → PubMed + knowledge base search, then Gemini synthesis.
 *   3. New answer gets cached for next time.
 *
 * Auth + rate limiting use the RLS-respecting server client (a member
 * can only ever count/see their own conversations, so this is safe).
 * The actual knowledge base / cache reads and writes use the admin
 * client, per the access model documented in
 * supabase/migrations/0003_coach_ted_vectors.sql and SECURITY.md —
 * members have no direct table access to either.
 */
export async function POST(request: Request) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const { question } = await request.json();
  if (typeof question !== "string" || question.trim().length === 0) {
    return NextResponse.json({ error: "Missing question" }, { status: 400 });
  }
  if (question.length > 1000) {
    return NextResponse.json({ error: "Question is too long" }, { status: 400 });
  }

  // --- Rate limit: 20 questions per member per rolling 24h ---------------
  // RLS-scoped client — this can only ever count the signed-in member's
  // own rows, so there's no need for the admin client here.
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count, error: countError } = await supabase
    .from("coach_ted_conversations")
    .select("id", { count: "exact", head: true })
    .eq("member_id", user.id)
    .gte("created_at", since);

  if (countError) {
    console.error("Rate limit check failed:", countError);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
  if ((count ?? 0) >= DAILY_QUESTION_LIMIT) {
    return NextResponse.json(
      { error: `Coach Ted has a daily limit of ${DAILY_QUESTION_LIMIT} questions per member. Try again tomorrow, or ask your coach directly.` },
      { status: 429 }
    );
  }

  const admin = createAdminClient();
  const questionEmbedding = await embedText(question);

  // --- Tier 1: cache lookup ------------------------------------------------
  const { data: cacheMatches, error: cacheError } = await admin.rpc(
    "match_qa_cache",
    {
      query_embedding: questionEmbedding,
      match_threshold: CACHE_SIMILARITY_THRESHOLD,
      match_count: 1,
    }
  );

  if (cacheError) {
    console.error("Q&A cache lookup failed:", cacheError);
    // Not fatal — fall through to the full pipeline rather than failing
    // the request over a degraded cache.
  }

  const cacheHit = cacheMatches?.[0];

  if (cacheHit) {
    await Promise.all([
      admin
        .from("coach_ted_qa_cache")
        .update({ hit_count: 1, last_served_at: new Date().toISOString() })
        .eq("id", cacheHit.id),
      admin.from("coach_ted_conversations").insert({
        member_id: user.id,
        question,
        answer: cacheHit.answer,
        matched_qa_cache_id: cacheHit.id,
        was_served_from_cache: true,
      }),
    ]);

    return NextResponse.json({ answer: cacheHit.answer, cached: true });
  }

  // --- Tier 2: fresh pipeline — PubMed + knowledge base + Gemini ----------
  const [pubmedResults, kbMatches] = await Promise.all([
    searchPubMed(question, 5),
    admin
      .rpc("match_knowledge_base", { query_embedding: questionEmbedding, match_count: 5 })
      .then((r) => r.data ?? []),
  ]);

  const answer = await generateTedAnswer(question, {
    pubmedSources: pubmedResults.map((a) => ({
      title: a.title,
      url: a.url,
      snippet: `${a.journal}, ${a.pubDate}`,
    })),
    knowledgeBase: kbMatches.map((k: { category: string; content: string }) => ({
      category: k.category,
      content: k.content,
    })),
  });

  // --- Tier 3: cache the new answer for next time -------------------------
  const { data: newCacheRow } = await admin
    .from("coach_ted_qa_cache")
    .insert({
      question,
      question_embedding: questionEmbedding,
      answer,
      sources: pubmedResults.map((a) => ({ title: a.title, url: a.url })),
    })
    .select("id")
    .single();

  await admin.from("coach_ted_conversations").insert({
    member_id: user.id,
    question,
    answer,
    matched_qa_cache_id: newCacheRow?.id ?? null,
    was_served_from_cache: false,
  });

  return NextResponse.json({ answer, cached: false });
}
