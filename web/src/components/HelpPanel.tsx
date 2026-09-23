import { useLang, useT } from '../lib/i18n'
import { WHATS_NEW } from '../whatsnew'

const SECTIONS: { id: string; items: number }[] = [
  { id: 'header', items: 4 },
  { id: 'map', items: 9 },
  { id: 'site', items: 5 },
  { id: 'chart', items: 4 },
  { id: 'cases', items: 5 },
  { id: 'layers', items: 5 },
  { id: 'offline', items: 6 },
  { id: 'sources', items: 8 },
]

/** Renders **bold** markup from the dictionary strings. */
function Rich({ text }: { text: string }) {
  const parts = text.split('**')
  return <>{parts.map((p, i) => (i % 2 ? <b key={i}>{p}</b> : p))}</>
}

export default function HelpPanel() {
  const t = useT()
  const lang = useLang()
  return (
    <div className="panel-body help">
      <h2>AiMar</h2>
      <p>{t('help.intro')}</p>
      <details className="help-news">
        <summary>{t('news.title')}</summary>
        <ul className="plain">
          {WHATS_NEW.map((n) => (
            <li key={n.id}>
              <b>{n.title[lang]}</b> <span className="muted">{n.date}</span>
              <p>{n.text[lang]}</p>
            </li>
          ))}
        </ul>
      </details>
      {SECTIONS.map((s) => (
        <section key={s.id}>
          <h3>{t(`help.${s.id}.title`)}</h3>
          <ul>
            {Array.from({ length: s.items }, (_, i) => (
              <li key={i}>
                <Rich text={t(`help.${s.id}.${i + 1}`)} />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}
