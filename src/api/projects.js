// CRUD helpers for the projects table.
//
// Auth is handled by Supabase Auth + the RLS policies we set in 001_init.sql:
// any authenticated user can read/write any project (shared workspace model).

import { supabase } from './supabase.js'

/**
 * List projects, newest activity first. Optionally filter by status.
 * @param {{ status?: 'active'|'archived'|'handed_off' }} opts
 */
export async function listProjects(opts = {}) {
  let q = supabase
    .from('projects')
    .select('id, name, client_name, client_address, status, notes, prefs, design_brief, selected_generation_id, created_at, updated_at, owner_id')
    .order('updated_at', { ascending: false })

  if (opts.status) q = q.eq('status', opts.status)

  const { data, error } = await q
  if (error) throw error
  return data || []
}

/**
 * Get a single project by id.
 */
export async function getProject(id) {
  const { data, error } = await supabase
    .from('projects')
    .select('*')
    .eq('id', id)
    .single()
  if (error) throw error
  return data
}

/**
 * Create a new project. Pass at least { name }. owner_id is auto-set
 * to the current user.
 */
export async function createProject({ name, client_name = null, client_address = null, notes = '', prefs = {} }) {
  const { data: userData } = await supabase.auth.getUser()
  const owner_id = userData?.user?.id ?? null

  const { data, error } = await supabase
    .from('projects')
    .insert({ name, client_name, client_address, notes, prefs, owner_id })
    .select()
    .single()
  if (error) throw error
  return data
}

/**
 * Patch fields on a project.
 */
export async function updateProject(id, patch) {
  const { data, error } = await supabase
    .from('projects')
    .update(patch)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

/**
 * Delete a project (cascades to project_photos and generations via FK).
 */
export async function deleteProject(id) {
  const { error } = await supabase.from('projects').delete().eq('id', id)
  if (error) throw error
}
