import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { CheckCircle2 } from 'lucide-react';

interface AIPartCleanupNoChangesStepProps {
  onClose: () => void;
}

export function AIPartCleanupNoChangesStep({ onClose }: AIPartCleanupNoChangesStepProps) {
  return (
    <div className="space-y-6" data-testid="parts.cleanup.no-changes">
      <div className="text-center">
        <h2 className="text-2xl font-semibold mb-2">No Improvements Found</h2>
        <p className="text-muted-foreground">
          Your part data is already clean!
        </p>
      </div>

      <Card className="p-8">
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="rounded-full bg-green-100 dark:bg-green-900/20 p-4">
            <CheckCircle2 className="h-12 w-12 text-green-600 dark:text-green-500" />
          </div>
          <div className="space-y-2">
            <h3 className="text-lg font-medium">Great Job!</h3>
            <p className="text-sm text-muted-foreground max-w-md">
              The AI couldn't find any fields that need improvement. Your part information is complete and properly formatted.
            </p>
          </div>
        </div>
      </Card>

      <div className="flex justify-center">
        <Button onClick={onClose} data-testid="parts.cleanup.no-changes.close">
          Close
        </Button>
      </div>
    </div>
  );
}
