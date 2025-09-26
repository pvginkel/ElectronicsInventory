import { Button } from '@/components/ui/button';
import { ProgressBar } from '@/components/ui/progress-bar';
import { Card } from '@/components/ui/card';
import { Loader2, X } from 'lucide-react';

interface AIPartProgressStepProps {
  progress: {
    message: string;
    percentage?: number;
  } | null;
  error?: string | null;
  onCancel?: () => void;
  onRetry?: () => void;
}

export function AIPartProgressStep({ 
  progress, 
  error, 
  onCancel, 
  onRetry 
}: AIPartProgressStepProps) {
  if (error) {
    return (
      <div className="space-y-6" data-testid="parts.ai.progress-step" data-state="error">
        <div className="text-center">
          <h2 className="text-2xl font-semibold mb-2">Analysis Failed</h2>
          <p className="text-muted-foreground">
            Something went wrong while analyzing your part
          </p>
        </div>

        <Card className="p-6" data-testid="parts.ai.progress-error">
          <div className="text-center space-y-4">
            <div className="w-16 h-16 mx-auto bg-destructive/10 rounded-full flex items-center justify-center">
              <X className="h-8 w-8 text-destructive" />
            </div>
            
            <div>
              <h3 className="text-lg font-medium mb-2">Analysis Error</h3>
              <p className="text-sm text-muted-foreground" data-testid="parts.ai.progress-error-message">{error}</p>
            </div>
            
            <div className="flex gap-3 justify-center">
              {onRetry && (
                <Button onClick={onRetry}>
                  Try Again
                </Button>
              )}
              {onCancel && (
                <Button variant="outline" onClick={onCancel}>
                  Cancel
                </Button>
              )}
            </div>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="parts.ai.progress-step" data-state="running">
      <div className="text-center">
        <h2 className="text-2xl font-semibold mb-2">Analyzing Part</h2>
        <p className="text-muted-foreground">
          AI is analyzing your input and fetching documentation
        </p>
      </div>

      <Card className="p-6" data-testid="parts.ai.progress-card">
        <div className="space-y-6">
          {/* Progress Animation */}
          <div className="flex justify-center">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
              <Loader2 className="h-8 w-8 text-primary animate-spin" />
            </div>
          </div>

          {/* Progress Bar */}
          {progress?.percentage !== undefined && (
            <div className="space-y-2">
              <ProgressBar value={progress.percentage * 100} className="w-full" />
              <p className="text-center text-sm text-muted-foreground">
                {Math.round(progress.percentage * 100)}% complete
              </p>
            </div>
          )}

          {/* Progress Message */}
          <div className="text-center">
            <p className="text-sm font-medium" data-testid="parts.ai.progress-message">
              {progress?.message || 'Starting analysis...'}
            </p>
          </div>

          {/* Cancel Button */}
          {onCancel && (
            <div className="flex justify-center">
              <Button variant="outline" onClick={onCancel}>
                Cancel Analysis
              </Button>
            </div>
          )}
        </div>
      </Card>

      {/* Tips */}
      <Card className="p-4 bg-muted/30">
        <div className="text-center space-y-2">
          <h4 className="text-sm font-medium">What's happening?</h4>
          <div className="text-xs text-muted-foreground space-y-1">
            <p>• Analyzing text and images for part identification</p>
            <p>• Searching for datasheets and documentation</p>
            <p>• Generating part specifications and tags</p>
          </div>
        </div>
      </Card>
    </div>
  );
}
