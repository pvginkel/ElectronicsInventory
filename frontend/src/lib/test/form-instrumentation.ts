/**
 * Form instrumentation for test events
 * Provides utilities to track form lifecycle events
 */

import React from 'react';
import { emitTestEvent } from './event-emitter';
import { TestEventKind, type FormTestEvent } from '@/types/test-events';

/**
 * Generate a stable form ID based on component name and optional identifier
 */
export function generateFormId(componentName: string, identifier?: string): string {
  const baseId = componentName.toLowerCase().replace(/form$/, '');
  return identifier ? `${baseId}_${identifier}` : baseId;
}

/**
 * Track form open event
 */
export function trackFormOpen(formId: string, fields?: Record<string, unknown>): void {
  const formEvent: Omit<FormTestEvent, 'timestamp'> = {
    kind: TestEventKind.FORM,
    phase: 'open',
    formId,
    ...(fields && { fields }),
  };

  emitTestEvent(formEvent);
}

/**
 * Track form submit event
 */
export function trackFormSubmit(formId: string, fields?: Record<string, unknown>): void {
  const formEvent: Omit<FormTestEvent, 'timestamp'> = {
    kind: TestEventKind.FORM,
    phase: 'submit',
    formId,
    ...(fields && { fields }),
  };

  emitTestEvent(formEvent);
}

/**
 * Track form success event
 */
export function trackFormSuccess(formId: string, fields?: Record<string, unknown>): void {
  const formEvent: Omit<FormTestEvent, 'timestamp'> = {
    kind: TestEventKind.FORM,
    phase: 'success',
    formId,
    ...(fields && { fields }),
  };

  emitTestEvent(formEvent);
}

/**
 * Track form error event
 */
export function trackFormError(formId: string, fields?: Record<string, unknown>): void {
  const formEvent: Omit<FormTestEvent, 'timestamp'> = {
    kind: TestEventKind.FORM,
    phase: 'error',
    formId,
    ...(fields && { fields }),
  };

  emitTestEvent(formEvent);
}

/**
 * Higher-order component wrapper for form tracking
 * This is a utility function that can be used to wrap form components
 */
export function withFormTracking<T extends Record<string, any>>(
  Component: React.ComponentType<T>,
  formName: string
) {
  return function TrackedFormComponent(props: T) {
    const formId = generateFormId(formName);

    // Track form open on mount
    React.useEffect(() => {
      trackFormOpen(formId);
    }, [formId]);

    return React.createElement(Component, props);
  };
}