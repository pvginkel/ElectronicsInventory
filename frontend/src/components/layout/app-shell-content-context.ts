import {
  createContext,
  createElement,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { DEFAULT_APP_SHELL_CONTENT_PADDING } from '@/constants/app-shell';

interface AppShellContentContextValue {
  contentPaddingClass: string;
  setContentPaddingClass: (paddingClass: string) => void;
}

const AppShellContentContext = createContext<AppShellContentContextValue | undefined>(undefined);

export function AppShellContentProvider({ children }: { children: ReactNode }) {
  const [contentPaddingClass, setContentPaddingClass] = useState(DEFAULT_APP_SHELL_CONTENT_PADDING);
  const value = useMemo<AppShellContentContextValue>(
    () => ({
      contentPaddingClass,
      setContentPaddingClass,
    }),
    [contentPaddingClass],
  );

  return createElement(AppShellContentContext.Provider, { value }, children);
}

export function useAppShellContentPadding(): AppShellContentContextValue {
  const context = useContext(AppShellContentContext);
  if (!context) {
    throw new Error('useAppShellContentPadding must be used within an AppShellContentProvider');
  }

  return context;
}
