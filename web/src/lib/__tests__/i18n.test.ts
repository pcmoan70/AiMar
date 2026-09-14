import { describe, expect, it } from 'vitest'
import { en } from '../../i18n/en'
import { nb } from '../../i18n/nb'
import { translate } from '../i18n'

describe('i18n dictionaries', () => {
  it('have identical key sets', () => {
    const a = Object.keys(en).sort()
    const b = Object.keys(nb).sort()
    expect(b.filter((k) => !a.includes(k))).toEqual([])
    expect(a.filter((k) => !b.includes(k))).toEqual([])
  })
  it('keep the same placeholders in both languages', () => {
    for (const k of Object.keys(en)) {
      const ph = (s: string) => (s.match(/\{[a-z]+\}/g) ?? []).sort()
      expect(ph(nb[k]), k).toEqual(ph(en[k]))
    }
  })
  it('interpolates and falls back', () => {
    expect(translate('nb', 'ops.n', { n: 3 })).toBe('3 oppdrettere')
    expect(translate('en', 'ops.n', { n: 3 })).toBe('3 operators')
    expect(translate('nb', 'no.such.key')).toBe('no.such.key')
  })
})
