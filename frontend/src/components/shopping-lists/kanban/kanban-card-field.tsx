/**
 * KanbanCardField -- inline-edit primitive for Kanban card fields.
 *
 * Implements the hover-border / click-to-edit / blur-or-Enter-saves / Escape-reverts
 * pattern described in the Kanban redesign plan (section 5, "Inline Edit Field").
 *
 * Usage:
 *   <KanbanCardField
 *     formId="KanbanCard:needed"
 *     value={line.needed}
 *     onSave={handleSave}
 *     type="number"
 *     min={1}
 *     testId="shopping-lists.kanban.card.42.field.needed"
 *   />
 *
 * States: display -> editing -> saving -> display
 */
import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { cn } from '@/lib/utils';
import {
  trackFormSubmit,
  trackFormSuccess,
  trackFormError,
} from '@/lib/test/form-instrumentation';

type KanbanCardFieldType = 'number' | 'text';

interface KanbanCardFieldProps {
  /** Instrumentation form ID, e.g. "KanbanCard:needed". */
  formId: string;
  /** Current persisted value shown in display mode. */
  value: string | number;
  /** Callback invoked with the new value on blur/Enter. Must reject/throw on failure. */
  onSave: (nextValue: string | number) => Promise<void>;
  /** Input type determines parsing and validation rules. */
  type?: KanbanCardFieldType;
  /** For type="number": minimum accepted value (inclusive). Defaults to 0. */
  min?: number;
  /** For type="text": maximum character count. Defaults to 500. */
  maxLength?: number;
  /** Playwright test ID for the field wrapper. */
  testId?: string;
  /** When true, the field is read-only (no edit affordance). */
  readOnly?: boolean;
  /** When true, display "\u2014" instead of 0 for number fields. */
  showDashForZero?: boolean;
  /** Additional instrumentation metadata passed with form events. */
  metadata?: Record<string, unknown>;
  /** Extra CSS class names for the display wrapper. */
  className?: string;
  /** Render the display value with custom styling (e.g. amber for partial ordered). */
  displayClassName?: string;
  /** Optional suffix rendered after the display value (e.g. unit label). */
  suffix?: string;
  /** When true, use a textarea instead of input (for note fields). */
  multiline?: boolean;
  /** Placeholder text for the input when editing. */
  placeholder?: string;
}

export function KanbanCardField({
  formId,
  value,
  onSave,
  type = 'text',
  min = 0,
  maxLength = 500,
  testId,
  readOnly = false,
  showDashForZero = false,
  metadata,
  className,
  displayClassName,
  suffix,
  multiline = false,
  placeholder,
}: KanbanCardFieldProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editValue, setEditValue] = useState(String(value));
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);

  // Sync display value when the persisted value changes externally (e.g. cache update)
  useEffect(() => {
    if (!isEditing) {
      setEditValue(String(value));
    }
  }, [value, isEditing]);

  // Auto-focus and select content when entering edit mode
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const enterEditMode = useCallback(() => {
    if (readOnly || isSaving) return;
    setEditValue(String(value));
    setIsEditing(true);
  }, [readOnly, isSaving, value]);

  const cancelEdit = useCallback(() => {
    setEditValue(String(value));
    setIsEditing(false);
  }, [value]);

  const commitEdit = useCallback(async () => {
    // Parse and validate the edited value
    let parsed: string | number;
    if (type === 'number') {
      const numeric = Number(editValue);
      if (!Number.isFinite(numeric) || numeric < min) {
        // Invalid value -- revert silently
        cancelEdit();
        return;
      }
      parsed = numeric;
    } else {
      parsed = editValue;
      if (maxLength > 0 && parsed.length > maxLength) {
        parsed = parsed.slice(0, maxLength);
      }
    }

    // No change from current value -- just exit edit mode
    if (String(parsed) === String(value)) {
      setIsEditing(false);
      return;
    }

    setIsSaving(true);
    const eventFields = { ...metadata, field: formId, value: parsed };
    trackFormSubmit(formId, eventFields);

    try {
      await onSave(parsed);
      trackFormSuccess(formId, eventFields);
      setIsEditing(false);
    } catch {
      // Revert to persisted value on failure -- toast is handled by the caller
      trackFormError(formId, eventFields);
      setEditValue(String(value));
      setIsEditing(false);
    } finally {
      setIsSaving(false);
    }
  }, [cancelEdit, editValue, formId, maxLength, metadata, min, onSave, type, value]);

  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      cancelEdit();
    } else if (event.key === 'Enter' && !multiline) {
      event.preventDefault();
      commitEdit();
    }
  }, [cancelEdit, commitEdit, multiline]);

  const handleBlur = useCallback(() => {
    commitEdit();
  }, [commitEdit]);

  // --- Display mode ---
  if (!isEditing) {
    const displayValue = type === 'number' && showDashForZero && (value === 0 || value === '0')
      ? '\u2014'
      : String(value);

    const isEmpty = displayValue === '' || displayValue === undefined;

    return (
      <div
        data-testid={testId}
        className={cn(
          'group/field relative',
          !readOnly && 'cursor-pointer',
          className,
        )}
        onClick={enterEditMode}
        role={readOnly ? undefined : 'button'}
        tabIndex={readOnly ? undefined : 0}
        onKeyDown={readOnly ? undefined : (event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            enterEditMode();
          }
        }}
      >
        <span
          className={cn(
            'inline-block rounded px-1 py-0.5 -mx-1 text-sm',
            // Hover border affordance (only when editable)
            !readOnly && 'group-hover/field:ring-1 group-hover/field:ring-primary/40',
            isEmpty ? 'text-slate-500 italic' : displayClassName,
          )}
        >
          {isEmpty ? (placeholder ?? '') : displayValue}
          {suffix && <span className="text-slate-400 ml-1">{suffix}</span>}
        </span>
      </div>
    );
  }

  // --- Edit mode ---
  const sharedInputClasses = cn(
    'rounded border border-input bg-background px-1 py-0.5 text-sm -mx-1 -my-0.25',
    type === 'number' ? 'w-[60px] text-right' : 'w-full',
    isSaving && 'opacity-50 cursor-wait',
  );

  if (multiline) {
    return (
      <div data-testid={testId} className={className}>
        <textarea
          ref={inputRef as React.RefObject<HTMLTextAreaElement>}
          className={cn(sharedInputClasses, 'min-h-[60px] resize-y')}
          value={editValue}
          onChange={(event) => setEditValue(event.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={handleBlur}
          maxLength={maxLength > 0 ? maxLength : undefined}
          disabled={isSaving}
          placeholder={placeholder}
        />
      </div>
    );
  }

  return (
    <div data-testid={testId} className={className}>
      <input
        ref={inputRef as React.RefObject<HTMLInputElement>}
        className={sharedInputClasses}
        type={type === 'number' ? 'number' : 'text'}
        value={editValue}
        onChange={(event) => setEditValue(event.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
        min={type === 'number' ? min : undefined}
        maxLength={type === 'text' && maxLength > 0 ? maxLength : undefined}
        disabled={isSaving}
        placeholder={placeholder}
      />
    </div>
  );
}
