-- ============================================================================
-- 0047_session_notes.sql
-- Coach notes after a session (spec, "Today": tap tags like "progressed
-- deadlift" / "shoulder still restricted" or type a short note; shown on
-- the roster next time). session_notes has existed since 0001 but never
-- had a screen; this sets its rules before one ships.
--
--   - One note per member per session (the coach edits it, not stacks
--     them). The table was never written to, so the unique index is safe.
--   - Written by the coach taking the session (with their Today switch on)
--     or the owner — the second thing coaches can write after attendance
--     (Carl's call 2026-10-03, CLAUDE.md updated).
--   - Notes are health-adjacent ("shoulder still restricted"), so they
--     follow the check-ins rules: staff need the Check-ins switch, and
--     nothing is written or shown for a member who hasn't said yes to
--     health info (0043).
--   - Members don't read notes about them any more (Carl's call: coaches
--     should be able to write candidly). Drops that half of the old read.
-- Run AFTER 0046.
-- ============================================================================

begin;

create unique index session_notes_one_per_member
  on session_notes (session_id, member_id);

alter table session_notes
  add column updated_at timestamptz not null default now(),
  add constraint session_notes_tags_limit check (cardinality(tags) <= 10),
  add constraint session_notes_text_limit check (note_text is null or char_length(note_text) <= 500);

comment on table session_notes is
  'Coach''s note on one member after one session: quick tags and/or a short text. Staff-only; health-adjacent, so gated like check-ins.';

-- Who may write a note on (session, member): the owner, or the coach
-- taking that session with Today on — and only for someone booked on it
-- who has said yes to health info. Shared by create and change.
create or replace function can_write_session_note(p_session_id uuid, p_member_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select staff_can_view('checkins')
     and has_health_consent(p_member_id)
     and (
       is_owner()
       or (staff_can_view('today')
           and exists (select 1 from sessions s where s.id = p_session_id and s.coach_id = auth.uid()))
     )
     and exists (
       select 1 from bookings b
       where b.session_id = p_session_id
         and b.member_id = p_member_id
         and b.status in ('booked', 'attended', 'no_show', 'excused')
     );
$$;

revoke execute on function can_write_session_note(uuid, uuid) from public, anon;
grant execute on function can_write_session_note(uuid, uuid) to authenticated;

-- Replaces: "session_notes: read" (0046) — members' own-notes half dropped
drop policy "session_notes: read" on session_notes;
create policy "session_notes: read"
  on session_notes for select
  to authenticated
  using (
    staff_can_view('checkins') and has_health_consent(member_id)
  );

-- Replaces: "session_notes: create" (0046)
drop policy "session_notes: create" on session_notes;
create policy "session_notes: create"
  on session_notes for insert
  to authenticated
  with check (
    coach_id = (select auth.uid())
    and can_write_session_note(session_id, member_id)
  );

create policy "session_notes: change"
  on session_notes for update
  to authenticated
  using (
    can_write_session_note(session_id, member_id)
  )
  with check (
    coach_id = (select auth.uid())
    and can_write_session_note(session_id, member_id)
  );

create policy "session_notes: delete"
  on session_notes for delete
  to authenticated
  using (
    can_write_session_note(session_id, member_id)
  );

commit;
