import { useState, type FormEvent } from 'react'
import { login } from '../lib/auth'
import { LANGS, setLang, useLang, useT } from '../lib/i18n'

export default function LoginScreen() {
  const t = useT()
  const lang = useLang()
  const [user, setUser] = useState('')
  const [pass, setPass] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const ok = await login(user, pass)
    setBusy(false)
    if (!ok) setError(t('login.wrong'))
  }

  return (
    <div className="login">
      <form className="login-card" onSubmit={submit}>
        <div className="login-top">
          <h1>AiMar</h1>
          <div className="lang-switch" role="group" aria-label={t('login.language')}>
            {LANGS.map((l) => (
              <button key={l.id} type="button" className={lang === l.id ? '' : 'secondary'} onClick={() => setLang(l.id)}>
                {l.label}
              </button>
            ))}
          </div>
        </div>
        <p className="muted">{t('app.tagline')}</p>
        <label>
          {t('login.user')}
          <input id="login-user" autoComplete="username" value={user} onChange={(e) => setUser(e.target.value)} autoFocus />
        </label>
        <label>
          {t('login.pass')}
          <input id="login-pass" type="password" autoComplete="current-password" value={pass} onChange={(e) => setPass(e.target.value)} />
        </label>
        {error && <p className="error">{error}</p>}
        <button type="submit" disabled={busy || !user || !pass}>
          {busy ? t('login.checking') : t('login.submit')}
        </button>
      </form>
    </div>
  )
}
