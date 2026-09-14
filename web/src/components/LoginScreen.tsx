import { useState, type FormEvent } from 'react'
import { canLogin, login } from '../lib/auth'

export default function LoginScreen() {
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
    if (!ok) setError('Wrong username or password.')
  }

  return (
    <div className="login">
      <form className="login-card" onSubmit={submit}>
        <h1>AiMar</h1>
        <p className="muted">Norwegian aquaculture site intelligence. Sign in to continue.</p>
        {!canLogin() && <p className="error">Sign-in needs a secure connection (https or localhost).</p>}
        <label>
          Username
          <input id="login-user" autoComplete="username" value={user} onChange={(e) => setUser(e.target.value)} autoFocus />
        </label>
        <label>
          Password
          <input id="login-pass" type="password" autoComplete="current-password" value={pass} onChange={(e) => setPass(e.target.value)} />
        </label>
        {error && <p className="error">{error}</p>}
        <button type="submit" disabled={busy || !user || !pass || !canLogin()}>
          {busy ? 'Checking…' : 'Sign in'}
        </button>
      </form>
    </div>
  )
}
