import { useState, useEffect } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

// Global capture for beforeinstallprompt in case it fired before React component mount
let globalDeferredPrompt: BeforeInstallPromptEvent | null = null

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e: Event) => {
    e.preventDefault()
    globalDeferredPrompt = e as BeforeInstallPromptEvent
    window.dispatchEvent(new CustomEvent('pwa_prompt_available'))
  })
}

export function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState<boolean>(() => (typeof navigator !== 'undefined' ? navigator.onLine : true))

  useEffect(() => {
    const handleOnline = () => setIsOnline(true)
    const handleOffline = () => setIsOnline(false)

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  return isOnline
}

export function ConnectionIndicator() {
  const isOnline = useOnlineStatus()

  return (
    <div
      className={`pos-connection-badge no-print ${isOnline ? 'online' : 'offline'}`}
      title={isOnline ? 'System is connected to internet' : 'System is currently offline'}
    >
      <span className="connection-dot" />
      <span className="connection-text">{isOnline ? 'ONLINE' : 'OFFLINE'}</span>
    </div>
  )
}

export function PwaUpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegistered(r) {
      console.log('SW Registered:', r)
    },
    onRegisterError(error) {
      console.error('SW registration error:', error)
    },
  })

  if (!needRefresh) return null

  return (
    <div className="pwa-update-banner no-print" role="alert">
      <div className="pwa-update-content">
        <span className="pwa-update-icon">⚡</span>
        <div>
          <strong>New version available</strong>
          <p>An update to ZTech POS is ready to install.</p>
        </div>
      </div>
      <div className="pwa-update-actions">
        <button
          type="button"
          className="pwa-btn-update"
          onClick={() => {
            void updateServiceWorker(true)
          }}
        >
          UPDATE
        </button>
        <button
          type="button"
          className="pwa-btn-dismiss"
          onClick={() => setNeedRefresh(false)}
        >
          Later
        </button>
      </div>
    </div>
  )
}

export function PwaInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(() => globalDeferredPrompt)
  const [isDismissed, setIsDismissed] = useState<boolean>(() => {
    return sessionStorage.getItem('pwa_install_dismissed') === 'true'
  })
  const [isInstalled, setIsInstalled] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return (
        window.matchMedia('(display-mode: standalone)').matches ||
        (window.navigator as unknown as { standalone?: boolean }).standalone === true
      )
    }
    return false
  })

  useEffect(() => {
    const handlePromptAvailable = () => {
      setDeferredPrompt(globalDeferredPrompt)
    }

    const handleBeforeInstall = (e: Event) => {
      e.preventDefault()
      globalDeferredPrompt = e as BeforeInstallPromptEvent
      setDeferredPrompt(e as BeforeInstallPromptEvent)
    }

    const handleAppInstalled = () => {
      setIsInstalled(true)
      setDeferredPrompt(null)
      globalDeferredPrompt = null
      console.log('ZTech POS installed successfully')
    }

    window.addEventListener('pwa_prompt_available', handlePromptAvailable)
    window.addEventListener('beforeinstallprompt', handleBeforeInstall)
    window.addEventListener('appinstalled', handleAppInstalled)

    return () => {
      window.removeEventListener('pwa_prompt_available', handlePromptAvailable)
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall)
      window.removeEventListener('appinstalled', handleAppInstalled)
    }
  }, [])

  const handleInstallClick = async () => {
    if (!deferredPrompt) return
    await deferredPrompt.prompt()
    const { outcome } = await deferredPrompt.userChoice
    if (outcome === 'accepted') {
      setIsInstalled(true)
    }
    setDeferredPrompt(null)
    globalDeferredPrompt = null
  }

  const handleDismiss = () => {
    setIsDismissed(true)
    sessionStorage.setItem('pwa_install_dismissed', 'true')
  }

  // Only display if install prompt was captured, not dismissed, and not already standalone
  if (!deferredPrompt || isDismissed || isInstalled) {
    return null
  }

  return (
    <div className="pwa-install-banner no-print">
      <div className="pwa-install-info">
        <img src="/logo2.jpeg" alt="ZTech POS" className="pwa-install-logo" />
        <div className="pwa-install-text">
          <strong>Install ZTech POS</strong>
          <p>Install this POS on your device for faster access and an app-like experience.</p>
        </div>
      </div>
      <div className="pwa-install-buttons">
        <button type="button" className="pwa-btn-install" onClick={handleInstallClick}>
          INSTALL APP
        </button>
        <button type="button" className="pwa-btn-close" onClick={handleDismiss} title="Dismiss">
          ✕
        </button>
      </div>
    </div>
  )
}

export function InstallAppButton() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(() => globalDeferredPrompt)
  const [showGuide, setShowGuide] = useState(false)
  const [isInstalled, setIsInstalled] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return (
        window.matchMedia('(display-mode: standalone)').matches ||
        (window.navigator as unknown as { standalone?: boolean }).standalone === true
      )
    }
    return false
  })

  useEffect(() => {
    const handlePromptAvailable = () => setDeferredPrompt(globalDeferredPrompt)
    const handleBeforeInstall = (e: Event) => {
      e.preventDefault()
      globalDeferredPrompt = e as BeforeInstallPromptEvent
      setDeferredPrompt(e as BeforeInstallPromptEvent)
    }
    const handleAppInstalled = () => {
      setIsInstalled(true)
      setDeferredPrompt(null)
      globalDeferredPrompt = null
    }

    window.addEventListener('pwa_prompt_available', handlePromptAvailable)
    window.addEventListener('beforeinstallprompt', handleBeforeInstall)
    window.addEventListener('appinstalled', handleAppInstalled)

    return () => {
      window.removeEventListener('pwa_prompt_available', handlePromptAvailable)
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall)
      window.removeEventListener('appinstalled', handleAppInstalled)
    }
  }, [])

  if (isInstalled) {
    return (
      <div className="pwa-installed-badge no-print" title="Running in standalone application mode">
        <span>✓ App Installed</span>
      </div>
    )
  }

  const handleClick = async () => {
    if (deferredPrompt) {
      await deferredPrompt.prompt()
      const { outcome } = await deferredPrompt.userChoice
      if (outcome === 'accepted') {
        setIsInstalled(true)
      }
      setDeferredPrompt(null)
      globalDeferredPrompt = null
    } else {
      setShowGuide(true)
    }
  }

  return (
    <>
      <button
        type="button"
        className="sidebar-install-btn no-print"
        onClick={handleClick}
        title="Install ZTech POS on your computer or device"
      >
        <i>⇩</i>
        <span>Install App</span>
      </button>

      {showGuide && (
        <div className="pwa-guide-modal-backdrop no-print" onClick={() => setShowGuide(false)}>
          <div className="pwa-guide-modal" onClick={(e) => e.stopPropagation()}>
            <div className="pwa-guide-header">
              <img src="/logo2.jpeg" alt="Logo" style={{ width: '32px', height: '32px', borderRadius: '6px' }} />
              <h3>Install ZTech POS</h3>
              <button className="pwa-guide-close" onClick={() => setShowGuide(false)}>✕</button>
            </div>
            <div className="pwa-guide-body">
              <p>To install ZTech POS as a standalone desktop or mobile application:</p>
              <div className="pwa-step">
                <b>🖥️ Chrome / Edge (Desktop):</b>
                <span>Look at the address bar on the right side and click the <strong>Install icon (⊕ / 💻)</strong>, or open the browser menu (⋮) and select <strong>"Install ZTech POS"</strong>.</span>
              </div>
              <div className="pwa-step">
                <b>📱 Android:</b>
                <span>Open Chrome menu (⋮) and tap <strong>"Install app"</strong> or <strong>"Add to Home screen"</strong>.</span>
              </div>
            </div>
            <div className="pwa-guide-footer">
              <button className="pwa-btn-update" onClick={() => setShowGuide(false)}>Got it</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
