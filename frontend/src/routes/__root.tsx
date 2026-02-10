/**
 * Root layout component.
 * Integrates authentication, top bar, sidebar navigation, and all providers.
 *
 * Provider ordering:
 * 1. QueryClientProvider - enables data fetching
 * 2. ToastProvider - enables toast notifications
 * 3. AuthProvider - provides auth state and instrumentation
 * 4. AuthGate - blocks rendering until authenticated
 * 5. SseContextProvider - SSE connections (guarded by auth)
 * 6. DeploymentProvider - deployment version tracking
 * 7. QuerySetup - wires toast function to query client
 */

import { useState, useEffect, type ReactNode } from 'react';
import { createRootRoute, Outlet } from '@tanstack/react-router';
import { QueryClientProvider } from '@tanstack/react-query';
import { Sidebar } from '@/components/layout/sidebar';
import { TopBar } from '@/components/layout/top-bar';
import { ToastProvider } from '@/contexts/toast-context';
import { AuthProvider } from '@/contexts/auth-context';
import { AuthGate } from '@/components/auth/auth-gate';
import { SseContextProvider } from '@/contexts/sse-context-provider';
import { DeploymentProvider } from '@/contexts/deployment-context';
import { DeploymentNotificationBar } from '@/components/ui/deployment-notification-bar';
import { queryClient, setToastFunction } from '@/lib/query-client';
import { useToast } from '@/hooks/use-toast';

export const Route = createRootRoute({
  component: RootLayout,
});

function QuerySetup({ children }: { children: ReactNode }) {
  const { showError, showException } = useToast();

  useEffect(() => {
    setToastFunction((message, error) => {
      if (error !== undefined) {
        showException(message, error);
        return;
      }
      showError(message);
    });
  }, [showError, showException]);

  return <>{children}</>;
}

function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <AuthProvider>
          <AuthGate>
            <SseContextProvider>
              <DeploymentProvider>
                <QuerySetup>
                  <AppShellFrame />
                </QuerySetup>
              </DeploymentProvider>
            </SseContextProvider>
          </AuthGate>
        </AuthProvider>
      </ToastProvider>
    </QueryClientProvider>
  );
}

/**
 * App shell with top bar, sidebar, and main content area.
 * Handles responsive layout with mobile overlay menu.
 */
function AppShellFrame() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const toggleSidebar = () => {
    setSidebarCollapsed((prev) => !prev);
  };

  const toggleMobileMenu = () => {
    setMobileMenuOpen((prev) => !prev);
  };

  const handleNavigation = () => {
    setMobileMenuOpen(false);
  };

  // Determine which toggle to use based on viewport width.
  // On mobile (< lg breakpoint), toggle the mobile menu overlay.
  // On desktop (>= lg breakpoint), toggle the sidebar collapse state.
  const handleMenuToggle = () => {
    const isMobile = window.innerWidth < 1024;
    if (isMobile) {
      toggleMobileMenu();
    } else {
      toggleSidebar();
    }
  };

  return (
    <div
      className="flex h-screen flex-col overflow-hidden"
      data-testid="app-shell.root"
      data-mobile-menu-state={mobileMenuOpen ? 'open' : 'closed'}
    >
      {/* Deployment bar sits above everything */}
      <DeploymentNotificationBar />

      {/* Top bar - single instance, always visible */}
      <TopBar onMenuToggle={handleMenuToggle} />

      {/* Content area with sidebar */}
      <div className="flex flex-1 overflow-hidden" data-testid="app-shell.layout">
        {/* Desktop sidebar */}
        <div className="hidden lg:block" data-testid="app-shell.sidebar.desktop">
          <Sidebar
            isCollapsed={sidebarCollapsed}
            onNavigate={handleNavigation}
            variant="desktop"
          />
        </div>

        {/* Mobile overlay menu */}
        {mobileMenuOpen && (
          <div className="fixed inset-0 z-[100] lg:hidden" data-testid="app-shell.mobile-overlay">
            {/* Backdrop - clicking dismisses menu */}
            <div
              className="absolute inset-0 bg-black/50"
              data-testid="app-shell.mobile-overlay.dismiss"
              onClick={() => setMobileMenuOpen(false)}
            />
            {/* Mobile sidebar container */}
            <div
              className="absolute left-0 top-0 h-full"
              id="app-shell-mobile-menu"
              data-testid="app-shell.sidebar.mobile"
            >
              <Sidebar onNavigate={handleNavigation} variant="mobile" />
            </div>
          </div>
        )}

        {/* Main content */}
        <main
          className="flex-1 overflow-auto"
          data-testid="app-shell.content"
        >
          <Outlet />
        </main>
      </div>
    </div>
  );
}
