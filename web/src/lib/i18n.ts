// Two-language UI (English, Norwegian bokmål). Strings live in src/i18n/en.ts and
// src/i18n/nb.ts under identical keys; a missing Norwegian key falls back to English.
import { useSyncExternalStore } from 'react'
import { en } from '../i18n/en'
import { nb } from '../i18n/nb'

export type Lang = 'en' | 'nb'
export const LANGS: { id: Lang; label: string }[] = [
  { id: 'en', label: 'English' },
  { id: 'nb', label: 'Norsk' },
]

const KEY = 'aimar.lang.v1'
const DICT: Record<Lang, Record<string, string>> = { en, nb }

function detect(): Lang {
  try {
    const stored = localStorage.getItem(KEY)
    if (stored === 'en' || stored === 'nb') return stored
  } catch {
    /* no storage */
  }
  return /^(nb|nn|no)\b/i.test(navigator.language ?? '') ? 'nb' : 'en'
}

let lang: Lang = detect()
const listeners = new Set<() => void>()

export const getLang = () => lang

export function setLang(l: Lang) {
  lang = l
  try {
    localStorage.setItem(KEY, l)
  } catch {
    /* ignore */
  }
  document.documentElement.lang = l
  listeners.forEach((f) => f())
}

function subscribe(f: () => void) {
  listeners.add(f)
  return () => listeners.delete(f)
}

/** Translate a key, interpolating {name} placeholders. Falls back to English, then to the key itself. */
export function translate(l: Lang, key: string, vars?: Record<string, string | number>): string {
  let s = DICT[l][key] ?? DICT.en[key] ?? key
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(String(v))
  return s
}

export function useLang(): Lang {
  return useSyncExternalStore(subscribe, getLang)
}

/** Hook returning the translate function bound to the current language. */
export function useT() {
  const l = useLang()
  return (key: string, vars?: Record<string, string | number>) => translate(l, key, vars)
}

/** Non-hook access for code outside React (map style, hover card). */
export const t = (key: string, vars?: Record<string, string | number>) => translate(lang, key, vars)

/** Locale for number formatting. */
export const numberLocale = () => (lang === 'nb' ? 'nb-NO' : 'en-GB')
