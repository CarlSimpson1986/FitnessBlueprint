-- Read-only check that 0053_ted_answer_review.sql is fully applied. Not a
-- migration — run by hand in the Supabase SQL editor. Changes nothing.
-- Every row should say yes.

select 'column member_rating' as part,
       case when exists (select 1 from information_schema.columns
         where table_schema = 'public' and table_name = 'coach_ted_conversations' and column_name = 'member_rating')
       then 'yes' else 'NO' end as present
union all
select 'column rated_at',
       case when exists (select 1 from information_schema.columns
         where table_schema = 'public' and table_name = 'coach_ted_conversations' and column_name = 'rated_at')
       then 'yes' else 'NO' end
union all
select 'column removed_items',
       case when exists (select 1 from information_schema.columns
         where table_schema = 'public' and table_name = 'coach_ted_conversations' and column_name = 'removed_items')
       then 'yes' else 'NO' end
union all
select 'column owner_reviewed_at',
       case when exists (select 1 from information_schema.columns
         where table_schema = 'public' and table_name = 'coach_ted_conversations' and column_name = 'owner_reviewed_at')
       then 'yes' else 'NO' end
union all
select 'index idx_ted_conversations_needs_review',
       case when exists (select 1 from pg_indexes
         where schemaname = 'public' and indexname = 'idx_ted_conversations_needs_review')
       then 'yes' else 'NO' end
union all
select 'policy "coach_ted_conversations: change"',
       case when exists (select 1 from pg_policies
         where schemaname = 'public' and tablename = 'coach_ted_conversations' and policyname = 'coach_ted_conversations: change')
       then 'yes' else 'NO' end
union all
select 'function rate_ted_answer',
       case when exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public' and p.proname = 'rate_ted_answer')
       then 'yes' else 'NO' end
union all
select 'members can run rate_ted_answer',
       case when exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public' and p.proname = 'rate_ted_answer'
           and has_function_privilege('authenticated', p.oid, 'execute')
           and not has_function_privilege('anon', p.oid, 'execute'))
       then 'yes' else 'NO' end;
