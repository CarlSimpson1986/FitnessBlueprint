-- ============================================================================
-- 0003_coach_ted_vectors.sql
-- Coach Ted — RAG knowledge base + self-learning Q&A cache
--
-- Security model for this file is different from everything else: no
-- table here grants direct client access, even to the member who asked
-- the question. Every read and write goes through a server-side route
-- (src/app/api/coach-ted/) using the admin client, because:
--   1. The similarity search needs the service role to run efficiently
--      across all members' cached answers, not just one member's rows.
--   2. It stops a member from writing directly into the knowledge base
--      or forging a cached answer.
-- Members only ever see their own conversation history, via a policy
-- below — everything else is server-only.
-- ============================================================================

create extension if not exists vector;

-- Gemini's text-embedding-004 model outputs 768-dimensional vectors.
-- If the embedding model changes later, this dimension must change too —
-- and every existing row needs re-embedding, not just new ones.

-- ----------------------------------------------------------------------------
-- coach_ted_knowledge_base — Fitness Blueprint's own content (RAG source)
-- ----------------------------------------------------------------------------
create table coach_ted_knowledge_base (
  id uuid primary key default gen_random_uuid(),
  category text not null, -- 'philosophy' | 'session_type' | 'programme' | 'faq' | 'nutrition_principles' | 'recovery'
  content text not null,
  embedding vector(768),
  created_by uuid not null references profiles (id),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_kb_embedding on coach_ted_knowledge_base
  using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);
-- NOTE: `lists` is tuned for a few thousand rows. Re-tune (roughly
-- sqrt(row_count)) once the knowledge base + Q&A cache combined exceeds
-- ~10,000 rows — see Supabase's pgvector performance docs.

-- ----------------------------------------------------------------------------
-- coach_ted_qa_cache — the self-learning loop. Every answered question
-- lands here; future questions check this FIRST before hitting PubMed
-- or the LLM at all.
-- ----------------------------------------------------------------------------
create table coach_ted_qa_cache (
  id uuid primary key default gen_random_uuid(),
  question text not null,
  question_embedding vector(768),
  answer text not null,
  sources jsonb not null default '[]', -- PubMed citations used to build the answer
  hit_count integer not null default 0, -- times this cached answer was reused
  is_pinned boolean not null default false, -- owner-curated "always serve this"
  is_flagged boolean not null default false, -- owner-flagged as wrong, needs regeneration
  created_at timestamptz not null default now(),
  last_served_at timestamptz
);

create index idx_qa_cache_embedding on coach_ted_qa_cache
  using ivfflat (question_embedding vector_cosine_ops)
  with (lists = 100);

create index idx_qa_cache_flagged on coach_ted_qa_cache (is_flagged) where is_flagged = true;

comment on table coach_ted_qa_cache is
  'Similarity search against question_embedding determines cache hits. Threshold and matching logic live in the API route, not the database, so they can be tuned without a migration.';

-- ----------------------------------------------------------------------------
-- coach_ted_conversations — per-member history. This is the one Coach Ted
-- table members get a direct (read-only) policy on.
-- ----------------------------------------------------------------------------
create table coach_ted_conversations (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references profiles (id) on delete cascade,
  question text not null,
  answer text not null,
  matched_qa_cache_id uuid references coach_ted_qa_cache (id),
  was_served_from_cache boolean not null default false,
  created_at timestamptz not null default now()
);

create index idx_ted_conversations_member on coach_ted_conversations (member_id, created_at desc);

-- ============================================================================
-- RLS
-- ============================================================================
alter table coach_ted_knowledge_base enable row level security;
alter table coach_ted_qa_cache enable row level security;
alter table coach_ted_conversations enable row level security;

-- Knowledge base and Q&A cache: no policies for anon/authenticated at all.
-- Fully locked to those roles — only the service role (which bypasses RLS
-- by design) can touch them. This is intentional, not incomplete.

-- Owner gets a dashboard read for QA/moderation purposes.
create policy "owner reads knowledge base"
  on coach_ted_knowledge_base for select
  using (is_owner());

create policy "owner manages knowledge base"
  on coach_ted_knowledge_base for all
  using (is_owner())
  with check (is_owner());

create policy "owner reads qa cache"
  on coach_ted_qa_cache for select
  using (is_owner());

create policy "owner moderates qa cache"
  on coach_ted_qa_cache for update
  using (is_owner());

-- Members read their own conversation history; writes are server-only
-- (the API route uses the admin client so a member can't forge an answer
-- or inflate hit_count by writing directly).
create policy "members read own ted conversations"
  on coach_ted_conversations for select
  using (auth.uid() = member_id);

create policy "owner reads all ted conversations"
  on coach_ted_conversations for select
  using (is_owner());

-- ============================================================================
-- Similarity search RPCs — called from src/lib/coach-ted/*.ts via
-- supabase.rpc(...). supabase-js can't express `<=>` (cosine distance)
-- in a .select() chain, so this is the standard pattern: wrap the vector
-- comparison in a SQL function and call it as an RPC.
--
-- security definer + explicit revoke/grant below because these functions
-- need to read tables that have no direct SELECT policy for authenticated
-- users (coach_ted_qa_cache, coach_ted_knowledge_base). The function is
-- the only sanctioned door in — access to the function itself is still
-- restricted to service_role, so a member can't call it directly either.
-- ============================================================================

create or replace function match_qa_cache(
  query_embedding vector(768),
  match_threshold float default 0.85,
  match_count int default 1
)
returns table (
  id uuid,
  question text,
  answer text,
  sources jsonb,
  similarity float
)
language sql
stable
security definer
set search_path = public
as $$
  select
    id,
    question,
    answer,
    sources,
    1 - (question_embedding <=> query_embedding) as similarity
  from coach_ted_qa_cache
  where not is_flagged
    and 1 - (question_embedding <=> query_embedding) > match_threshold
  order by question_embedding <=> query_embedding
  limit match_count;
$$;

create or replace function match_knowledge_base(
  query_embedding vector(768),
  match_count int default 5
)
returns table (
  id uuid,
  category text,
  content text,
  similarity float
)
language sql
stable
security definer
set search_path = public
as $$
  select
    id,
    category,
    content,
    1 - (embedding <=> query_embedding) as similarity
  from coach_ted_knowledge_base
  where is_active
  order by embedding <=> query_embedding
  limit match_count;
$$;

-- Lock both functions down to service_role only — same reasoning as the
-- tables they read. Client code never calls these directly; the
-- src/app/api/coach-ted route does, using the admin client.
revoke execute on function match_qa_cache from public, anon, authenticated;
revoke execute on function match_knowledge_base from public, anon, authenticated;
grant execute on function match_qa_cache to service_role;
grant execute on function match_knowledge_base to service_role;
