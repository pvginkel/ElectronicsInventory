import { createContext, useState, useEffect, useCallback } from 'react'
import type { ReactNode } from 'react'

interface DeploymentContextValue {
  isNewVersionAvailable: boolean
  currentVersion: string | null
  checkForUpdates: () => Promise<void>
  reloadApp: () => void
}

export const DeploymentContext = createContext<DeploymentContextValue | undefined>(undefined)

interface DeploymentProviderProps {
  children: ReactNode
}

export function DeploymentProvider({ children }: DeploymentProviderProps) {
  const [isNewVersionAvailable, setIsNewVersionAvailable] = useState(false)
  const [currentVersion, setCurrentVersion] = useState<string | null>(null)
  const isDevelopment = import.meta.env.DEV

  const fetchVersion = async (): Promise<string | null> => {
    try {
      const timestamp = Date.now()
      const response = await fetch(`/version.json?t=${timestamp}`)
      if (!response.ok) {
        return null
      }
      const data = await response.json()
      return data.version || null
    } catch {
      return null
    }
  }

  const checkForUpdates = useCallback(async () => {
    if (isDevelopment) {
      return
    }
    
    const latestVersion = await fetchVersion()
    if (!latestVersion) {
      return
    }

    if (currentVersion === null) {
      setCurrentVersion(latestVersion)
      return
    }

    if (latestVersion !== currentVersion) {
      setIsNewVersionAvailable(true)
    }
  }, [currentVersion, isDevelopment])

  const reloadApp = useCallback(() => {
    window.location.reload()
  }, [])

  useEffect(() => {
    checkForUpdates()
  }, [checkForUpdates])

  useEffect(() => {
    const handleFocus = () => {
      checkForUpdates()
    }

    window.addEventListener('focus', handleFocus)
    return () => window.removeEventListener('focus', handleFocus)
  }, [checkForUpdates])

  useEffect(() => {
    const interval = setInterval(() => {
      checkForUpdates()
    }, 5000)

    return () => clearInterval(interval)
  }, [checkForUpdates])

  const contextValue: DeploymentContextValue = {
    isNewVersionAvailable,
    currentVersion,
    checkForUpdates,
    reloadApp
  }

  return (
    <DeploymentContext.Provider value={contextValue}>
      {children}
    </DeploymentContext.Provider>
  )
}