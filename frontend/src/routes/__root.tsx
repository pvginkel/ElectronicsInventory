import { useState, useEffect } from 'react'
import { createRootRoute, Outlet } from '@tanstack/react-router'
import { QueryClientProvider } from '@tanstack/react-query'
import { Sidebar } from '@/components/layout/sidebar'
import { ToastProvider } from '@/contexts/toast-context'
import { DeploymentProvider } from '@/contexts/deployment-context'
import { DeploymentNotificationBar } from '@/components/ui/deployment-notification-bar'
import { queryClient, setToastFunction } from '@/lib/query-client'
import { useToast } from '@/hooks/use-toast'

export const Route = createRootRoute({
  component: RootLayout,
})

function QuerySetup({ children }: { children: React.ReactNode }) {
  const { showError } = useToast()

  useEffect(() => {
    setToastFunction(showError)
  }, [showError])

  return <>{children}</>
}

function RootLayout() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <DeploymentProvider>
          <QuerySetup>
            <div className="flex flex-col h-screen overflow-hidden">
              <DeploymentNotificationBar />
              <div className="flex flex-1 overflow-hidden">
            {/* Desktop Sidebar */}
            <div className="hidden lg:block">
              <Sidebar
                isCollapsed={sidebarCollapsed}
                onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
              />
            </div>

            {/* Mobile Sidebar Overlay */}
            {mobileMenuOpen && (
              <div className="fixed inset-0 z-[100] lg:hidden">
                <div
                  className="absolute inset-0 bg-black/50"
                  onClick={() => setMobileMenuOpen(false)}
                />
                <div className="absolute left-0 top-0 h-full">
                  <Sidebar />
                </div>
              </div>
            )}

            {/* Main Content */}
            <div className="flex flex-1 flex-col overflow-hidden">
              {/* Mobile menu button */}
              <div className="lg:hidden border-b border-border bg-background">
                <button
                  onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                  className="p-4 hover:bg-accent"
                >
                  <span className="text-xl">☰</span>
                </button>
              </div>
              
              <main className="flex-1 overflow-auto bg-muted/30 p-6">
                <Outlet />
              </main>
            </div>
              </div>
            </div>
        </QuerySetup>
        </DeploymentProvider>
      </ToastProvider>
    </QueryClientProvider>
  )
}