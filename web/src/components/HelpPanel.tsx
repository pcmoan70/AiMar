import { useT } from '../lib/i18n'

const SECTIONS: { id: string; items: number }[] = [
  { id: 'header', items: 4 },
  { id: 'map', items: 7 },
  { id: 'site', items: 3 },
  { id: 'chart', items: 4 },
  { id: 'layers', items: 4 },
  { id: 'offline', items: 6 },
  { id: 'sources', items: 7 },
]

/** Renders **bold** markup from the dictionary strings. */
function Rich({ text }: { text: string }) {
  const parts = text.split('**')
  return <>{parts.map((p, i) => (i % 2 ? <b key={i}>{p}</b> : p))}</>
}

export default function HelpPanel() {
  const t = useT()
  return (
    <div className="panel-body help">
      <h2>AiMar</h2>
      <p>{t('help.intro')}</p>
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
