import { useState } from 'react';

/**
 * A key that changes each time a dialog opens.
 *
 * Rendering a dialog's body under this key gives every opening a fresh mount, so its form and
 * local state start from their initial values instead of being reset in an effect. The key does
 * not change on close, so the closing animation still shows the content the user saw.
 */
export function useDialogSessionKey(open: boolean): number {
  const [session, setSession] = useState({ open, key: 0 });

  // Guidepost: adjust state while rendering the open transition, not in an effect
  if (session.open !== open) {
    setSession({ open, key: open ? session.key + 1 : session.key });
  }

  return session.key;
}
