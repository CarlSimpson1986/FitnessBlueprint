"use server";

import { requireOwner } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { embedText } from "@/lib/coach-ted/gemini";

export type ActionResult = { error?: string };

/*
 * Owner curation of Coach Ted's answer cache (coach_ted_qa_cache).
 * Edits, pins, hides, adds and deletes go through the owner's
 * RLS-respecting client — "owner moderates qa cache" (0003), "owner adds
 * qa cache answers" / "owner deletes qa cache answers" (0029). Only the
 * similarity tester uses the admin client: match_qa_cache is granted to
 * service_role alone (0003), as the one sanctioned door into the cache.
 */

export async function updateTedAnswer(id: string, answer: string): Promise<ActionResult> {
  const { supabase } = await requireOwner();
  if (!answer.trim()) return { error: "The answer can't be empty." };
  const { error } = await supabase.from("coach_ted_qa_cache").update({ answer: answer.trim() }).eq("id", id);
  return error ? { error: error.message } : {};
}

export async function setTedAnswerFlags(
  id: string,
  flags: { is_pinned?: boolean; is_flagged?: boolean }
): Promise<ActionResult> {
  const { supabase } = await requireOwner();
  const { error } = await supabase.from("coach_ted_qa_cache").update(flags).eq("id", id);
  return error ? { error: error.message } : {};
}

export async function deleteTedAnswer(id: string): Promise<ActionResult> {
  const { supabase } = await requireOwner();
  const { error } = await supabase.from("coach_ted_qa_cache").delete().eq("id", id);
  return error ? { error: error.message } : {};
}

/** Guy's own answer: pinned, and served for any similar question from now on. */
export async function addTedAnswer(question: string, answer: string): Promise<ActionResult> {
  const { supabase } = await requireOwner();
  if (!question.trim() || !answer.trim()) return { error: "Add both a question and an answer." };

  const embedding = await embedText(question.trim());
  const { error } = await supabase.from("coach_ted_qa_cache").insert({
    question: question.trim(),
    question_embedding: embedding,
    answer: answer.trim(),
    is_pinned: true,
  });
  return error ? { error: error.message } : {};
}

export type SimilarityMatch = { question: string; similarity: number };

/** The closest saved questions to `question`, with similarity scores. */
export async function testTedQuestion(
  question: string
): Promise<{ matches?: SimilarityMatch[]; error?: string }> {
  await requireOwner();
  if (!question.trim()) return { error: "Type a question to test." };

  const embedding = await embedText(question.trim());
  const { data, error } = await createAdminClient().rpc("match_qa_cache", {
    query_embedding: embedding,
    match_threshold: -1,
    match_count: 5,
  });
  if (error) return { error: error.message };
  return {
    matches: (data ?? []).map((m: { question: string; similarity: number }) => ({
      question: m.question,
      similarity: m.similarity,
    })),
  };
}
