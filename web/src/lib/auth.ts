// Simple client-side login gate. A static site cannot keep its files private;
// this only stops casual visitors. The shipped config holds a salted PBKDF2
// hash, never the password (see web/README.md to regenerate it).
import { useSyncExternalStore } from 'react'
import { AUTH_HASH, AUTH_ITERATIONS, AUTH_SALT } from './auth-config'

const KEY = 'aimar.auth.v1'
const listeners = new Set<() => void>()

function stored(): string | null {
  try {
    return localStorage.getItem(KEY)
  } catch {
    return null
  }
}

let loggedIn = stored() === AUTH_HASH

function set(v: boolean) {
  loggedIn = v
  listeners.forEach((l) => l())
}

async function derive(user: string, pass: string): Promise<string> {
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey('raw', enc.encode(`${user.trim().toLowerCase()}:${pass}`), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode(AUTH_SALT), iterations: AUTH_ITERATIONS },
    key,
    256,
  )
  return [...new Uint8Array(bits)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export const canLogin = () => typeof crypto !== 'undefined' && !!crypto.subtle

export async function login(user: string, pass: string): Promise<boolean> {
  const hash = await derive(user, pass)
  if (hash !== AUTH_HASH) return false
  try {
    localStorage.setItem(KEY, hash)
  } catch {
    /* session only */
  }
  set(true)
  return true
}

export function logout() {
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* ignore */
  }
  set(false)
}

function subscribe(l: () => void) {
  listeners.add(l)
  return () => listeners.delete(l)
}

export const useAuth = () => useSyncExternalStore(subscribe, () => loggedIn)
