import { createContext, useState, useEffect, useCallback, useMemo } from 'react'
import type { ReactNode } from 'react'
import { getDeploymentRequestId } from '@/lib/config/sse-request-id'
import { isTestMode } from '@/lib/config/test-mode'
import { useVersionSSE } from '../hooks/use-version-sse'

export interface DeploymentContextValue {
  isNewVersionAvailable: boolean
  currentVersion: string | null
  deploymentRequestId: string
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

  const deploymentRequestId = useMemo(() => getDeploymentRequestId(), [])

  const { connect, disconnect, version } = useVersionSSE()

  const connectWithRequestId = useCallback(() => {
    connect({ requestId: deploymentRequestId })
  }, [connect, deploymentRequestId])

  const checkForUpdates = useCallback(() => {
    // Force reconnection to check for updates
    connect({ requestId: deploymentRequestId })
  }, [connect, deploymentRequestId])

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

  const shouldConnectToSse = !import.meta.env.DEV || isTestMode()

  // Connect SSE on mount when enabled
  useEffect(() => {
    if (!shouldConnectToSse) {
      return
    }

    connectWithRequestId()
    return () => disconnect()
  }, [connectWithRequestId, disconnect, shouldConnectToSse])

  // Handle window focus to trigger reconnection when enabled
  useEffect(() => {
    if (!shouldConnectToSse) {
      return
    }

    const handleFocus = () => {
      checkForUpdates()
    }

    window.addEventListener('focus', handleFocus)
    return () => window.removeEventListener('focus', handleFocus)
  }, [checkForUpdates, shouldConnectToSse])

  const contextValue: DeploymentContextValue = {
    isNewVersionAvailable,
    currentVersion,
    deploymentRequestId,
    checkForUpdates,
    reloadApp
  }

  return (
    <DeploymentContext.Provider value={contextValue}>
      {children}
    </DeploymentContext.Provider>
  )
}
