-- taxPOD CRM + RAG schema.
-- Run this once in the Supabase SQL Editor (or psql) on a fresh project.

create extension if not exists vector;
create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- CRM
-- ---------------------------------------------------------------------------

create table if not exists contacts (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  email       text,
  phone       text,
  company     text,
  status      text not null default 'Lead'
              check (status in ('Lead', 'Prospect', 'Customer')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists opportunities (
  id          uuid primary key default gen_random_uuid(),
  contact_id  uuid not null references contacts (id) on delete cascade,
  title       text not null,
  value_rm    numeric(14, 2) not null default 0 check (value_rm >= 0),
  stage       text not null default 'New'
              check (stage in ('New', 'Contacted', 'Qualified', 'Proposal', 'Won', 'Lost')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists opportunities_contact_id_idx on opportunities (contact_id);
create index if not exists opportunities_stage_idx on opportunities (stage);

-- Written automatically by the app on every create / update / delete.
-- Powers the dashboard "recent activity" feed.
create table if not exists activity_events (
  id           bigint generated always as identity primary key,
  entity_type  text not null check (entity_type in ('contact', 'opportunity')),
  entity_id    uuid,
  action       text not null,
  summary      text not null,
  created_at   timestamptz not null default now()
);

create index if not exists activity_events_created_at_idx on activity_events (created_at desc);

-- ---------------------------------------------------------------------------
-- RAG knowledge base
-- ---------------------------------------------------------------------------

create table if not exists documents (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique,
  title       text not null,
  category    text not null,          -- metadata used for filtered retrieval
  source_url  text,
  page_count  int,
  created_at  timestamptz not null default now()
);

create table if not exists document_chunks (
  id           bigint generated always as identity primary key,
  document_id  uuid not null references documents (id) on delete cascade,
  chunk_index  int not null,
  page_number  int not null,
  section      text,
  content      text not null,
  embedding    vector(768) not null
);

create index if not exists document_chunks_document_id_idx on document_chunks (document_id);

-- Cosine-distance HNSW index. pgvector HNSW supports up to 2,000 dimensions,
-- which is why embeddings are stored at 768 rather than the model's 3,072.
create index if not exists document_chunks_embedding_idx
  on document_chunks using hnsw (embedding vector_cosine_ops);

-- Top-k similarity search with an optional category (metadata) filter.
create or replace function match_chunks (
  query_embedding  vector(768),
  match_count      int default 20,
  filter_category  text default null
)
returns table (
  id           bigint,
  slug         text,
  title        text,
  category     text,
  source_url   text,
  page_number  int,
  section      text,
  content      text,
  similarity   float
)
language sql stable
as $$
  select
    c.id,
    d.slug,
    d.title,
    d.category,
    d.source_url,
    c.page_number,
    c.section,
    c.content,
    1 - (c.embedding <=> query_embedding) as similarity
  from document_chunks c
  join documents d on d.id = c.document_id
  where filter_category is null or d.category = filter_category
  order by c.embedding <=> query_embedding
  limit match_count;
$$;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- The app has no auth (single hardcoded user) and talks to the database only
-- from the server with the service role key, which bypasses RLS. Enabling RLS
-- with no policies means the public anon key cannot read or write anything.
-- ---------------------------------------------------------------------------

alter table contacts          enable row level security;
alter table opportunities     enable row level security;
alter table activity_events   enable row level security;
alter table documents         enable row level security;
alter table document_chunks   enable row level security;
