import { supabase } from './supabase'

export async function getAccessToken() {
  const { data } = await supabase.auth.getSession()
  return data.session?.access_token ?? null
}

export async function requireSession() {
  const { data } = await supabase.auth.getSession()
  return data.session
}

export function getAuthRedirectUrl(path: string) {
  const configuredOrigin = import.meta.env.VITE_PUBLIC_SITE_URL
  const origin = configuredOrigin || window.location.origin
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  return `${origin}${normalizedPath}`
}
