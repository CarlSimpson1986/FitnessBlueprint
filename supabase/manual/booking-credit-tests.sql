-- ============================================================================
-- Booking, credit and waitlist tests. Not a migration — run by hand in the
-- Supabase SQL editor (paste the whole file, Run). Copy from this file,
-- not from the chat.
--
-- SAFE ON PRODUCTION: it's one DO block that ends by raising an error on
-- purpose, which makes Postgres undo everything it did — the throwaway
-- logins, plans, sessions, bookings and credits all disappear, and no
-- waitlist email is sent (pg_net only sends after a commit). So the
-- editor ALWAYS shows "ERROR" — read the message under it: it's the
-- test report, ending in "N passed, N failed".
--
-- What it does: creates throwaway members (@fitnessblueprints.invalid),
-- a coach, test plans and sessions, then calls the real functions the app
-- uses (book_session, cancel_booking, join_waitlist, accept_waitlist_offer
-- — latest versions in 0050 / 0012 / 0010), signed in as each member.
--
-- Not covered (can't be, from one SQL session): two people booking the
-- last place at the same instant. book_session locks the session row and
-- the member's membership row (FOR UPDATE), which is what prevents that.
-- ============================================================================

do $do$
declare
  v_now_uk timestamp := now() at time zone 'Europe/London';
  v_today date := (now() at time zone 'Europe/London')::date;
  v_soon timestamp := (now() at time zone 'Europe/London') + interval '2 hours';
  v_monday date;
  v_gcp uuid;
  v_tag text := substr(md5(random()::text), 1, 8);

  -- people
  v_coach uuid := gen_random_uuid();
  m_none uuid := gen_random_uuid();   -- no membership
  m_pack uuid := gen_random_uuid();   -- 2-credit pack
  m_unl uuid := gen_random_uuid();    -- unlimited
  m_1x uuid := gen_random_uuid();     -- 1 session a week
  m_6wk uuid := gen_random_uuid();    -- 6-week programme, started 35 days ago
  m_hyrox uuid := gen_random_uuid();  -- Hyrox-only plan

  -- plans
  p_pack uuid; p_unl uuid; p_1x uuid; p_6wk uuid; p_hyrox uuid;

  -- sessions
  s_a uuid; s_b uuid; s_c uuid; s_soon uuid; s_full uuid; s_full2 uuid;
  s_week1 uuid; s_week2 uuid; s_past uuid; s_far uuid; s_cancelled uuid; s_6wk_late uuid;

  v_bk bookings%rowtype;
  v_bk_a bookings%rowtype;
  v_bk_soon bookings%rowtype;
  v_bk_full bookings%rowtype;
  v_entry waitlist_entries%rowtype;
  v_bal integer;
  v_lines text[] := '{}';
  v_line text;
  v_pass integer := 0;
  v_fail integer := 0;
begin
  -- --------------------------------------------------------------------------
  -- Helpers (temporary, undone with everything else)
  -- --------------------------------------------------------------------------
  execute $fn$
    create function pg_temp.sign_in_as(p_user uuid) returns void language sql as $f$
      select set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
    $f$
  $fn$;

  -- Runs p_sql as p_as and expects it to fail with an error containing p_pattern.
  execute $fn$
    create function pg_temp.expect_error(p_label text, p_as uuid, p_sql text, p_pattern text)
    returns text language plpgsql as $f$
    begin
      perform pg_temp.sign_in_as(p_as);
      begin
        execute p_sql;
      exception when others then
        if sqlerrm ilike '%' || p_pattern || '%' then
          return 'PASS  ' || p_label;
        end if;
        return 'FAIL  ' || p_label || ' — wrong error: ' || sqlerrm;
      end;
      return 'FAIL  ' || p_label || ' — it was allowed';
    end;
    $f$
  $fn$;

  execute $fn$
    create function pg_temp.balance(p_member uuid) returns integer language sql as $f$
      select coalesce(sum(delta), 0)::integer from credit_ledger where member_id = p_member;
    $f$
  $fn$;

  -- --------------------------------------------------------------------------
  -- Setup
  -- --------------------------------------------------------------------------
  select id into v_gcp from session_templates where code = 'gcp';
  if v_gcp is null then
    raise exception 'Setup: no session template with code gcp';
  end if;

  insert into auth.users (instance_id, id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  select '00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated',
         'sqltest-' || u.n || '-' || v_tag || '@fitnessblueprints.invalid', '{}'::jsonb, '{}'::jsonb, now(), now()
  from (values (v_coach, 'coach'), (m_none, 'none'), (m_pack, 'pack'), (m_unl, 'unl'),
               (m_1x, '1x'), (m_6wk, '6wk'), (m_hyrox, 'hyrox')) as u(id, n);

  insert into profiles (id, role, full_name, email)
  select u.id, u.role::member_role, 'SQL test ' || u.n, 'sqltest-' || u.n || '-' || v_tag || '@fitnessblueprints.invalid'
  from (values (v_coach, 'coach', 'coach'), (m_none, 'member', 'none'), (m_pack, 'member', 'pack'),
               (m_unl, 'member', 'unl'), (m_1x, 'member', '1x'), (m_6wk, 'member', '6wk'),
               (m_hyrox, 'member', 'hyrox')) as u(id, role, n);

  insert into membership_plans (code, name, price_pence, billing_type, sessions_per_week, credit_pack_size, programme_length_days, allowed_template_codes)
  values ('sqltest_pack_' || v_tag, 'SQL test pack', 0, 'one_off', null, 2, null, null) returning id into p_pack;
  insert into membership_plans (code, name, price_pence, billing_type, sessions_per_week, credit_pack_size, programme_length_days, allowed_template_codes)
  values ('sqltest_unl_' || v_tag, 'SQL test unlimited', 0, 'recurring', null, null, null, null) returning id into p_unl;
  insert into membership_plans (code, name, price_pence, billing_type, sessions_per_week, credit_pack_size, programme_length_days, allowed_template_codes)
  values ('sqltest_1x_' || v_tag, 'SQL test 1x', 0, 'recurring', 1, null, null, null) returning id into p_1x;
  insert into membership_plans (code, name, price_pence, billing_type, sessions_per_week, credit_pack_size, programme_length_days, allowed_template_codes)
  values ('sqltest_6wk_' || v_tag, 'SQL test 6wk', 0, 'one_off', null, null, 42, null) returning id into p_6wk;
  insert into membership_plans (code, name, price_pence, billing_type, sessions_per_week, credit_pack_size, programme_length_days, allowed_template_codes)
  values ('sqltest_hyrox_' || v_tag, 'SQL test hyrox', 0, 'recurring', null, null, null, '{hyrox}') returning id into p_hyrox;

  insert into member_memberships (member_id, plan_id, status, started_at) values
    (m_pack, p_pack, 'active', now()),
    (m_unl, p_unl, 'active', now()),
    (m_1x, p_1x, 'active', now()),
    (m_6wk, p_6wk, 'active', now() - interval '35 days'),
    (m_hyrox, p_hyrox, 'active', now());

  insert into credit_ledger (member_id, delta, reason) values (m_pack, 2, 'signup_bonus');

  -- Next Monday (a whole Mon-Sun week inside the 14-day booking window).
  v_monday := v_today + (8 - extract(isodow from v_today)::int);

  insert into sessions (template_id, coach_id, session_date, start_time, duration_minutes, capacity)
    values (v_gcp, v_coach, v_today + 2, '10:00', 60, 10) returning id into s_a;
  insert into sessions (template_id, coach_id, session_date, start_time, duration_minutes, capacity)
    values (v_gcp, v_coach, v_today + 3, '10:00', 60, 10) returning id into s_b;
  insert into sessions (template_id, coach_id, session_date, start_time, duration_minutes, capacity)
    values (v_gcp, v_coach, v_today + 4, '10:00', 60, 10) returning id into s_c;
  insert into sessions (template_id, coach_id, session_date, start_time, duration_minutes, capacity)
    values (v_gcp, v_coach, v_soon::date, v_soon::time, 60, 10) returning id into s_soon;
  insert into sessions (template_id, coach_id, session_date, start_time, duration_minutes, capacity)
    values (v_gcp, v_coach, v_today + 2, '11:00', 60, 1) returning id into s_full;
  insert into sessions (template_id, coach_id, session_date, start_time, duration_minutes, capacity)
    values (v_gcp, v_coach, v_today + 2, '12:00', 60, 1) returning id into s_full2;
  insert into sessions (template_id, coach_id, session_date, start_time, duration_minutes, capacity)
    values (v_gcp, v_coach, v_monday, '09:00', 60, 10) returning id into s_week1;
  insert into sessions (template_id, coach_id, session_date, start_time, duration_minutes, capacity)
    values (v_gcp, v_coach, v_monday + 1, '09:00', 60, 10) returning id into s_week2;
  insert into sessions (template_id, coach_id, session_date, start_time, duration_minutes, capacity)
    values (v_gcp, v_coach, v_today - 1, '10:00', 60, 10) returning id into s_past;
  insert into sessions (template_id, coach_id, session_date, start_time, duration_minutes, capacity)
    values (v_gcp, v_coach, v_today + 20, '10:00', 60, 10) returning id into s_far;
  insert into sessions (template_id, coach_id, session_date, start_time, duration_minutes, capacity, status)
    values (v_gcp, v_coach, v_today + 2, '13:00', 60, 10, 'cancelled') returning id into s_cancelled;
  insert into sessions (template_id, coach_id, session_date, start_time, duration_minutes, capacity)
    values (v_gcp, v_coach, v_today + 9, '10:00', 60, 10) returning id into s_6wk_late;

  -- --------------------------------------------------------------------------
  -- Who can book what
  -- --------------------------------------------------------------------------
  v_lines := v_lines || pg_temp.expect_error('No membership: can''t book', m_none,
    format('select book_session(%L)', s_a), 'No active membership');
  v_lines := v_lines || pg_temp.expect_error('Past session: can''t book', m_unl,
    format('select book_session(%L)', s_past), 'already started');
  v_lines := v_lines || pg_temp.expect_error('More than 14 days ahead: can''t book', m_unl,
    format('select book_session(%L)', s_far), 'two weeks ahead');
  v_lines := v_lines || pg_temp.expect_error('Cancelled session: can''t book', m_unl,
    format('select book_session(%L)', s_cancelled), 'not open for booking');
  v_lines := v_lines || pg_temp.expect_error('Hyrox-only plan: can''t book GCP', m_hyrox,
    format('select book_session(%L)', s_a), 'only covers');
  v_lines := v_lines || pg_temp.expect_error('6-week programme: can''t book after it ends', m_6wk,
    format('select book_session(%L)', s_6wk_late), 'programme finishes');

  begin
    perform pg_temp.sign_in_as(m_6wk);
    select * into v_bk from book_session(s_b);
    v_lines := v_lines || case when v_bk.status = 'booked'
      then 'PASS  6-week programme: can book inside it'
      else 'FAIL  6-week programme: can book inside it — status ' || v_bk.status end;
  exception when others then
    v_lines := v_lines || ('FAIL  6-week programme: can book inside it — ' || sqlerrm);
  end;

  -- --------------------------------------------------------------------------
  -- Weekly limit
  -- --------------------------------------------------------------------------
  begin
    perform pg_temp.sign_in_as(m_1x);
    select * into v_bk from book_session(s_week1);
    v_lines := v_lines || 'PASS  1x a week: first session that week books';
  exception when others then
    v_lines := v_lines || ('FAIL  1x a week: first session that week books — ' || sqlerrm);
  end;
  v_lines := v_lines || pg_temp.expect_error('1x a week: second session the same week is refused', m_1x,
    format('select book_session(%L)', s_week2), 'session(s) a week');

  -- --------------------------------------------------------------------------
  -- Credits (2-credit pack)
  -- --------------------------------------------------------------------------
  begin
    perform pg_temp.sign_in_as(m_pack);
    select * into v_bk_a from book_session(s_a);
    v_bal := pg_temp.balance(m_pack);
    v_lines := v_lines || case when v_bal = 1 and v_bk_a.credit_ledger_id is not null
      then 'PASS  Pack: booking uses 1 credit (2 -> 1)'
      else 'FAIL  Pack: booking uses 1 credit — balance ' || v_bal end;
  exception when others then
    v_lines := v_lines || ('FAIL  Pack: booking uses 1 credit — ' || sqlerrm);
  end;

  v_lines := v_lines || pg_temp.expect_error('Same session twice: refused', m_pack,
    format('select book_session(%L)', s_a), 'already have a booking');

  begin
    perform pg_temp.sign_in_as(m_pack);
    select * into v_bk from book_session(s_b);
    v_bal := pg_temp.balance(m_pack);
    v_lines := v_lines || case when v_bal = 0
      then 'PASS  Pack: second booking uses the last credit (1 -> 0)'
      else 'FAIL  Pack: second booking — balance ' || v_bal end;
  exception when others then
    v_lines := v_lines || ('FAIL  Pack: second booking — ' || sqlerrm);
  end;

  v_lines := v_lines || pg_temp.expect_error('Pack: no credits left, booking refused', m_pack,
    format('select book_session(%L)', s_c), 'No credits remaining');

  v_lines := v_lines || pg_temp.expect_error('Can''t cancel someone else''s booking', m_unl,
    format('select cancel_booking(%L)', v_bk_a.id), 'Not your booking');

  begin
    perform pg_temp.sign_in_as(m_pack);
    select * into v_bk from cancel_booking(v_bk_a.id);
    v_bal := pg_temp.balance(m_pack);
    v_lines := v_lines || case when v_bal = 1 and v_bk.status = 'cancelled'
      then 'PASS  Cancel more than 3 hours before: credit refunded (0 -> 1)'
      else 'FAIL  Cancel more than 3 hours before — balance ' || v_bal || ', status ' || v_bk.status end;
  exception when others then
    v_lines := v_lines || ('FAIL  Cancel more than 3 hours before — ' || sqlerrm);
  end;

  begin
    perform pg_temp.sign_in_as(m_pack);
    select * into v_bk_soon from book_session(s_soon);
    select * into v_bk from cancel_booking(v_bk_soon.id);
    v_bal := pg_temp.balance(m_pack);
    v_lines := v_lines || case when v_bal = 0 and v_bk.status = 'cancelled'
      then 'PASS  Cancel within 3 hours: no refund (1 -> 0 -> 0)'
      else 'FAIL  Cancel within 3 hours — balance ' || v_bal end;
  exception when others then
    v_lines := v_lines || ('FAIL  Cancel within 3 hours — ' || sqlerrm);
  end;

  begin
    perform pg_temp.sign_in_as(m_pack);
    select * into v_bk from book_session(s_a);
    v_bal := pg_temp.balance(m_pack);
    v_lines := v_lines || case when v_bal = -1
      then 'FAIL  Rebook after cancelling — went to -1 credits'
      else 'PASS  Rebook a cancelled session with the refunded credit' end;
  exception when others then
    -- Balance is 0 here (the within-3-hours cancel kept the credit), so a
    -- refusal is also correct.
    v_lines := v_lines || case when sqlerrm ilike '%No credits remaining%'
      then 'PASS  Rebook with 0 credits refused (balance can''t go negative)'
      else 'FAIL  Rebook after cancelling — ' || sqlerrm end;
  end;

  -- --------------------------------------------------------------------------
  -- Full session and the waitlist
  -- --------------------------------------------------------------------------
  begin
    perform pg_temp.sign_in_as(m_unl);
    select * into v_bk_full from book_session(s_full);
    v_lines := v_lines || 'PASS  Last place in a class books';
  exception when others then
    v_lines := v_lines || ('FAIL  Last place in a class books — ' || sqlerrm);
  end;

  v_lines := v_lines || pg_temp.expect_error('Full class: booking refused', m_6wk,
    format('select book_session(%L)', s_full), 'Session is full');

  v_lines := v_lines || pg_temp.expect_error('Class with space: can''t join its waitlist', m_6wk,
    format('select join_waitlist(%L)', s_c), 'has space');

  begin
    perform pg_temp.sign_in_as(m_6wk);
    select * into v_entry from join_waitlist(s_full);
    v_lines := v_lines || case when v_entry.status = 'waiting'
      then 'PASS  Full class: member joins the waitlist'
      else 'FAIL  Full class: join waitlist — status ' || v_entry.status end;
  exception when others then
    v_lines := v_lines || ('FAIL  Full class: join waitlist — ' || sqlerrm);
  end;

  begin
    perform pg_temp.sign_in_as(m_unl);
    perform cancel_booking(v_bk_full.id);
    select * into v_entry from waitlist_entries where session_id = s_full and member_id = m_6wk;
    v_lines := v_lines || case when v_entry.status = 'offered' and v_entry.offer_expires_at > now()
      then 'PASS  A cancellation offers the place to the waitlist (2-hour offer)'
      else 'FAIL  Cancellation -> waitlist offer — entry status ' || coalesce(v_entry.status::text, 'missing') end;
  exception when others then
    v_lines := v_lines || ('FAIL  Cancellation -> waitlist offer — ' || sqlerrm);
  end;

  begin
    perform pg_temp.sign_in_as(m_6wk);
    select * into v_bk from accept_waitlist_offer(v_entry.id);
    v_lines := v_lines || case when v_bk.status = 'booked'
      then 'PASS  Accepting the offer books the place'
      else 'FAIL  Accept offer — booking status ' || v_bk.status end;
  exception when others then
    v_lines := v_lines || ('FAIL  Accept offer — ' || sqlerrm);
  end;

  -- An offer that has run out can't be accepted.
  begin
    perform pg_temp.sign_in_as(m_unl);
    select * into v_bk_full from book_session(s_full2);
    perform pg_temp.sign_in_as(m_6wk);
    select * into v_entry from join_waitlist(s_full2);
    perform pg_temp.sign_in_as(m_unl);
    perform cancel_booking(v_bk_full.id);
    update waitlist_entries set offer_expires_at = now() - interval '1 minute'
      where session_id = s_full2 and member_id = m_6wk;
  exception when others then
    v_lines := v_lines || ('FAIL  Expired offer setup — ' || sqlerrm);
  end;
  v_lines := v_lines || pg_temp.expect_error('Expired waitlist offer: can''t accept', m_6wk,
    format('select accept_waitlist_offer(%L)', v_entry.id), 'no longer available');

  -- --------------------------------------------------------------------------
  -- Report, then undo everything
  -- --------------------------------------------------------------------------
  foreach v_line in array v_lines loop
    if v_line like 'PASS%' then v_pass := v_pass + 1; else v_fail := v_fail + 1; end if;
  end loop;

  raise exception using
    message = E'TEST REPORT — nothing was saved (this "error" is how the test undoes itself)\n\n'
      || array_to_string(v_lines, E'\n')
      || E'\n\n' || v_pass || ' passed, ' || v_fail || ' failed';
end;
$do$;
