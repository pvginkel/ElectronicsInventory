import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { ListCreateDialog } from '@/components/shopping-lists/list-create-dialog';
import {
  useShoppingListOptions,
  type UseShoppingListOptionsParams,
} from '@/hooks/use-shopping-lists';
import { useToast } from '@/hooks/use-toast';
import { useListLoadingInstrumentation } from '@/lib/test/query-instrumentation';
import type { ShoppingListOption, ShoppingListStatus } from '@/types/shopping-lists';

type SelectorInputProps = Record<string, unknown>;

interface ShoppingListSelectorInstrumentation {
  scope: string;
  getReadyMetadata?: (context: { options: ShoppingListOption[]; searchTerm: string; statuses: ShoppingListStatus[] }) => Record<string, unknown> | undefined;
  getErrorMetadata?: (error: unknown) => Record<string, unknown> | undefined;
  getAbortedMetadata?: () => Record<string, unknown> | undefined;
}

interface ShoppingListSelectorProps extends Pick<UseShoppingListOptionsParams, 'statuses'> {
  value?: number;
  onChange: (value: number | undefined) => void;
  onTouched?: () => void;
  enableCreate?: boolean;
  enabled?: boolean;
  instrumentation: ShoppingListSelectorInstrumentation;
  placeholder?: string;
  error?: string;
  className?: string;
  disabled?: boolean;
  inputProps?: SelectorInputProps;
  onListCreated?: (payload: { id: number; name: string }) => void;
  onPopoverWheelCapture?: (event: React.WheelEvent<HTMLDivElement>) => void;
  emptyState?: ReactNode;
}

const statusLabel: Record<ShoppingListStatus, string> = {
  concept: 'Concept list',
  ready: 'Ready list',
  done: 'Completed list',
};

function formatOptionMetadata(option: ShoppingListOption): string {
  const totalLines = option.lineCounts.new + option.lineCounts.ordered + option.lineCounts.done;
  const totalLabel = totalLines === 0
    ? 'Empty list'
    : `${totalLines} item${totalLines === 1 ? '' : 's'}`;
  return `${totalLabel} · ${statusLabel[option.status]}`;
}

export function ShoppingListSelector({
  value,
  onChange,
  statuses,
  enableCreate = true,
  enabled = true,
  instrumentation,
  placeholder = 'Search shopping lists...',
  error: fieldError,
  className,
  disabled,
  inputProps,
  onListCreated,
  onPopoverWheelCapture,
  emptyState,
  onTouched,
}: ShoppingListSelectorProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [pendingCreatedOption, setPendingCreatedOption] = useState<ShoppingListOption | null>(null);

  const {
    options: queryOptions,
    statuses: normalizedStatuses,
    isLoading,
    isFetching,
    error: loadError,
    refetch,
  } = useShoppingListOptions({ statuses, enabled });

  const { showException } = useToast();
  const notifyTouched = useCallback(() => {
    if (!onTouched) {
      return;
    }
    const runner = () => {
      onTouched();
    };
    setTimeout(runner, 0);
  }, [onTouched]);

  const handleValueChange = useCallback((nextValue: number | undefined) => {
    onChange(nextValue);
    notifyTouched();
  }, [notifyTouched, onChange]);

  useEffect(() => {
    if (!enabled || !loadError) {
      return;
    }
    showException('Failed to load shopping lists', loadError);
  }, [enabled, loadError, showException]);

  useEffect(() => {
    if (!pendingCreatedOption) {
      return;
    }
    const existsInQuery = queryOptions.some((option) => option.id === pendingCreatedOption.id);
    if (existsInQuery) {
// eslint-disable-next-line react-hooks/set-state-in-effect -- Clear pending optimistic option once confirmed in query results
      setPendingCreatedOption(null);
    }
  }, [pendingCreatedOption, queryOptions]);

  const combinedOptions = useMemo<ShoppingListOption[]>(() => {
    if (pendingCreatedOption && !queryOptions.some(option => option.id === pendingCreatedOption.id)) {
      return [...queryOptions, pendingCreatedOption];
    }
    return queryOptions;
  }, [pendingCreatedOption, queryOptions]);

  const createdOption = useMemo<ShoppingListOption | undefined>(() => {
    if (!pendingCreatedOption) {
      return undefined;
    }
    return combinedOptions.find(option => option.id === pendingCreatedOption.id);
  }, [combinedOptions, pendingCreatedOption]);

  const filteredOptions = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) {
      return combinedOptions;
    }
    return combinedOptions.filter((option) => option.name.toLowerCase().includes(term));
  }, [combinedOptions, searchTerm]);

  const canCreateLists = enableCreate && normalizedStatuses.includes('concept');
  const trimmedSearchTerm = searchTerm.trim();
  const hasOptions = combinedOptions.length > 0;

  useEffect(() => {
    if (!canCreateLists && createDialogOpen) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Close dialog when create capability is disabled
      setCreateDialogOpen(false);
    }
  }, [canCreateLists, createDialogOpen]);

  const renderOption = useCallback((option: ShoppingListOption) => (
    <div className="flex flex-col">
      <span className="font-medium">{option.name}</span>
      <span className="text-xs text-muted-foreground">{formatOptionMetadata(option)}</span>
    </div>
  ), []);

  const handleCreateNew = useCallback((term: string) => {
    if (!canCreateLists) {
      return;
    }
    setSearchTerm(term);
    setCreateDialogOpen(true);
  }, [canCreateLists]);

  const handleDialogOpenChange = useCallback((nextOpen: boolean) => {
    setCreateDialogOpen(nextOpen);
  }, []);

  const handleListCreated = useCallback((payload: { id: number; name: string }) => {
    const normalizedName = payload.name.trim();
    // Guidepost: add optimistic option so the selector can resolve before React Query refetch finishes.
    const optimisticOption: ShoppingListOption = {
      id: payload.id,
      name: normalizedName,
      status: 'concept',
      lineCounts: { new: 0, ordered: 0, done: 0 },
    };

    setPendingCreatedOption(optimisticOption);
    handleValueChange(payload.id);
    // Guidepost: delay search term sync until we confirm React Query saw the created list.
    setSearchTerm(normalizedName);
    setCreateDialogOpen(false);
    void refetch();
    onListCreated?.({ id: payload.id, name: normalizedName });
  }, [handleValueChange, onListCreated, refetch]);

  const {
    scope,
    getReadyMetadata,
    getErrorMetadata,
    getAbortedMetadata,
  } = instrumentation;

  const readyMetadataBuilder = useCallback(() => {
    const base = {
      optionCount: combinedOptions.length,
      filteredCount: filteredOptions.length,
      searchTerm: trimmedSearchTerm || null,
      statuses: normalizedStatuses,
    };
    const extra = getReadyMetadata?.({
      options: combinedOptions,
      searchTerm: trimmedSearchTerm,
      statuses: normalizedStatuses,
    });
    return extra ? { ...base, ...extra } : base;
  }, [combinedOptions, filteredOptions.length, getReadyMetadata, normalizedStatuses, trimmedSearchTerm]);

  const errorMetadataBuilder = useCallback((err: unknown) => {
    const base = {
      searchTerm: trimmedSearchTerm || null,
      statuses: normalizedStatuses,
    };
    const extra = getErrorMetadata?.(err);
    return extra ? { ...base, ...extra } : base;
  }, [getErrorMetadata, normalizedStatuses, trimmedSearchTerm]);

  const abortedMetadataBuilder = useCallback(() => {
    return getAbortedMetadata?.();
  }, [getAbortedMetadata]);

  // Guidepost: surface deterministic list loading test events for Playwright waits.
  useListLoadingInstrumentation({
    scope,
    isLoading,
    isFetching,
    error: loadError,
    getReadyMetadata: readyMetadataBuilder,
    getErrorMetadata: errorMetadataBuilder,
    getAbortedMetadata: abortedMetadataBuilder,
  });

  useEffect(() => {
    if (!createdOption) {
      return;
    }
    const isSelected = value === createdOption.id;
    const matchesSearch = searchTerm.trim().toLowerCase() === createdOption.name.toLowerCase();
    if (isSelected && !matchesSearch) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Sync search term with selected created option name
      setSearchTerm(createdOption.name);
    }
  }, [createdOption, searchTerm, setSearchTerm, value]);

  const loadErrorMessage = loadError
    ? (loadError instanceof Error ? loadError.message : 'Failed to load shopping lists')
    : null;
  const showInlineError = Boolean(loadErrorMessage);

  const resolvedInputProps = inputProps ? { ...inputProps } : {};

  return (
    <div className={className} data-testid="shopping-lists.selector">
      <SearchableSelect<number, ShoppingListOption>
        value={value}
        onChange={handleValueChange}
        placeholder={placeholder}
        error={fieldError}
        options={filteredOptions}
        isLoading={isLoading || isFetching}
        searchTerm={searchTerm}
        onSearchChange={setSearchTerm}
        renderOption={renderOption}
        enableInlineCreate={canCreateLists}
        onCreateNew={canCreateLists ? handleCreateNew : undefined}
        createNewLabel={(term) => (term ? `Create list "${term}"` : 'Create new list')}
        loadingText="Loading shopping lists..."
        noResultsText={canCreateLists ? 'No lists match. Create a new concept list?' : 'No lists match.'}
        disabled={disabled}
        onPopoverWheelCapture={onPopoverWheelCapture}
        {...resolvedInputProps}
      />

      {showInlineError && (
        <p className="mt-2 text-sm text-destructive" data-testid="shopping-lists.selector.error">
          {loadErrorMessage}
        </p>
      )}

      {!hasOptions && !isLoading && !isFetching && !showInlineError && emptyState}

      {canCreateLists && (
        <ListCreateDialog
          open={createDialogOpen}
          onOpenChange={handleDialogOpenChange}
          onCreated={handleListCreated}
          initialName={trimmedSearchTerm}
        />
      )}
    </div>
  );
}
