import { LANGS, setLang, useLang, useT } from '../lib/i18n'

/** One button showing the current language; clicking switches to the other one. */
export default function LangToggle() {
  const lang = useLang()
  const t = useT()
  const current = LANGS.find((l) => l.id === lang) ?? LANGS[0]
  const other = LANGS.find((l) => l.id !== lang) ?? LANGS[1]
  return (
    <button type="button" className="secondary lang-toggle" onClick={() => setLang(other.id)} title={t('lang.switchTo', { l: other.label })} aria-label={t('lang.switchTo', { l: other.label })}>
      {current.label}
    </button>
  )
}
