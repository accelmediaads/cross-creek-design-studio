-- Cross Creek Design App — initial schema
-- Run this in: Supabase Dashboard → SQL Editor → New query → paste → Run
--
-- Model:
--   projects               one row per client site visit / job
--   project_photos         site photos + topo maps uploaded for a project
--   generations            AI-generated design images (initial / variation / revision)
--
-- Auth model:
--   Shared workspace — any authenticated user (Randy + office) can read/write everything.
--   Anonymous users see nothing.
--   When we grow past two users, we layer org/role logic; for now KISS.

-- ============================================================
-- Tables
-- ============================================================

create table if not exists public.projects (
  id              uuid primary key default gen_random_uuid(),
  owner_id        uuid references auth.users(id) on delete set null,
  name            text not null,
  client_name     text,
  client_address  text,
  status          text not null default 'active'
                    check (status in ('active','archived','handed_off')),
  notes           text default '',
  -- Snapshot of design preferences for this project (style/features/budget/materials/lighting/notes)
  prefs           jsonb not null default '{}'::jsonb,
  -- Claude-generated brief used to keep generations consistent across angles/revisions
  design_brief    text default '',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists projects_owner_idx        on public.projects (owner_id);
create index if not exists projects_status_idx       on public.projects (status);
create index if not exists projects_updated_at_idx   on public.projects (updated_at desc);

create table if not exists public.project_photos (
  id              uuid primary key default gen_random_uuid(),
  project_id      uuid not null references public.projects(id) on delete cascade,
  uploaded_by     uuid references auth.users(id) on delete set null,
  -- 'site_photo' = exterior shot of the property; 'topo_map' = optional topographical map
  kind            text not null default 'site_photo'
                    check (kind in ('site_photo','topo_map')),
  storage_path    text not null,                 -- key in the 'project-photos' bucket
  caption         text,
  ordering        int  not null default 0,
  created_at      timestamptz not null default now()
);

create index if not exists project_photos_project_idx on public.project_photos (project_id, ordering);

create table if not exists public.generations (
  id                    uuid primary key default gen_random_uuid(),
  project_id            uuid not null references public.projects(id) on delete cascade,
  created_by            uuid references auth.users(id) on delete set null,
  -- Which photo was the source (null for revisions of other generations)
  source_photo_id       uuid references public.project_photos(id) on delete set null,
  -- For revisions: which generation this is a revision of
  parent_generation_id  uuid references public.generations(id) on delete set null,
  -- 'initial' = first gen for a photo; 'variation' = another swing; 'revision' = tweak of a prior gen
  kind                  text not null default 'initial'
                          check (kind in ('initial','variation','revision')),
  prompt                text not null,
  storage_path          text not null,           -- key in the 'generations' bucket
  -- Snapshot of prefs at gen time so we can reproduce / show what was in play
  prefs_snapshot        jsonb not null default '{}'::jsonb,
  created_at            timestamptz not null default now()
);

create index if not exists generations_project_idx on public.generations (project_id, created_at desc);
create index if not exists generations_parent_idx  on public.generations (parent_generation_id);

-- Keep projects.updated_at fresh on edits
create or replace function public.touch_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists projects_touch_updated_at on public.projects;
create trigger projects_touch_updated_at
  before update on public.projects
  for each row execute function public.touch_updated_at();

-- Bump project's updated_at when any child row changes (so the project list sorts well)
create or replace function public.touch_parent_project() returns trigger as $$
declare
  pid uuid;
begin
  pid := coalesce(new.project_id, old.project_id);
  if pid is not null then
    update public.projects set updated_at = now() where id = pid;
  end if;
  return coalesce(new, old);
end;
$$ language plpgsql;

drop trigger if exists project_photos_touch_parent on public.project_photos;
create trigger project_photos_touch_parent
  after insert or update or delete on public.project_photos
  for each row execute function public.touch_parent_project();

drop trigger if exists generations_touch_parent on public.generations;
create trigger generations_touch_parent
  after insert or update or delete on public.generations
  for each row execute function public.touch_parent_project();

-- ============================================================
-- Row Level Security
-- ============================================================

alter table public.projects        enable row level security;
alter table public.project_photos  enable row level security;
alter table public.generations     enable row level security;

-- Shared workspace policies: any logged-in user has full access.
-- Replace these later if we move to per-user or per-org scoping.

drop policy if exists "auth all on projects"        on public.projects;
create policy "auth all on projects" on public.projects
  for all to authenticated using (true) with check (true);

drop policy if exists "auth all on project_photos"  on public.project_photos;
create policy "auth all on project_photos" on public.project_photos
  for all to authenticated using (true) with check (true);

drop policy if exists "auth all on generations"     on public.generations;
create policy "auth all on generations" on public.generations
  for all to authenticated using (true) with check (true);

-- ============================================================
-- Storage buckets
-- ============================================================
-- Private buckets — files only readable via signed URLs or authenticated requests.

insert into storage.buckets (id, name, public)
  values ('project-photos', 'project-photos', false)
  on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
  values ('generations', 'generations', false)
  on conflict (id) do nothing;

-- Storage RLS: any authenticated user can read/write either bucket.

drop policy if exists "auth read project-photos"  on storage.objects;
create policy "auth read project-photos" on storage.objects
  for select to authenticated
  using (bucket_id = 'project-photos');

drop policy if exists "auth write project-photos" on storage.objects;
create policy "auth write project-photos" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'project-photos');

drop policy if exists "auth update project-photos" on storage.objects;
create policy "auth update project-photos" on storage.objects
  for update to authenticated
  using (bucket_id = 'project-photos');

drop policy if exists "auth delete project-photos" on storage.objects;
create policy "auth delete project-photos" on storage.objects
  for delete to authenticated
  using (bucket_id = 'project-photos');

drop policy if exists "auth read generations"   on storage.objects;
create policy "auth read generations" on storage.objects
  for select to authenticated
  using (bucket_id = 'generations');

drop policy if exists "auth write generations"  on storage.objects;
create policy "auth write generations" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'generations');

drop policy if exists "auth update generations" on storage.objects;
create policy "auth update generations" on storage.objects
  for update to authenticated
  using (bucket_id = 'generations');

drop policy if exists "auth delete generations" on storage.objects;
create policy "auth delete generations" on storage.objects
  for delete to authenticated
  using (bucket_id = 'generations');
