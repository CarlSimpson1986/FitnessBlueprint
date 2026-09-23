-- ============================================================================
-- 0029_ted_cache_curation.sql
-- 1. Vector indexes: 0003 built IVFFlat indexes on empty tables. IVFFlat
--    learns its clusters at build time, so built empty it has no useful
--    clusters and a similarity search can miss rows that are there —
--    Coach Ted's answer cache could fail to find a genuine repeat. HNSW
--    has no training step and works from zero rows, so it's the right
--    index for tables that start empty and grow.
-- 2. Owner curation of Coach Ted's answer cache: 0003 let the owner read
--    and update cached answers; the /admin/ted-answers page also needs to
--    add hand-written answers and delete bad ones.
-- ============================================================================

drop index if exists idx_qa_cache_embedding;
create index idx_qa_cache_embedding on coach_ted_qa_cache
  using hnsw (question_embedding vector_cosine_ops);

drop index if exists idx_kb_embedding;
create index idx_kb_embedding on coach_ted_knowledge_base
  using hnsw (embedding vector_cosine_ops);

create policy "owner adds qa cache answers"
  on coach_ted_qa_cache for insert
  with check (is_owner());

create policy "owner deletes qa cache answers"
  on coach_ted_qa_cache for delete
  using (is_owner());
