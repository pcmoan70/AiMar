// Simple client-side login gate. A static site cannot keep its files private;
// this only stops casual visitors. The shipped config holds a salted PBKDF2
// hash, never the password (see web/README.md to regenerate it).
import { useSyncExternalStore } from 'react'
import { pbkdf2 } from '@noble/hashes/pbkdf2'
import { sha256 } from '@noble/hashes/sha2'
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils'
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

// Pure-JS PBKDF2 so sign-in also works on plain-http addresses (no WebCrypto there).
function derive(user: string, pass: string): string {
  const input = utf8ToBytes(`${user.trim().toLowerCase()}:${pass.trim()}`)
  return bytesToHex(pbkdf2(sha256, input, utf8ToBytes(AUTH_SALT), { c: AUTH_ITERATIONS, dkLen: 32 }))
}

export async function login(user: string, pass: string): Promise<boolean> {
  await new Promise((r) => setTimeout(r, 0)) // let the button render its busy state
  const hash = derive(user, pass)
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
