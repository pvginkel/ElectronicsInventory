import { useState, useCallback, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AIPartCleanupProgressStep } from './ai-part-cleanup-progress-step';
import { AIPartCleanupMergeStep } from './ai-part-cleanup-merge-step';
import { AIPartCleanupNoChangesStep } from './ai-part-cleanup-no-changes-step';
import { useAIPartCleanup } from '@/hooks/use-ai-part-cleanup';
import { useGetPartsByPartKey } from '@/lib/api/generated/hooks';
import { normalizeFieldValue } from '@/lib/utils/ai-parts';
import { cn } from '@/lib/utils';
import { isTestMode } from '@/lib/config/test-mode';
import { emitTestEvent } from '@/lib/test/event-emitter';
import type { components } from '@/lib/api/generated/types';
import type { CleanedPartData } from '@/types/ai-parts';

type PartResponse = components['schemas']['PartResponseSchema.1a46b79'];

type DialogStep = 'progress' | 'merge' | 'no-changes';

interface AIPartCleanupDialogProps {
  open: boolean;
  onClose: () => void;
  partId: string;
}

export function AIPartCleanupDialog({ open, onClose, partId }: AIPartCleanupDialogProps) {
  const [currentStep, setCurrentStep] = useState<DialogStep>('progress');

  // Fetch current part data for comparison
  const { data: currentPart } = useGetPartsByPartKey(
    { path: { part_key: partId } },
    { enabled: open && Boolean(partId) }
  );

  const {
    startCleanup,
    cancelCleanup,
    isCleaningUp,
    progress,
    result: cleanupResult,
    error: cleanupError
  } = useAIPartCleanup({
    onSuccess: (result) => {
      // Guidepost: Determine if there are any changes to show
      // Route to merge step if changes exist, otherwise no-changes step
      if (currentPart && result?.cleanedPart) {
        const hasChanges = checkForChanges(currentPart, result.cleanedPart);
        setCurrentStep(hasChanges ? 'merge' : 'no-changes');
      } else {
        setCurrentStep('merge'); // Fallback to merge
      }
    },
    onError: (error) => {
      console.error('Cleanup failed:', error);
      // Stay on progress step to show error
    }
  });

  // Helper to check if there are any changes
  const checkForChanges = useCallback((current: PartResponse, cleaned: CleanedPartData | null) => {
    if (!cleaned) return false;

    // Compare each field using normalizeFieldValue
    const fieldsToCompare = [
      { old: current.description, new: cleaned.description },
      { old: current.manufacturer_code, new: cleaned.manufacturerCode },
      { old: current.manufacturer, new: cleaned.manufacturer },
      { old: current.dimensions, new: cleaned.dimensions },
      { old: current.package, new: cleaned.package },
      { old: current.pin_count, new: cleaned.pinCount },
      { old: current.pin_pitch, new: cleaned.pinPitch },
      { old: current.mounting_type, new: cleaned.mountingType },
      { old: current.series, new: cleaned.series },
      { old: current.voltage_rating, new: cleaned.voltageRating },
      { old: current.input_voltage, new: cleaned.inputVoltage },
      { old: current.output_voltage, new: cleaned.outputVoltage },
      { old: current.product_page, new: cleaned.productPage },
      { old: current.seller_link, new: cleaned.sellerLink },
      { old: current.type?.name, new: cleaned.type },
      { old: current.seller?.name, new: cleaned.seller },
    ];

    for (const { old, new: newVal } of fieldsToCompare) {
      if (normalizeFieldValue(old) !== normalizeFieldValue(newVal)) {
        return true;
      }
    }

    // Check tags separately (array comparison)
    const oldTags = normalizeFieldValue(current.tags);
    const newTags = normalizeFieldValue(cleaned.tags);
    if (Array.isArray(oldTags) && Array.isArray(newTags)) {
      if (JSON.stringify(oldTags.sort()) !== JSON.stringify(newTags.sort())) {
        return true;
      }
    } else if (oldTags !== newTags) {
      return true;
    }

    return false;
  }, []);

  // Emit dialog opened event for testing
  useEffect(() => {
    if (open && isTestMode()) {
      const event: Omit<import('@/types/test-events').UiStateTestEvent, 'timestamp'> = {
        kind: 'ui_state',
        scope: 'parts.cleanup.dialog',
        phase: 'open',
        metadata: { partId }
      };
      emitTestEvent(event);
    }
  }, [open, partId]);

  // Start cleanup immediately when dialog opens
  // Guidepost: Use effect to trigger cleanup on open, state update is intentional
  // Note: Only depend on open and partId to avoid infinite loops from state changes
  useEffect(() => {
    if (open && partId) {
      // Reset to progress step and start cleanup
      setCurrentStep('progress');
      startCleanup(partId);
    } else if (!open) {
      // Reset state when dialog closes
      setCurrentStep('progress');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally exclude startCleanup to prevent re-triggering
  }, [open, partId]);

  // Separate effect for cleanup on unmount to avoid infinite loop
  useEffect(() => {
    return () => {
      // Cancel SSE subscription if component unmounts during cleanup
      cancelCleanup();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only run cleanup on unmount
  }, []);

  const handleCancelCleanup = useCallback(() => {
    cancelCleanup();
    onClose();
  }, [cancelCleanup, onClose]);

  const handleRetryCleanup = useCallback(() => {
    setCurrentStep('progress');
    startCleanup(partId);
  }, [partId, startCleanup]);

  const handleDialogClose = useCallback(() => {
    if (isCleaningUp) {
      cancelCleanup();
    }
    onClose();
  }, [isCleaningUp, cancelCleanup, onClose]);

  const handleApplySuccess = useCallback(() => {
    onClose();
  }, [onClose]);

  const renderCurrentStep = () => {
    switch (currentStep) {
      case 'progress':
        return (
          <AIPartCleanupProgressStep
            progress={progress}
            error={cleanupError}
            onCancel={handleCancelCleanup}
            onRetry={handleRetryCleanup}
          />
        );

      case 'merge':
        if (!currentPart || !cleanupResult?.cleanedPart) {
          // Fallback - should not happen
          setCurrentStep('progress');
          return null;
        }
        return (
          <AIPartCleanupMergeStep
            currentPart={currentPart}
            cleanedPart={cleanupResult.cleanedPart}
            onApplySuccess={handleApplySuccess}
            onCancel={onClose}
          />
        );

      case 'no-changes':
        return (
          <AIPartCleanupNoChangesStep onClose={onClose} />
        );

      default:
        return null;
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={handleDialogClose}
      className={cn(currentStep === 'merge' && "max-w-[1200px] w-[calc(100vw-60px)] h-[calc(100vh-60px)]")}
      contentProps={{
        'data-testid': 'parts.cleanup.dialog',
        'data-step': currentStep,
      } as React.ComponentPropsWithoutRef<'div'>}
    >
      <DialogContent
        className={cn(currentStep === 'merge' && "h-full flex flex-col")}
      >
        <DialogHeader className="sr-only">
          <DialogTitle>AI Part Cleanup</DialogTitle>
        </DialogHeader>
        {renderCurrentStep()}
      </DialogContent>
    </Dialog>
  );
}
