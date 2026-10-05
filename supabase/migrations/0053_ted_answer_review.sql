-- ============================================================================
-- 0053_ted_answer_review.sql
-- Lets Guy see how Coach Ted is doing with real members (architect review,
-- 2026-10-05): until now nobody looked at Ted's answers after they were
-- sent, and the 36 eval cases only cover questions written in advance.
--
--   - member_rating: the member's thumbs up/down on an answer. Set only
--     through rate_ted_answer(), which checks the answer is theirs —
--     members still can't update the table directly.
--   - removed_items: phone numbers/links the answer check stripped out
--     (src/lib/coach-ted/answer-check.ts). Written by Ted's pipeline
--     (service role) when it saves the answer; was only a log line before.
--   - owner_reviewed_at: Guy ticks an answer off on /owner/ted-conversations
--     so it leaves his "needs a look" list.
--
-- RLS: reads are unchanged ("coach_ted_conversations: read" — the member
-- or the owner). New "coach_ted_conversations: change" is owner-only, per
-- CLAUDE.md (only Guy edits). No coach access, as before.
-- ============================================================================

alter table coach_ted_conversations
  add column member_rating text check (member_rating in ('up', 'down')),
  add column rated_at timestamptz,
  add column removed_items text[] not null default '{}',
  add column owner_reviewed_at timestamptz;

comment on column coach_ted_conversations.member_rating is
  'The member''s thumbs up/down on this answer (rate_ted_answer). Null = not rated.';
comment on column coach_ted_conversations.removed_items is
  'Phone numbers/links the answer check removed before saving. Non-empty = Ted tried to give an unapproved number or link.';
comment on column coach_ted_conversations.owner_reviewed_at is
  'When Guy marked this answer as looked at on /owner/ted-conversations.';

-- Guy's "needs a look" list: thumbs-down or removed items, not yet reviewed.
create index idx_ted_conversations_needs_review on coach_ted_conversations (created_at desc)
  where owner_reviewed_at is null and (member_rating = 'down' or removed_items <> '{}');

create policy "coach_ted_conversations: change"
  on coach_ted_conversations for update
  to authenticated
  using (
    is_owner()
  )
  with check (
    is_owner()
  );

-- A member rates one of their own answers ('up', 'down', or null to undo).
-- Security definer so it can write the two rating columns without giving
-- members an update policy (which would let them rewrite answers too).
create or replace function rate_ted_answer(p_conversation_id uuid, p_rating text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_rating is not null and p_rating not in ('up', 'down') then
    raise exception 'Invalid rating';
  end if;

  update coach_ted_conversations
  set member_rating = p_rating,
      rated_at = case when p_rating is null then null else now() end
  where id = p_conversation_id
    and member_id = (select auth.uid());
end;
$$;

revoke execute on function rate_ted_answer(uuid, text) from public, anon;
grant execute on function rate_ted_answer(uuid, text) to authenticated;
