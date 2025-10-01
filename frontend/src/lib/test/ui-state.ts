import type { UiStateTestEvent } from '@/types/test-events';
import { isTestMode } from '@/lib/config/test-mode';
import { emitTestEvent } from './event-emitter';

type UiStatePayload = Omit<UiStateTestEvent, 'timestamp'>;
type UiStateMetadata = Record<string, unknown> | undefined;

export function beginUiState(scope: string): void {
  if (!isTestMode()) {
    return;
  }

  const payload: UiStatePayload = {
    kind: 'ui_state',
    scope,
    phase: 'loading',
  };

  emitTestEvent(payload);
}

export function endUiState(scope: string, metadata?: UiStateMetadata): void {
  if (!isTestMode()) {
    return;
  }

  const payload: UiStatePayload = {
    kind: 'ui_state',
    scope,
    phase: 'ready',
    ...(metadata ? { metadata } : {}),
  };

  emitTestEvent(payload);
}
