import { useState, useCallback, useEffect } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { AIPartInputStep } from './ai-part-input-step';
import { AIPartProgressStep } from './ai-part-progress-step';
import { AIPartReviewStep } from './ai-part-review-step';
import { useAIPartAnalysis } from '@/hooks/use-ai-part-analysis';
import { transformToCreateSchema } from '@/lib/utils/ai-parts';
import { usePostAiPartsCreate } from '@/lib/api/generated/hooks';

type DialogStep = 'input' | 'progress' | 'review';

interface AIPartDialogProps {
  open: boolean;
  onClose: () => void;
  onPartCreated?: (partId: string, createAnother: boolean) => void;
}

export function AIPartDialog({ open, onClose, onPartCreated }: AIPartDialogProps) {
  const [currentStep, setCurrentStep] = useState<DialogStep>('input');
  const [isCreatingPart, setIsCreatingPart] = useState(false);
  const [lastSearchText, setLastSearchText] = useState<string>('');

  const createPartMutation = usePostAiPartsCreate();

  const {
    analyzePartFromData,
    cancelAnalysis,
    isAnalyzing,
    progress,
    result: analysisResult,
    error: analysisError
  } = useAIPartAnalysis({
    onSuccess: () => {
      setCurrentStep('review');
    },
    onError: (error) => {
      console.error('Analysis failed:', error);
      // Stay on progress step to show error
    }
  });

  // Reset state when dialog opens/closes
  useEffect(() => {
    if (open) {
      setCurrentStep('input');
      setIsCreatingPart(false);
    } else {
      // Clear search text when dialog is closed
      setLastSearchText('');
    }
  }, [open]);

  const handleInputSubmit = useCallback((data: { text: string }) => {
    setLastSearchText(data.text);
    setCurrentStep('progress');
    analyzePartFromData(data);
  }, [analyzePartFromData]);

  const handleCancelAnalysis = useCallback(() => {
    cancelAnalysis();
    setCurrentStep('input');
  }, [cancelAnalysis]);

  const handleRetryAnalysis = useCallback(() => {
    setCurrentStep('input');
  }, []);

  const handleCreatePart = useCallback(async (
    createData: ReturnType<typeof transformToCreateSchema>, 
    createAnother: boolean
  ) => {
    if (isCreatingPart) return;

    try {
      setIsCreatingPart(true);
      
      const createdPart = await createPartMutation.mutateAsync({
        body: createData
      });
      
      const partId = createdPart.key;

      if (createAnother) {
        // Reset to input step for another part, keep search text
        setCurrentStep('input');
        onPartCreated?.(partId, true);
      } else {
        // Close dialog and navigate, clear search text
        setLastSearchText('');
        onClose();
        onPartCreated?.(partId, false);
      }
    } catch (error) {
      console.error('Failed to create part:', error);
      // Error handling is automatic per architecture
    } finally {
      setIsCreatingPart(false);
    }
  }, [isCreatingPart, onClose, onPartCreated, createPartMutation]);

  const handleBackToInput = useCallback(() => {
    setCurrentStep('input');
  }, []);

  const handleDialogClose = useCallback(() => {
    if (isAnalyzing) {
      cancelAnalysis();
    }
    onClose();
  }, [isAnalyzing, cancelAnalysis, onClose]);

  const renderCurrentStep = () => {
    switch (currentStep) {
      case 'input':
        return (
          <AIPartInputStep
            onSubmit={handleInputSubmit}
            isLoading={false}
            initialText={lastSearchText}
          />
        );
        
      case 'progress':
        return (
          <AIPartProgressStep
            progress={progress}
            error={analysisError}
            onCancel={handleCancelAnalysis}
            onRetry={handleRetryAnalysis}
          />
        );
        
      case 'review':
        if (!analysisResult) {
          // Fallback - should not happen
          setCurrentStep('input');
          return null;
        }
        return (
          <AIPartReviewStep
            analysisResult={analysisResult}
            onCreatePart={handleCreatePart}
            onBack={handleBackToInput}
            isCreating={isCreatingPart}
          />
        );
        
      default:
        return null;
    }
  };

  const isReviewStep = currentStep === 'review';
  
  return (
    <Dialog 
      open={open} 
      onOpenChange={handleDialogClose} 
      className={isReviewStep ? "w-[calc(100vw-60px)] h-[calc(100vh-60px)] max-w-none max-h m-[30px]" : undefined}
    >
      <DialogContent className={isReviewStep ? "h-full flex flex-col" : ""}>
        {renderCurrentStep()}
      </DialogContent>
    </Dialog>
  );
}