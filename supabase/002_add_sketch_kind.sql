-- Add 'sketch' to the project_photos.kind enum so Randy can upload hand-drawn
-- concept sketches alongside the actual site photos. Sketches are passed to
-- the AI as "design inspiration, not literal style" via an updated Claude prompt.
--
-- Idempotent: drop-if-exists + recreate. Existing rows (all currently
-- site_photo or topo_map) continue to satisfy the new constraint.

alter table public.project_photos
  drop constraint if exists project_photos_kind_check;

alter table public.project_photos
  add constraint project_photos_kind_check
  check (kind in ('site_photo','topo_map','sketch'));
