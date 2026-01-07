import { Button } from '@/components/ui/button';
import { ProgressBar } from '@/components/ui/progress-bar';
import { Card } from '@/components/ui/card';
import { IconBadge } from '@/components/ui';
import { AlertCircle, Loader2 } from 'lucide-react';

interface AIPartCleanupProgressStepProps {
  progress: {
    message: string;
    percentage?: number;
  } | null;
  error?: string | null;
  onCancel?: () => void;
  onRetry?: () => void;
}

export function AIPartCleanupProgressStep({
  progress,
  error,
  onCancel,
  onRetry
}: AIPartCleanupProgressStepProps) {
  if (error) {
    return (
      <div className="space-y-6" data-testid="parts.cleanup.progress" data-state="error">
        <div className="text-center">
          <h2 className="text-2xl font-semibold mb-2">
            Cleanup Failed
          </h2>
          <p className="text-muted-foreground">
            Something went wrong while cleaning up your part
          </p>
        </div>

        <div className="space-y-6" data-testid="parts.cleanup.progress.error">
          <div className="flex items-start gap-2">
            <AlertCircle className="h-6 w-6 text-destructive flex-shrink-0" />
            <p className="text-sm text-muted-foreground" data-testid="parts.cleanup.progress.error.message">{error}</p>
          </div>

          <div className="flex gap-3 justify-end">
            {onCancel && (
              <Button variant="outline" onClick={onCancel}>
                Cancel
              </Button>
            )}
            {onRetry && (
              <Button onClick={onRetry}>
                Retry Cleanup
              </Button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="parts.cleanup.progress" data-state="running">
      <div className="text-center">
        <h2 className="text-2xl font-semibold mb-2">Cleaning Up Part</h2>
        <p className="text-muted-foreground">
          AI is analyzing your part data and suggesting improvements
        </p>
      </div>

      <Card className="p-6" data-testid="parts.cleanup.progress-card">
        <div className="space-y-6">
          {/* Progress Animation */}
          <div className="flex justify-center">
            <IconBadge size="xl" variant="primary">
              <Loader2 className="h-8 w-8 animate-spin" />
            </IconBadge>
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
            <p className="text-sm font-medium" data-testid="parts.cleanup.progress-message">
              {progress?.message || 'Starting cleanup...'}
            </p>
          </div>

          {/* Cancel Button */}
          {onCancel && (
            <div className="flex justify-center">
              <Button variant="outline" onClick={onCancel}>
                Cancel Cleanup
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
            <p>• Checking for incomplete or missing fields</p>
            <p>• Standardizing formats and conventions</p>
            <p>• Suggesting improvements to part data</p>
          </div>
        </div>
      </Card>
    </div>
  );
}
