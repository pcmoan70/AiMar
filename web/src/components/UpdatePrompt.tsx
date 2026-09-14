import { useRegisterSW } from 'virtual:pwa-register/react'

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

  if (!needRefresh && !offlineReady) return null
  return (
    <div className="toast" role="status">
      {needRefresh ? (
        <>
          <span>A new version of AiMar is available.</span>
          <button onClick={() => updateServiceWorker(true)}>Reload</button>
        </>
      ) : (
        <span>Ready to work offline.</span>
      )}
      <button
        className="secondary"
        onClick={() => {
          setNeedRefresh(false)
          setOfflineReady(false)
        }}
      >
        {needRefresh ? 'Later' : 'Dismiss'}
      </button>
    </div>
  )
}
