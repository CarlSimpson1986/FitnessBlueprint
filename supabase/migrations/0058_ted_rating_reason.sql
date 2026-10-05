-- ============================================================================
-- 0058_ted_rating_reason.sql
-- Optional "What was wrong?" with a Not helpful rating (Carl/Guy
-- walkthrough, 2026-10-05), shown to Guy on /owner/ted-conversations.
--
-- member_rating_reason: up to 300 characters, only kept with a 'down'
-- rating (cleared when the rating changes). Set only through
-- rate_ted_answer(), which now takes the reason too and still only touches
-- the caller's own answers. The 2-argument version from 0053 is replaced
-- (dropped), so there's one function to keep in step.
--
-- No RLS changes: reads stay "coach_ted_conversations: read" (member or
-- owner); members still have no update policy on the table.
-- ============================================================================

alter table coach_ted_conversations
  add column member_rating_reason text check (char_length(member_rating_reason) <= 300);

comment on column coach_ted_conversations.member_rating_reason is
  'What the member said was wrong with a Not helpful answer (optional, rate_ted_answer).';

drop function rate_ted_answer(uuid, text);

create or replace function rate_ted_answer(p_conversation_id uuid, p_rating text, p_reason text default null)
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
      rated_at = case when p_rating is null then null else now() end,
      member_rating_reason = case when p_rating = 'down' then nullif(left(trim(p_reason), 300), '') end
  where id = p_conversation_id
    and member_id = (select auth.uid());
end;
$$;

revoke execute on function rate_ted_answer(uuid, text, text) from public, anon;
grant execute on function rate_ted_answer(uuid, text, text) to authenticated;
