import { useRegisterSW } from 'virtual:pwa-register/react'

export default function UpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    offlineReady: [offlineReady, setOfflineReady],
    updateServiceWorker,
  } = useRegisterSW()

  if (!needRefresh && !offlineReady) return null
  return (
    <div className="toast">
      {needRefresh ? (
        <>
          <span>A new version is available.</span>
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
        Dismiss
      </button>
    </div>
  )
}
