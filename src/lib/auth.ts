import { supabase } from './supabase'

export async function getAccessToken() {
  const { data } = await supabase.auth.getSession()
  return data.session?.access_token ?? null
}

export async function requireSession() {
  const { data } = await supabase.auth.getSession()
  return data.session
}
