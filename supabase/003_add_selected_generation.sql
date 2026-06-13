-- Add 'selected_generation_id' to projects.
--
-- The generation flow now has two phases:
--   1. First photo: produce 3 options (different interpretations of the same
--      chosen style). Randy picks one — that selection locks in the design
--      direction and seeds the design_brief.
--   2. Subsequent angles: a single generation each, all riffing on the locked
--      brief so the design stays consistent across angles.
--
-- A project is "locked" when selected_generation_id is non-null. The frontend
-- uses this flag to pick between the 3-option UI and the single-generation UI.

alter table public.projects
  add column if not exists selected_generation_id uuid
    references public.generations(id)
    on delete set null;

create index if not exists projects_selected_generation_idx
  on public.projects (selected_generation_id);
