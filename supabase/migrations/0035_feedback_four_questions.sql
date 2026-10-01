-- 0035_feedback_four_questions.sql
-- Guy's rate-the-class questions (spec notes, 2026-10): "How was your
-- coach? How was the session content? How did you perform? How are you
-- feeling afterwards?"
--
-- Two existing columns carry straight over, so their history stays
-- comparable:
--   class_rating      -> "How was the session content?"
--   effort_rating     -> "How did you perform?"
-- Two are new: coach_rating and feeling_rating. They're nullable because
-- every row before this migration was submitted without them; the app
-- requires all four from now on.
-- experience_rating is no longer asked. It's kept (now nullable) so older
-- feedback still shows its third score on the owner's Feedback page.
--
-- RLS is unchanged and still correct: session_feedback is owner-read
-- only, members insert their own row (0002). The coach rating in
-- particular must never get a coach-read policy.

alter table session_feedback
  add column coach_rating smallint check (coach_rating between 1 and 5),
  add column feeling_rating smallint check (feeling_rating between 1 and 5),
  alter column experience_rating drop not null;

comment on column session_feedback.class_rating is 'How was the session content? (1-5)';
comment on column session_feedback.effort_rating is 'How did you perform? (1-5)';
comment on column session_feedback.coach_rating is 'How was your coach? (1-5). Null on feedback from before 0035.';
comment on column session_feedback.feeling_rating is 'How are you feeling afterwards? (1-5). Null on feedback from before 0035.';
comment on column session_feedback.experience_rating is 'No longer asked since 0035; kept for older feedback.';
