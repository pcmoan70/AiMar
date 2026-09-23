import { WHATS_NEW } from '../whatsnew'
import { useLang, useT } from '../lib/i18n'
import { updateSettings, useSettings } from '../lib/settings'

/** Card over the map on start-up with the changes the user has not seen yet; the Help panel keeps the full list. */
export default function WhatsNew() {
  const t = useT()
  const lang = useLang()
  const s = useSettings()
  const seenAt = WHATS_NEW.findIndex((n) => n.id === s.seenNews)
  const unseen = seenAt < 0 ? WHATS_NEW : WHATS_NEW.slice(0, seenAt)
  if (!unseen.length) return null
  const dismiss = () => updateSettings({ seenNews: WHATS_NEW[0].id })
  return (
    <div className="news-card" role="dialog" aria-labelledby="news-title">
      <div className="news-head">
        <h2 id="news-title">{t('news.title')}</h2>
        <button type="button" className="news-close" onClick={dismiss} aria-label={t('news.close')}>
          ✕
        </button>
      </div>
      <ul className="plain">
        {unseen.slice(0, 4).map((n) => (
          <li key={n.id}>
            <b>{n.title[lang]}</b> <span className="muted">{n.date}</span>
            <p>{n.text[lang]}</p>
          </li>
        ))}
      </ul>
      <p className="muted news-foot">{t('news.more')}</p>
      <button type="button" onClick={dismiss}>
        {t('news.ok')}
      </button>
    </div>
  )
}
