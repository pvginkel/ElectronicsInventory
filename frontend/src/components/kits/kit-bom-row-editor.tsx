import { useCallback } from 'react';
import { Loader2 } from 'lucide-react';
import { PartSelector } from '@/components/parts/part-selector';
import { PartInlineSummary } from '@/components/parts/part-inline-summary';
import { Alert } from '@/components/ui';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import type { PartSelectorSummary } from '@/hooks/use-parts-selector';
import type {
  CreateDraft,
  CreateErrors,
  UpdateDraft,
  UpdateErrors,
} from '@/hooks/use-kit-contents';

type EditorMode = 'create' | 'edit';

interface KitBOMRowEditorSharedProps {
  mode: EditorMode;
  draft: CreateDraft | UpdateDraft;
  errors: (CreateErrors | UpdateErrors) | null;
  isSubmitting: boolean;
  onSubmit: () => Promise<void>;
  onCancel: () => void;
  onRequiredPerUnitChange: (value: string) => void;
  onNoteChange: (value: string) => void;
  existingPartKeys: string[];
  includePartKey?: string;
  disabled?: boolean;
  rowId?: number;
}

interface KitBOMRowEditorCreateProps extends KitBOMRowEditorSharedProps {
  mode: 'create';
  draft: CreateDraft;
  onPartSelectionChange: (summary: PartSelectorSummary | undefined) => void;
  partSummary?: {
    key: string;
    description: string;
    manufacturerCode: string | null;
    coverUrl: string | null;
  };
}

interface KitBOMRowEditorEditProps extends KitBOMRowEditorSharedProps {
  mode: 'edit';
  draft: UpdateDraft;
  partSummary: {
    key: string;
    description: string;
    manufacturerCode: string | null;
    coverUrl: string | null;
  };
  onPartSelectionChange?: never;
}

export type KitBOMRowEditorProps = KitBOMRowEditorCreateProps | KitBOMRowEditorEditProps;

export function KitBOMRowEditor(props: KitBOMRowEditorProps) {
  const {
    mode,
    draft,
    errors,
    isSubmitting,
    onSubmit,
    onCancel,
    onRequiredPerUnitChange,
    onNoteChange,
    existingPartKeys,
    includePartKey,
    disabled = false,
    rowId,
  } = props;

  const createProps = mode === 'create' ? props : null;
  const createDraft = mode === 'create' ? (draft as CreateDraft) : null;

  const baseTestId = mode === 'create'
    ? 'kits.detail.table.editor.create'
    : `kits.detail.table.editor.edit.${rowId ?? 'active'}`;

  const quantityTestId = `${baseTestId}.quantity`;
  const noteTestId = `${baseTestId}.note`;
  const submitTestId = `${baseTestId}.submit`;
  const cancelTestId = `${baseTestId}.cancel`;

  const partError = errors && 'partKey' in errors ? errors.partKey : undefined;
  const quantityError = errors?.requiredPerUnit;
  const noteError = errors?.note;
  const conflictMessage = errors && 'conflict' in errors ? errors.conflict : undefined;
  const formMessage = errors?.form ?? conflictMessage;
  const textareaClasses =
    'flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50';

  const handleSubmit = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (disabled || isSubmitting) {
        return;
      }
      await onSubmit();
    },
    [disabled, isSubmitting, onSubmit]
  );

  const handleQuantityChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    onRequiredPerUnitChange(event.target.value);
  };

  const handleNoteChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    onNoteChange(event.target.value);
  };

  const handlePartChange = useCallback(
    (value: string | undefined) => {
      if (!createProps) {
        return;
      }
      if (!value) {
        createProps.onPartSelectionChange(undefined);
        return;
      }
      const fallbackSummary = {
        id: value,
        partId: null,
        displayId: value,
        displayDescription: createDraft?.partLabel ?? value,
        displayManufacturerCode: undefined,
        typeName: undefined,
        manufacturer: undefined,
        coverUrl: null,
      } satisfies PartSelectorSummary;
      createProps.onPartSelectionChange(fallbackSummary);
    },
    [createDraft?.partLabel, createProps]
  );

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-4"
      data-testid={baseTestId}
    >
      {mode === 'create' ? (
        <PartSelector
          value={createDraft?.partKey}
          onChange={handlePartChange}
          onSelectSummary={createProps?.onPartSelectionChange}
          placeholder="Search for a part to add..."
          error={partError}
          excludePartKeys={existingPartKeys}
          includePartKeys={includePartKey ? [includePartKey] : undefined}
          data-testid={`${baseTestId}.part`}
        />
      ) : (
        <div className="rounded border border-dashed border-border/70 bg-muted/30 px-4 py-3">
          <Label className="text-xs uppercase tracking-wide text-muted-foreground">Part</Label>
          <PartInlineSummary
            partKey={props.partSummary.key}
            description={props.partSummary.description}
            manufacturerCode={props.partSummary.manufacturerCode}
            coverUrl={props.partSummary.coverUrl}
            testId={`${baseTestId}.part`}
          />
        </div>
      )}

      <div
        className={cn(
          'grid gap-4',
          mode === 'create' ? 'md:grid-cols-[minmax(10rem,16rem)_1fr]' : 'md:grid-cols-[minmax(10rem,16rem)_1fr]'
        )}
      >
        <div className="space-y-2">
          <Label htmlFor={quantityTestId}>Required per kit</Label>
          <Input
            id={quantityTestId}
            type="number"
            min={1}
            step={1}
            value={draft.requiredPerUnit}
            onChange={handleQuantityChange}
            disabled={disabled || isSubmitting}
            inputMode="numeric"
            data-testid={quantityTestId}
          />
          {quantityError ? (
            <p className="text-sm text-destructive">{quantityError}</p>
          ) : null}
        </div>

        <div className="space-y-2">
          <Label htmlFor={noteTestId}>Note (optional)</Label>
          <textarea
            id={noteTestId}
            value={draft.note}
            onChange={handleNoteChange}
            disabled={disabled || isSubmitting}
            rows={mode === 'create' ? 3 : 4}
            className={cn('resize-y', textareaClasses)}
            data-testid={noteTestId}
          />
          {noteError ? (
            <p className="text-sm text-destructive">{noteError}</p>
          ) : null}
        </div>
      </div>

      {formMessage ? (
        <Alert variant="error" icon={true} testId="kits.detail.bom.row-editor.error">
          {formMessage}
        </Alert>
      ) : null}

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={isSubmitting}
          data-testid={cancelTestId}
        >
          Cancel
        </Button>
        <Button
          type="submit"
          disabled={disabled || isSubmitting}
          data-testid={submitTestId}
        >
          {isSubmitting ? (
            <span className="inline-flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              Saving…
            </span>
          ) : mode === 'create' ? (
            'Add part'
          ) : (
            'Save changes'
          )}
        </Button>
      </div>
    </form>
  );
}
