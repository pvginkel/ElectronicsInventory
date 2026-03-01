import * as React from 'react';
import { Copy, Check } from 'lucide-react';
import { Badge } from './badge';
import { cn } from '@/lib/utils';

// Subtle color palette for metric and attribute badges
const COLOR_CLASSES = {
  neutral: 'bg-slate-100 text-slate-700',
  info: 'bg-blue-100 text-blue-800',
  warning: 'bg-amber-100 text-amber-800',
  success: 'bg-emerald-100 text-emerald-800',
  danger: 'bg-rose-100 text-rose-800',
} as const;

export interface KeyValueBadgeProps {
  /** Badge label (appears before colon) */
  label: string;
  /** Badge value (appears after colon) */
  value: string | number;
  /** Semantic color (defaults to neutral) */
  color?: keyof typeof COLOR_CLASSES;
  /** Test ID for Playwright selectors */
  testId: string;
  /** When provided, clicking the badge copies this value to clipboard */
  copyValue?: string;
}

/**
 * KeyValueBadge — Standardized badge for displaying metrics and attributes
 *
 * Renders badges in `<key>: <value>` format with consistent semantic colors.
 * When `copyValue` is provided, hovering reveals a copy icon and clicking
 * copies the value to the clipboard (following the same pattern as LinkChip).
 *
 * @example
 * <KeyValueBadge label="Total lines" value={42} color="neutral" testId="pick-lists.detail.badge.total-lines" />
 * <KeyValueBadge label="Key" value="ABCD" copyValue="ABCD" color="neutral" testId="parts.detail.metadata.key" />
 */
export const KeyValueBadge = React.forwardRef<HTMLSpanElement, KeyValueBadgeProps>(
  ({ label, value, color = 'neutral', testId, copyValue }, ref) => {
    const colorClasses = COLOR_CLASSES[color];
    const [copied, setCopied] = React.useState(false);

    const handleCopy = React.useCallback(
      (event: React.MouseEvent<HTMLButtonElement>) => {
        event.stopPropagation();
        if (!copyValue) {
          return;
        }
        void navigator.clipboard.writeText(copyValue).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        });
      },
      [copyValue],
    );

    if (!copyValue) {
      return (
        <Badge
          ref={ref}
          variant="outline"
          className={cn(colorClasses, 'px-3 py-1 text-xs')}
          data-testid={testId}
        >
          {label}: {value}
        </Badge>
      );
    }

    // Guidepost: Copyable variant — group container expands right padding on hover
    // to accommodate the copy button, matching the LinkChip unlink pattern.
    return (
      <span
        className={cn(
          'group relative inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold transition-all cursor-pointer',
          'hover:pr-8',
          colorClasses,
        )}
        data-testid={testId}
      >
        <span ref={ref}>
          {label}: {value}
        </span>
        <button
          type="button"
          onClick={handleCopy}
          className={cn(
            'absolute right-1.5 top-1/2 -translate-y-1/2 flex h-5 w-5 items-center justify-center rounded-full cursor-pointer',
            'text-current opacity-0 transition-opacity duration-200 group-hover:opacity-70 hover:!opacity-100',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:opacity-100',
          )}
          aria-label={`Copy ${label}`}
          data-testid={`${testId}.copy`}
        >
          {copied ? (
            <Check className="h-3 w-3" aria-hidden="true" />
          ) : (
            <Copy className="h-3 w-3" aria-hidden="true" />
          )}
        </button>
      </span>
    );
  },
);

KeyValueBadge.displayName = 'KeyValueBadge';
