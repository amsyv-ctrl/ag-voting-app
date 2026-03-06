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

export function getPasswordRecoveryRedirectUrl(path: string) {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`

  if (import.meta.env.DEV) {
    return `${window.location.origin}${normalizedPath}`
  }

  const configuredOrigin = import.meta.env.VITE_PUBLIC_SITE_URL
  const productionOrigin = configuredOrigin || 'https://www.ministryvote.com'
  return `${productionOrigin}${normalizedPath}`
}
