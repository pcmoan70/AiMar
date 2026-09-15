import { useRegisterSW } from 'virtual:pwa-register/react'
import { useT } from '../lib/i18n'

const CHECK_INTERVAL_MS = 10 * 60 * 1000

/** Ask the browser to re-check sw.js; a changed file installs the new version and sets needRefresh. */
async function checkForUpdate(swUrl: string, reg: ServiceWorkerRegistration) {
  if (!navigator.onLine) return
  try {
    const res = await fetch(swUrl, { cache: 'no-store', headers: { 'cache-control': 'no-cache' } })
    if (res.ok) await reg.update()
  } catch {
    /* offline or server unreachable: try again later */
  }
}

export default function UpdatePrompt() {
  const t = useT()
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    offlineReady: [offlineReady, setOfflineReady],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(swUrl, reg) {
      if (!reg) return
      const check = () => checkForUpdate(swUrl, reg)
      setInterval(check, CHECK_INTERVAL_MS)
      document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && check())
      window.addEventListener('online', check)
    },
  })

  /**
   * Activate the waiting worker and load the new version. `updateServiceWorker(true)` alone proved
   * unreliable here — the waiting worker was there but the page never reloaded — so the waiting
   * worker is told to skip waiting directly and the reload is forced once it has taken over.
   */
  const reload = async () => {
    try {
      await updateServiceWorker(false)
    } catch {
      /* fall through: the reload below is what matters */
    }
    const reg = await navigator.serviceWorker?.getRegistration().catch(() => undefined)
    reg?.waiting?.postMessage({ type: 'SKIP_WAITING' })
    await new Promise<void>((done) => {
      const t = setTimeout(done, 2500)
      navigator.serviceWorker?.addEventListener(
        'controllerchange',
        () => {
          clearTimeout(t)
          done()
        },
        { once: true },
      )
    })
    window.location.reload()
  }

  if (!needRefresh && !offlineReady) return null
  return (
    <div className="toast" role="status">
      {needRefresh ? (
        <>
          <span>{t('update.available')}</span>
          <button onClick={reload}>{t('update.reload')}</button>
        </>
      ) : (
        <span>{t('update.ready')}</span>
      )}
      <button
        className="secondary"
        onClick={() => {
          setNeedRefresh(false)
          setOfflineReady(false)
        }}
      >
        {needRefresh ? t('update.later') : t('update.dismiss')}
      </button>
    </div>
  )
}
