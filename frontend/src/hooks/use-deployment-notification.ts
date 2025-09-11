import { useContext } from 'react'
import { DeploymentContext } from '@/contexts/deployment-context'

export function useDeploymentNotification() {
  const context = useContext(DeploymentContext)
  if (!context) {
    throw new Error('useDeploymentNotification must be used within a DeploymentProvider')
  }
  return context
}