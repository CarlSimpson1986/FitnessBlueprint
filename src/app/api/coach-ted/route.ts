import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { streamTedAnswer } from "@/lib/coach-ted/claude";
import { embedText } from "@/lib/coach-ted/gemini";
import { searchPubMed } from "@/lib/coach-ted/pubmed";
import { CACHE_SIMILARITY_THRESHOLD } from "@/lib/coach-ted/cache";

const DAILY_QUESTION_LIMIT = 20;


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
  const started = Date.now();
  const timings: Record<string, number> = {};
  const mark = (name: string) => {
    timings[name] = Date.now() - started;
  };

  // PubMed doesn't depend on the embedding, so start it now in parallel.
  // On a cache hit it's simply unused (it's free and time-boxed).
  const pubmedPromise = searchPubMed(question, 5).catch((err) => {
    console.error("PubMed search failed:", err);
    return [];
  });

  const questionEmbedding = await embedText(question);
  mark("embed");

  // --- Tier 1: cache lookup ------------------------------------------------
  const { data: cacheMatches, error: cacheError } = await admin.rpc(
    "match_qa_cache",
    {
      query_embedding: questionEmbedding,
      match_threshold: CACHE_SIMILARITY_THRESHOLD,
      match_count: 1,
    }
  );
  mark("cache");

  if (cacheError) {
    console.error("Q&A cache lookup failed:", cacheError);
    // Not fatal — fall through to the full pipeline rather than failing
    // the request over a degraded cache.
  }

  const cacheHit = cacheMatches?.[0];

  if (cacheHit) {
    await Promise.all([
      // Was hit_count: 1 on every hit, so the counter never went past 1.
      admin
        .from("coach_ted_qa_cache")
        .select("hit_count")
        .eq("id", cacheHit.id)
        .single()
        .then(({ data }) =>
          admin
            .from("coach_ted_qa_cache")
            .update({ hit_count: (data?.hit_count ?? 0) + 1, last_served_at: new Date().toISOString() })
            .eq("id", cacheHit.id)
        ),
      admin.from("coach_ted_conversations").insert({
        member_id: user.id,
        question,
        answer: cacheHit.answer,
        matched_qa_cache_id: cacheHit.id,
        was_served_from_cache: true,
      }),
    ]);

    console.log("coach-ted timings (cache hit)", timings);
    return new Response(cacheHit.answer, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }

  // --- Tier 2: fresh pipeline — PubMed + knowledge base + Gemini ----------
  const [pubmedResults, kbMatches] = await Promise.all([
    pubmedPromise,
    admin
      .rpc("match_knowledge_base", { query_embedding: questionEmbedding, match_count: 5 })
      .then((r) => r.data ?? []),
  ]);
  mark("context");

  const context = {
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
  // cache + conversation writes (Tier 3) happen once it's finished — the
  // function stays alive until the stream closes.
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

      // --- Tier 3: cache the new answer for next time ---------------------
      if (answer.trim()) {
        const { data: newCacheRow, error: cacheInsertError } = await admin
          .from("coach_ted_qa_cache")
          .insert({
            question,
            question_embedding: questionEmbedding,
            answer,
            sources: pubmedResults.map((a) => ({ title: a.title, url: a.url })),
          })
          .select("id")
          .single();
        if (cacheInsertError) console.error("Coach Ted: caching the answer failed:", cacheInsertError);

        await admin.from("coach_ted_conversations").insert({
          member_id: user.id,
          question,
          answer,
          matched_qa_cache_id: newCacheRow?.id ?? null,
          was_served_from_cache: false,
        });
      }
      controller.close();
    },
  });

  return new Response(stream, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
