-- Late cancellations that were refunded (read-only). Not a migration — run
-- by hand in the Supabase SQL editor. Changes nothing.
--
-- Until 0054 (2026-10-05) the live cancel_booking() refunded every
-- cancellation, including ones within 3 hours of the class, which should
-- have kept the credit. This lists those refunds so Guy can decide whether
-- to take any back. Taking one back means a correcting -1 row
-- (reason 'manual_adjustment') — the credit ledger is append-only, so
-- nothing is ever edited. There's no button for that in the app yet.
--
-- Test and demo accounts (.invalid emails) are left out.

select p.full_name                                                         as member,
       p.email,
       t.name                                                              as class,
       to_char(s.session_date + s.start_time, 'Dy DD Mon YYYY HH24:MI')    as class_starts_uk,
       to_char(cl.created_at at time zone 'Europe/London', 'Dy DD Mon HH24:MI') as cancelled_uk,
       round(extract(epoch from (((s.session_date + s.start_time) at time zone 'Europe/London') - cl.created_at)) / 3600.0, 1)
                                                                           as hours_before_class
from credit_ledger cl
join bookings b on b.id = cl.related_booking_id
join sessions s on s.id = b.session_id
join session_templates t on t.id = s.template_id
join profiles p on p.id = cl.member_id
where cl.reason = 'cancellation_refund'
  and cl.created_at > ((s.session_date + s.start_time) at time zone 'Europe/London') - interval '3 hours'
  and p.email not like '%.invalid'
order by cl.created_at desc;
