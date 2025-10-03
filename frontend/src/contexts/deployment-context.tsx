import { createContext, useState, useEffect, useCallback, useRef } from 'react'
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

type DeploymentBridge = {
  connect: (requestId?: string) => void
  disconnect: () => void
  getStatus: () => { isConnected: boolean; requestId: string | null }
  getRequestId: () => string | null
}

export const DeploymentContext = createContext<DeploymentContextValue | undefined>(undefined)

interface DeploymentProviderProps {
  children: ReactNode
}

export function DeploymentProvider({ children }: DeploymentProviderProps) {
  const [isNewVersionAvailable, setIsNewVersionAvailable] = useState(false)
  const [currentVersion, setCurrentVersion] = useState<string | null>(null)

  const [deploymentRequestId, setDeploymentRequestId] = useState<string>(() => getDeploymentRequestId())

  const { connect, disconnect, isConnected, version } = useVersionSSE()

  const isConnectedRef = useRef(isConnected)
  const deploymentRequestIdRef = useRef<string | null>(deploymentRequestId ?? null)
  const deploymentControlsRef = useRef<DeploymentBridge | null>(null)

  useEffect(() => {
    isConnectedRef.current = isConnected
  }, [isConnected])

  useEffect(() => {
    deploymentRequestIdRef.current = deploymentRequestId ?? null
  }, [deploymentRequestId])

  const refreshRequestId = useCallback(() => {
    const nextRequestId = getDeploymentRequestId()
    setDeploymentRequestId(nextRequestId)
    return nextRequestId
  }, [])

  const startConnection = useCallback(
    (requestId?: string) => {
      const nextRequestId = requestId ?? refreshRequestId()
      if (requestId) {
        setDeploymentRequestId(requestId)
      }
      connect({ requestId: nextRequestId })
      return nextRequestId
    },
    [connect, refreshRequestId]
  )

  const connectWithRequestId = useCallback(
    (requestId?: string) => {
      startConnection(requestId)
    },
    [startConnection]
  )

  const checkForUpdates = useCallback(() => {
    connectWithRequestId()
  }, [connectWithRequestId])

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

  const shouldAutoConnect = !isTestMode() && !import.meta.env.DEV

  // Connect SSE on mount when enabled
  useEffect(() => {
    if (!shouldAutoConnect) {
      return
    }

    connectWithRequestId()
    return () => disconnect()
  }, [connectWithRequestId, disconnect, shouldAutoConnect])

  // Handle window focus to trigger reconnection when enabled
  useEffect(() => {
    if (!shouldAutoConnect) {
      return
    }

    const handleFocus = () => {
      checkForUpdates()
    }

    window.addEventListener('focus', handleFocus)
    return () => window.removeEventListener('focus', handleFocus)
  }, [checkForUpdates, shouldAutoConnect])

  useEffect(() => {
    if (!isTestMode()) {
      return
    }

    if (typeof window === 'undefined') {
      return
    }

    const globalWindow = window as typeof window & {
      __deploymentSseControls?: DeploymentBridge | null
    }

    if (!deploymentControlsRef.current) {
      deploymentControlsRef.current = {
        connect: (requestId?: string) => {
          connectWithRequestId(requestId)
        },
        disconnect: () => {
          disconnect()
        },
        getStatus: () => ({
          isConnected: isConnectedRef.current,
          requestId: deploymentRequestIdRef.current
        }),
        getRequestId: () => {
          return deploymentRequestIdRef.current
        }
      }
      globalWindow.__deploymentSseControls = deploymentControlsRef.current
    } else {
      globalWindow.__deploymentSseControls = deploymentControlsRef.current
    }

    return () => {
      if (globalWindow.__deploymentSseControls === deploymentControlsRef.current) {
        delete globalWindow.__deploymentSseControls
      }
      deploymentControlsRef.current = null
    }
  }, [connectWithRequestId, disconnect])

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
