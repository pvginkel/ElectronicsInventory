/**
 * Router instrumentation for test events
 * Hooks into TanStack Router to emit navigation events
 */

import type { AnyRouter } from '@tanstack/react-router';
import { emitTestEvent } from './event-emitter';
import { TestEventKind, type RouteTestEvent } from '@/types/test-events';

/**
 * Setup router instrumentation to emit TEST_EVT:route events
 */
export function setupRouterInstrumentation(router: AnyRouter): () => void {
  let currentPath = window.location.pathname + window.location.search;

  // Use a simple polling approach to detect navigation changes
  const checkNavigation = () => {
    const newPath = window.location.pathname + window.location.search;

    if (newPath !== currentPath) {
      const routeEvent: Omit<RouteTestEvent, 'timestamp'> = {
        kind: TestEventKind.ROUTE,
        from: currentPath,
        to: newPath,
        params: (router.state.location as any).params || {},
      };
      emitTestEvent(routeEvent);

      currentPath = newPath;
    }
  };

  // Use MutationObserver and interval to detect navigation changes
  let intervalId: NodeJS.Timeout;

  // Start checking for navigation changes
  intervalId = setInterval(checkNavigation, 100);

  // Also listen to popstate for back/forward navigation
  const handlePopState = () => {
    setTimeout(checkNavigation, 10);
  };

  window.addEventListener('popstate', handlePopState);

  // Return cleanup function
  return () => {
    clearInterval(intervalId);
    window.removeEventListener('popstate', handlePopState);
  };
}