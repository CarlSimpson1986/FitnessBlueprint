-- Waitlist email test (demo data only). Not a migration — run by hand in
-- the Supabase SQL editor. Copy from this file, not from the chat.
--
-- STEP 1: fill Test Coach's next class (from tomorrow) with the demo
-- clients, make it exactly full, and put Carl on its waitlist.
-- Run everything down to "STEP 2".

update bookings
set status = 'booked', cancelled_at = null
where status <> 'booked'
  and member_id in (select id from profiles where email like 'demo-%@fitnessblueprints.invalid')
  and session_id = (
    select se.id from sessions se join profiles c on c.id = se.coach_id
    where c.email = 'test-coach@fitnessblueprints.invalid' and se.status = 'scheduled'
      and se.session_date > (now() at time zone 'Europe/London')::date
    order by se.session_date, se.start_time limit 1
  );

insert into bookings (session_id, member_id, status)
select t.id, p.id, 'booked'
from (
  select se.id from sessions se join profiles c on c.id = se.coach_id
  where c.email = 'test-coach@fitnessblueprints.invalid' and se.status = 'scheduled'
    and se.session_date > (now() at time zone 'Europe/London')::date
  order by se.session_date, se.start_time limit 1
) t
cross join profiles p
where p.email like 'demo-%@fitnessblueprints.invalid'
  and not exists (select 1 from bookings b where b.session_id = t.id and b.member_id = p.id);

update sessions s
set capacity = (select count(*) from bookings b where b.session_id = s.id and b.status = 'booked')
where s.id = (
  select se.id from sessions se join profiles c on c.id = se.coach_id
  where c.email = 'test-coach@fitnessblueprints.invalid' and se.status = 'scheduled'
    and se.session_date > (now() at time zone 'Europe/London')::date
  order by se.session_date, se.start_time limit 1
);

delete from waitlist_entries
where member_id = (select id from profiles where email = 'carlossimpson83@gmail.com')
  and session_id = (
    select se.id from sessions se join profiles c on c.id = se.coach_id
    where c.email = 'test-coach@fitnessblueprints.invalid' and se.status = 'scheduled'
      and se.session_date > (now() at time zone 'Europe/London')::date
    order by se.session_date, se.start_time limit 1
  );

insert into waitlist_entries (session_id, member_id, position, status)
select t.id, me.id,
       coalesce((select max(w.position) from waitlist_entries w where w.session_id = t.id), 0) + 1,
       'waiting'
from (
  select se.id from sessions se join profiles c on c.id = se.coach_id
  where c.email = 'test-coach@fitnessblueprints.invalid' and se.status = 'scheduled'
    and se.session_date > (now() at time zone 'Europe/London')::date
  order by se.session_date, se.start_time limit 1
) t
cross join (select id from profiles where email = 'carlossimpson83@gmail.com') me;

select se.session_date, se.start_time, tm.name as class, se.capacity, we.status as your_waitlist
from waitlist_entries we
join sessions se on se.id = we.session_id
join session_templates tm on tm.id = se.template_id
where we.member_id = (select id from profiles where email = 'carlossimpson83@gmail.com')
  and we.status = 'waiting';


-- STEP 2: free one place, which offers it to Carl and fires the email.
-- Run this part on its own after checking the app shows the waitlist.

update bookings
set status = 'cancelled', cancelled_at = now()
where id = (
  select b.id
  from waitlist_entries we
  join bookings b on b.session_id = we.session_id and b.status = 'booked'
  join profiles d on d.id = b.member_id and d.email like 'demo-%@fitnessblueprints.invalid'
  where we.member_id = (select id from profiles where email = 'carlossimpson83@gmail.com')
    and we.status = 'waiting'
  limit 1
);

select promote_waitlist(we.session_id)
from waitlist_entries we
where we.member_id = (select id from profiles where email = 'carlossimpson83@gmail.com')
  and we.status = 'waiting';

select we.status, we.offer_expires_at
from waitlist_entries we
where we.member_id = (select id from profiles where email = 'carlossimpson83@gmail.com')
order by we.created_at desc
limit 1;
