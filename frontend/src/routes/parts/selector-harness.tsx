import { useState, type FormEvent } from 'react';
import { createFileRoute, redirect } from '@tanstack/react-router';
import { Button } from '@/components/ui/button';
import { PartSelector } from '@/components/parts/part-selector';
import { generateFormId } from '@/lib/test/form-instrumentation';
import { useFormInstrumentation } from '@/hooks/use-form-instrumentation';
import { isTestMode } from '@/lib/config/test-mode';

const harnessFormId = generateFormId('PartSelectorHarnessForm', 'submit');

export const Route = createFileRoute('/parts/selector-harness')({
  beforeLoad: () => {
    if (!isTestMode()) {
      throw redirect({ to: '/parts' });
    }
  },
  component: PartSelectorHarness,
});

function PartSelectorHarness() {
  const [selectedPartId, setSelectedPartId] = useState<string | undefined>();
  const [submittedPartId, setSubmittedPartId] = useState<string | undefined>();

  const instrumentation = useFormInstrumentation({
    formId: harnessFormId,
    isOpen: true,
    snapshotFields: () => ({
      selectedPartId,
    }),
  });

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    instrumentation.trackSubmit({ selectedPartId });

    if (!selectedPartId) {
      instrumentation.trackError({ selectedPartId });
      return;
    }

    instrumentation.trackSuccess({ selectedPartId });
    setSubmittedPartId(selectedPartId);
  };

  return (
    <div className="space-y-6 p-6" data-testid="parts.selector.harness">
      <div>
        <h1 className="text-2xl font-semibold">Part Selector Harness</h1>
        <p className="text-sm text-muted-foreground">
          Use this harness to validate the part selector with real backend data.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4" data-testid={`${harnessFormId}.form`}>
        <PartSelector value={selectedPartId} onChange={setSelectedPartId} />

        <Button type="submit" data-testid={`${harnessFormId}.submit`}>
          Submit Selection
        </Button>
      </form>

      <div className="text-sm text-muted-foreground" data-testid="parts.selector.harness.submission">
        Submitted Part Key: {submittedPartId ?? 'None'}
      </div>
    </div>
  );
}
