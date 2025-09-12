import { createContext, useState, useEffect, useCallback } from 'react'
import type { ReactNode } from 'react'
import { useVersionSSE } from '../hooks/use-version-sse'

interface DeploymentContextValue {
  isNewVersionAvailable: boolean
  currentVersion: string | null
  checkForUpdates: () => void
  reloadApp: () => void
}

export const DeploymentContext = createContext<DeploymentContextValue | undefined>(undefined)

interface DeploymentProviderProps {
  children: ReactNode
}

export function DeploymentProvider({ children }: DeploymentProviderProps) {
  const [isNewVersionAvailable, setIsNewVersionAvailable] = useState(false)
  const [currentVersion, setCurrentVersion] = useState<string | null>(null)
  
  const { connect, disconnect, version } = useVersionSSE()

  const checkForUpdates = useCallback(() => {
    // Force reconnection to check for updates
    disconnect()
    connect()
  }, [disconnect, connect])

  const reloadApp = useCallback(() => {
    window.location.reload()
  }, [])

  // Handle version changes from SSE
  useEffect(() => {
    if (version) {
      if (currentVersion === null) {
        // First version received - set as current
        setCurrentVersion(version)
      } else if (version !== currentVersion) {
        // Version changed - new version available
        setIsNewVersionAvailable(true)
      }
    }
  }, [version, currentVersion])

  // Connect SSE on mount (production only)
  useEffect(() => {
    // Skip version checking in development
    const isDevelopment = import.meta.env.DEV
    if (isDevelopment) {
      return
    }
    
    connect()
    return () => disconnect()
  }, [connect, disconnect])

  // Handle window focus to trigger reconnection (production only)
  useEffect(() => {
    // Skip version checking in development
    const isDevelopment = import.meta.env.DEV
    if (isDevelopment) {
      return
    }
    
    const handleFocus = () => {
      checkForUpdates()
    }

    window.addEventListener('focus', handleFocus)
    return () => window.removeEventListener('focus', handleFocus)
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