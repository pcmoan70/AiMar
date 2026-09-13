// Captures the browser's install prompt so the UI can offer "Install app".
import { useEffect, useState } from 'react'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
}

let deferred: BeforeInstallPromptEvent | null = null
const listeners = new Set<() => void>()

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault()
  deferred = e as BeforeInstallPromptEvent
  listeners.forEach((l) => l())
})
window.addEventListener('appinstalled', () => {
  deferred = null
  listeners.forEach((l) => l())
})

export function useInstallPrompt() {
  const [, force] = useState(0)
  useEffect(() => {
    const l = () => force((n) => n + 1)
    listeners.add(l)
    return () => {
      listeners.delete(l)
    }
  }, [])
  return {
    available: deferred !== null,
    prompt: async () => {
      await deferred?.prompt()
      deferred = null
      force((n) => n + 1)
    },
  }
}
